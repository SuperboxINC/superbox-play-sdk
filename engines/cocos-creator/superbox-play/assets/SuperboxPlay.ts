import { AudioSource, director, Director, game } from 'cc';
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

export interface SuperboxSession {
  readonly environment: 'live' | 'sandbox' | 'standalone';
  readonly player: { readonly key: string; readonly displayName: string; readonly linked: boolean };
  readonly features: {
    readonly ads: { readonly rewarded: boolean; readonly interstitial: boolean; readonly banner: boolean };
    readonly purchases: boolean;
    readonly missions: boolean;
    readonly points: boolean;
  };
  readonly safeArea: SuperboxSafeArea;
  readonly locale: string;
}

export interface SuperboxPurchase {
  readonly status: 'paid' | 'canceled' | 'pending' | 'failed';
  readonly orderId: string;
  readonly productKey: string;
  readonly simulated: boolean;
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
}

interface PlayGlobal {
  readonly SBPlay?: PlaySdk;
  readonly SBPlayLoading?: LoadingApi;
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

function call<T>(method: string, params?: Record<string, unknown>): Promise<T> {
  const target = sdk();
  if (!target) return Promise.reject(Object.assign(new Error('Play SDK 가 없습니다'), { code: 'NOT_CONNECTED' }));
  return target.call(method, params) as Promise<T>;
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

export const SuperboxPlay = {
  get session(): SuperboxSession | null {
    return sdk()?.session ?? null;
  },
  get loading(): LoadingApi | null {
    return loading();
  },

  /** 게임존과 연결하고 세션을 받는다. SDK 가 없으면 null. */
  init(): Promise<SuperboxSession | null> {
    return sdk()?.init() ?? Promise.resolve(null);
  },
  on(event: string, listener: Listener): void {
    sdk()?.on(event, listener);
  },
  off(event: string, listener: Listener): void {
    sdk()?.off(event, listener);
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
    products: () => call<{ products: readonly unknown[] }>('store.products'),
    purchase: (productKey: string) => call<SuperboxPurchase>('store.purchase', { productKey }),
    pendingOrders: () => call<{ orders: readonly SuperboxPurchase[] }>('store.pendingOrders'),
    completeOrder: (orderId: string) => call<{ completed: boolean }>('store.completeOrder', { orderId }),
  },
  auth: {
    login: () => call<{ loggedIn: boolean; key: string; displayName: string; linked: boolean }>('auth.login'),
  },
  social: {
    share: (text: string, url?: string) => call<{ shared: boolean }>('social.share', url ? { text, url } : { text }),
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
}
