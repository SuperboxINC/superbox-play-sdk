import { AudioSource, director, Director, game, screen, view } from 'cc';
import { EDITOR } from 'cc/env';

/**
 * Cocos Creator 런타임 조각 — 게임 코드에서 `import { SuperboxPlay } from 'db://superbox-play/SuperboxPlay'`.
 *
 * 이 파일을 import 하면 첫 씬 로드 진행률이 로딩 화면으로 이어지고, `app.pause` 에 `game.pause()` 가 걸린다.
 * 첫 씬은 엔진이 진행률 없이 `director.loadScene` 으로 부른다 — 같은 씬을 `preloadScene` 으로 같이 불러 진행률을 얻는다(공식 문서:
 * 프리로드 중에 loadScene 을 불러도 된다, 내려받기는 겹치지 않는다).
 *
 * 전역 `SBPlay` · `SBPlayLoading` 은 패키징한 입구가 넣어 준다. 에디터 미리 보기처럼 없을 때는 부르면 NOT_CONNECTED 로 거절하고 게임은 그대로 돈다.
 */
export interface SuperboxSafeArea {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

export interface SuperboxFeatures {
  readonly ads: { readonly rewarded: boolean; readonly interstitial: boolean; readonly banner: boolean };
  readonly purchases: boolean;
  readonly share: boolean;
  readonly haptic: boolean;
  readonly externalLinks: boolean;
  readonly leaderboard: boolean;
  readonly analytics: boolean;
  readonly missions: boolean;
  readonly points: boolean;
}

export interface SuperboxSession {
  readonly protocol: 1;
  readonly environment: 'live' | 'sandbox' | 'standalone';
  readonly player: { readonly key: string; readonly displayName: string; readonly linked: boolean };
  readonly features: SuperboxFeatures;
  readonly safeArea: SuperboxSafeArea;
  readonly locale: string;
}

export interface SuperboxProduct {
  readonly key: string;
  readonly title: string;
  readonly type: 'consumable' | 'non_consumable' | 'subscription';
  readonly price: { readonly amount: number; readonly currency: string; readonly label: string };
  /** 구독만 — 갱신 주기 */
  readonly renewalPeriod?: 'weekly' | 'monthly' | 'yearly';
  /** 구독만 — 무료 체험('' 없음) */
  readonly freeTrial?: '' | '3d' | '1w' | '2w' | '1m';
}

/** 이 플레이어의 이 게임 구독 — 이용권은 `accessible` 만 보고 연다. */
export interface SuperboxSubscription {
  readonly productKey: string;
  readonly orderId: string;
  readonly status: 'active' | 'canceled' | 'expired' | 'revoked';
  readonly accessible: boolean;
  readonly expiresDate: string;
  readonly autoRenew: boolean;
  readonly isTrial: boolean;
  readonly renewalPeriod: string;
}

export interface SuperboxPurchase {
  readonly status: 'paid' | 'canceled' | 'pending' | 'failed';
  readonly orderId: string;
  readonly productKey: string;
  readonly simulated: boolean;
}

/** `store.purchase` 의 두 번째 인자 — 아이템을 지급하고 true 를 돌려주면 지급 확인(completeOrder)까지 부른다. false · 오류면 다음 실행 때 pendingOrders 로 다시 온다. */
export interface SuperboxPurchaseOptions {
  readonly grant: (order: SuperboxPurchase) => boolean | Promise<boolean>;
}

export interface SuperboxGrantedPurchase extends SuperboxPurchase {
  /** 지급 확인까지 끝났다 */
  readonly completed: boolean;
}

export interface SuperboxPendingOrder {
  readonly orderId: string;
  readonly productKey: string;
  readonly status: SuperboxPurchase['status'];
  readonly simulated?: boolean;
}

/** `on` · `off` 로 받는 이벤트와 값. */
export interface SuperboxEvents {
  'app.pause': { readonly reason?: 'background' | 'ad' | 'payment' | 'menu' };
  'app.resume': Record<string, never>;
  'safeArea.change': SuperboxSafeArea;
  'session.changed': Record<string, never>;
}

type Listener = (data: Record<string, unknown>) => void;

interface LoadingApi {
  autoComplete: boolean;
  progress(value: number): void;
  complete(): void;
  error(message: unknown): void;
}

interface PlaySdk {
  readonly session: SuperboxSession | null;
  readonly loading: LoadingApi;
  init(): Promise<SuperboxSession>;
  call(method: string, params?: Record<string, unknown>): Promise<unknown>;
  on(event: string, listener: Listener): void;
  off(event: string, listener: Listener): void;
  readonly store: { purchase(productKey: string, options: SuperboxPurchaseOptions): Promise<unknown> };
}

interface PlayGlobal {
  readonly SBPlay?: PlaySdk;
  readonly SBPlayLoading?: LoadingApi;
  readonly innerWidth: number;
  readonly innerHeight: number;
}

/** 조각이 불린 시점 — 엔진과 프로젝트 스크립트까지 받은 뒤다. */
const ENGINE_LOADED_PROGRESS = 0.3;
/** 첫 씬까지 — 나머지는 complete 가 채운다. */
const SCENE_LOADED_PROGRESS = 0.95;

const playGlobal = globalThis as unknown as PlayGlobal;

function sdk(): PlaySdk | null {
  return playGlobal.SBPlay ?? null;
}

function loading(): LoadingApi | null {
  return playGlobal.SBPlayLoading ?? playGlobal.SBPlay?.loading ?? null;
}

function notConnected(): Promise<never> {
  return Promise.reject(Object.assign(new Error('Play SDK가 없어요'), { code: 'NOT_CONNECTED' }));
}

function call<T>(method: string, params?: Record<string, unknown>): Promise<T> {
  const target = sdk();
  if (!target) return notConnected();
  return target.call(method, params) as Promise<T>;
}

/** grant 를 넘기면 결제 → 지급 → 지급 확인을 전역 SBPlay 가 잇는다(결과에 completed). 없으면 결제 결과 그대로 */
function purchase(productKey: string): Promise<SuperboxPurchase>;
function purchase(productKey: string, options: SuperboxPurchaseOptions): Promise<SuperboxGrantedPurchase>;
function purchase(productKey: string, options?: SuperboxPurchaseOptions): Promise<SuperboxPurchase> {
  if (!options) return call<SuperboxPurchase>('store.purchase', { productKey });
  const target = sdk();
  if (!target) return notConnected();
  return target.store.purchase(productKey, options) as Promise<SuperboxGrantedPurchase>;
}

function withGroup(params: Record<string, unknown>, adGroupId?: string): Record<string, unknown> {
  return adGroupId ? { ...params, adGroupId } : params;
}

let holdLoading = false;
let progressBase = ENGINE_LOADED_PROGRESS;
let lastProgress = 0;

function reportOverall(value: number): void {
  lastProgress = Math.max(lastProgress, value);
  loading()?.progress(lastProgress);
}

const ZERO_INSETS: SuperboxSafeArea = { top: 0, bottom: 0, left: 0, right: 0 };
let currentSafeArea = ZERO_INSETS;
const safeAreaWatchers = new Set<() => void>();

/** 네 변이 다 숫자일 때만 받는다 — 일부만 온 값이 나머지 변을 0 으로 만들면 안 된다. */
function readInsets(value: unknown): SuperboxSafeArea | null {
  const { top, bottom, left, right } = (value ?? {}) as Partial<Record<keyof SuperboxSafeArea, unknown>>;
  return typeof top === 'number' && typeof bottom === 'number' && typeof left === 'number' && typeof right === 'number' ? { top, bottom, left, right } : null;
}

function updateSafeArea(value: unknown): void {
  const insets = readInsets(value);
  if (!insets) return;
  currentSafeArea = insets;
  for (const notify of [...safeAreaWatchers]) notify();
}

/**
 * CSS 픽셀 한 변 → 디자인 좌표. 엔진의 view 스케일 · 뷰포트는 물리 픽셀이다(screen.windowSize = CSS × devicePixelRatio, 엔진이 2 로 자른다).
 * 캔버스 바깥 여백만큼은 게임을 가리지 않고, 뒤의 식은 엔진의 view._convertToUISpace 와 같다 — 레터박스(양수 뷰포트)는 그만큼 덜 가리고,
 * 잘라 채우는 정책(NO_BORDER, 음수 뷰포트)은 visibleRect 가 잘린 부분까지 포함해 Widget 이 화면 밖에 붙으므로 잘린 만큼 더 들어와야 한다.
 */
function sideInDesign(inset: number, canvasGap: number, viewportOffset: number, scale: number): number {
  return Math.max(0, Math.max(0, inset - canvasGap) * screen.devicePixelRatio - viewportOffset) / scale;
}

function toDesignInsets(insets: SuperboxSafeArea): SuperboxSafeArea {
  const canvas = game.canvas;
  const scaleX = view.getScaleX();
  const scaleY = view.getScaleY();
  if (!canvas || !(scaleX > 0) || !(scaleY > 0)) return ZERO_INSETS;
  const box = canvas.getBoundingClientRect();
  const viewport = view.getViewportRect();
  return {
    top: sideInDesign(insets.top, box.top, viewport.y, scaleY),
    bottom: sideInDesign(insets.bottom, playGlobal.innerHeight - box.bottom, viewport.y, scaleY),
    left: sideInDesign(insets.left, box.left, viewport.x, scaleX),
    right: sideInDesign(insets.right, playGlobal.innerWidth - box.right, viewport.x, scaleX),
  };
}

export const SuperboxPlay = {
  get session(): SuperboxSession | null {
    return sdk()?.session ?? null;
  },
  get loading(): LoadingApi | null {
    return loading();
  },
  /** 지금 안전 영역 — 게임 틀 기준 CSS 픽셀. `init` 전에는 0. */
  get safeArea(): SuperboxSafeArea {
    return currentSafeArea;
  },
  /** 지금 안전 영역을 디자인 좌표로 — Widget 여백 · 노드 좌표에 바로 쓴다. */
  get designSafeArea(): SuperboxSafeArea {
    return toDesignInsets(currentSafeArea);
  },

  /** 게임존과 연결하고 세션을 받는다. SDK 가 없으면 null. */
  init(): Promise<SuperboxSession | null> {
    const target = sdk();
    if (!target) return Promise.resolve(null);
    return target.init().then((session) => {
      updateSafeArea(session.safeArea);
      return session;
    });
  },
  on<E extends keyof SuperboxEvents>(event: E, listener: (data: SuperboxEvents[E]) => void): void {
    sdk()?.on(event, listener as unknown as Listener);
  },
  off<E extends keyof SuperboxEvents>(event: E, listener: (data: SuperboxEvents[E]) => void): void {
    sdk()?.off(event, listener as unknown as Listener);
  },
  /** 안전 영역이나 화면 크기가 바뀔 때마다 디자인 좌표로 알린다. 등록하면 지금 값으로 한 번 바로 부른다. 돌려준 함수를 부르면 그만둔다. */
  watchSafeArea(listener: (insets: SuperboxSafeArea) => void): () => void {
    const notify = (): void => listener(toDesignInsets(currentSafeArea));
    safeAreaWatchers.add(notify);
    // 창 크기가 바뀌어도, 게임이 설계 해상도를 바꿔도 이 이벤트를 지난다
    view.on('design-resolution-changed', notify);
    notify();
    return () => {
      safeAreaWatchers.delete(notify);
      view.off('design-resolution-changed', notify);
    };
  },
  call,

  ads: {
    load: (format: 'rewarded' | 'interstitial', adGroupId?: string) => call<{ ready: boolean }>('ads.load', withGroup({ format }, adGroupId)),
    showRewarded: (placement: string, adGroupId?: string) =>
      call<{ shown: boolean; rewarded: boolean }>('ads.show', withGroup({ format: 'rewarded', placement }, adGroupId)),
    showInterstitial: (placement: string, adGroupId?: string) =>
      call<{ shown: boolean; rewarded: boolean }>('ads.show', withGroup({ format: 'interstitial', placement }, adGroupId)),
    banner: (action: 'show' | 'hide' | 'destroy', adGroupId?: string) => call<{ visible: boolean; heightPx: number }>('ads.banner', withGroup({ action }, adGroupId)),
  },
  store: {
    products: () => call<{ products: readonly SuperboxProduct[] }>('store.products'),
    purchase,
    pendingOrders: () => call<{ orders: readonly SuperboxPendingOrder[] }>('store.pendingOrders'),
    completeOrder: (orderId: string) => call<{ completed: boolean }>('store.completeOrder', { orderId }),
    subscriptions: () => call<{ subscriptions: readonly SuperboxSubscription[] }>('store.subscriptions'),
  },
  auth: {
    login: () => call<{ loggedIn: boolean; key: string; displayName: string; linked: boolean }>('auth.login'),
    serverAuthCode: () => call<{ provider: 'superbox-play'; code: string; expiresInSeconds: number }>('auth.serverAuthCode'),
  },
  social: {
    share: (text: string, url?: string) => call<{ shared: boolean }>('social.share', url ? { text, url } : { text }),
    shareLink: (path: string) => call<{ url: string }>('social.shareLink', { path }),
    openUrl: (url: string) => call<Record<string, never>>('social.openUrl', { url }),
  },
  analytics: {
    track: (name: string, params?: Record<string, unknown>) => call<Record<string, never>>('analytics.track', params ? { name, params } : { name }),
  },
  haptic: (strength: 'light' | 'medium' | 'heavy' = 'light') => call<Record<string, never>>('haptic', { strength }),
  screen: {
    safeArea: () => call<SuperboxSafeArea>('screen.safeArea'),
    setOrientation: (orientation: 'portrait' | 'landscape') => call<{ applied: boolean }>('screen.setOrientation', { orientation }),
  },
  missions: {
    track: (event: string, value?: number) => call<{ accepted: boolean }>('missions.track', value === undefined ? { event } : { event, value }),
  },
  points: {
    balance: () => call<{ balance: number; unit: string }>('points.balance'),
  },
  nav: {
    exit: () => call<Record<string, never>>('nav.exit'),
  },

  /** 첫 씬이 떠도 로딩 화면을 닫지 않는다 — 씬에서 자원을 더 받는 게임이 모듈 맨 위에서 부른다. 끝나면 completeLoading. */
  holdLoading(): void {
    holdLoading = true;
  },
  /** 씬 뒤 자원 로드 진행 — `resources.load` 의 (finished, total) 을 그대로 넘긴다. 뒤로 가지 않는다. */
  reportProgress(finished: number, total: number): void {
    if (total > 0) reportOverall(progressBase + (SCENE_LOADED_PROGRESS - progressBase) * Math.min(1, finished / total));
  },
  completeLoading(): void {
    loading()?.complete();
  },
};

let pausedByPlatform = false;
let pausedAudio: readonly AudioSource[] = [];

function onPlatformPause(): void {
  if (pausedByPlatform) return;
  pausedByPlatform = !game.isPaused();
  if (pausedByPlatform) game.pause();
  // game.pause 는 루프만 멈춘다 — 페이지가 보이는 동안(광고 · 결제)에는 소리가 계속 난다
  const scene = director.getScene();
  pausedAudio = scene ? scene.getComponentsInChildren(AudioSource).filter((source) => source.playing) : [];
  for (const source of pausedAudio) source.pause();
}

function onPlatformResume(): void {
  if (pausedByPlatform) game.resume();
  pausedByPlatform = false;
  for (const source of pausedAudio) source.play();
  pausedAudio = [];
}

function hookFirstScene(): void {
  const target = loading();
  if (!target) return;
  target.autoComplete = false;
  reportOverall(ENGINE_LOADED_PROGRESS);

  director.once(Director.EVENT_BEFORE_SCENE_LOADING, (sceneName: string) => {
    director.preloadScene(
      sceneName,
      (finished: number, total: number) => {
        if (total > 0) reportOverall(ENGINE_LOADED_PROGRESS + (SCENE_LOADED_PROGRESS - ENGINE_LOADED_PROGRESS) * (finished / total) * 0.5);
      },
      (error: Error | null | undefined) => {
        if (error) loading()?.error(error);
      },
    );
  });
  director.once(Director.EVENT_AFTER_SCENE_LAUNCH, () => {
    progressBase = lastProgress;
    if (holdLoading) return;
    director.once(Director.EVENT_AFTER_DRAW, () => loading()?.complete());
  });
}

if (!EDITOR) {
  hookFirstScene();
  sdk()?.on('app.pause', onPlatformPause);
  sdk()?.on('app.resume', onPlatformResume);
  sdk()?.on('safeArea.change', updateSafeArea);
}
