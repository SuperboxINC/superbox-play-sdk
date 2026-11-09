import type { SafeArea, SBPlay, SBPlayLoading, SessionInfo } from '@superbox-play/sdk';
import type { LoaderFileLike, LoaderLike, PhaserGameLike, PhaserSceneLike, PluginManagerLike } from './phaser-like.ts';
import { createProgressMixer } from './progress-mixer.ts';
import { toGameInsets } from './safe-area.ts';
import { showUpdateNotice, type UpdateNoticeWindow } from './update-notice.ts';

/**
 * Phaser 전역 플러그인 — 3.60 이상과 4 에서 그대로 돈다(둘 다 실제로 돌려 시험한다).
 * Phaser 를 import 하지 않는다: 플러그인 관리자는 `new plugin(pluginManager)` · `init(data)` · `start()` 만 부르므로
 * BasePlugin 을 상속할 까닭이 없고, 상속하면 어느 Phaser 번들을 쓰는지 묶이게 된다.
 *
 * 게임 설정: `plugins: { global: [superboxPlayPlugin()] }` → 씬에서 `this.sbplay`.
 */
export const SUPERBOX_PLAY_PLUGIN_KEY = 'SuperboxPlay';
export const SUPERBOX_PLAY_MAPPING = 'sbplay';

/** `game.events` 로 내는 게임 이벤트. */
export const SBPLAY_EVENTS = {
  /** 게임존이 일시정지시켰다 — data `{ reason }`. 루프 · 소리는 플러그인이 이미 멈췄다. */
  PAUSE: 'sbplay.pause',
  RESUME: 'sbplay.resume',
  /** 안전 영역이나 캔버스 크기가 바뀌었다 — data 는 CSS 픽셀 `{ top, bottom, left, right }`. 씬 좌표는 `gameSafeArea` 로 읽는다. */
  SAFE_AREA: 'sbplay.safearea',
  /** 플레이어가 바뀌었다 — data = 새 SessionInfo. */
  SESSION: 'sbplay.session',
} as const;

export interface SuperboxPlayOptions {
  /** 시작 때 `SBPlay.init()` 을 부른다. 기본 true. */
  readonly autoInit?: boolean;
  /** 첫 씬이 뜨면 로딩 화면을 닫는다. 기본 true — 게임이 직접 닫으려면 false 로 두고 `this.sbplay.loading.complete()`. */
  readonly autoComplete?: boolean;
  /** 파일 하나를 못 받아도 게임을 그대로 띄운다. 기본 false — 오류 화면과 다시 시도를 보인다. */
  readonly ignoreLoadErrors?: boolean;
  /** 로컬에서 실행할 때 새 SDK 버전을 화면에 알린다. 기본 true — 운영 주소에서는 켜져 있어도 아무것도 하지 않는다. */
  readonly updateNotice?: boolean;
}

const ZERO_INSETS: SafeArea = { top: 0, bottom: 0, left: 0, right: 0 };
const RUNNING_STATUS = 5;
const LOADING_STATUSES = new Set([1, 2, 3, 4]); // INIT · START · LOADING · CREATING
/** 첫 씬의 첫 화면이 실제로 그려진 뒤 닫는다. */
const FRAMES_BEFORE_COMPLETE = 2;

interface PlayWindow {
  readonly SBPlay?: SBPlay;
  readonly SBPlayLoading?: SBPlayLoading;
  readonly innerWidth?: number;
  readonly innerHeight?: number;
}

function notConnected(): Error & { code: string } {
  return Object.assign(new Error('Play SDK가 없어요'), { code: 'NOT_CONNECTED' });
}

/** SDK 태그가 실패해도 게임이 죽지 않게 — 부르면 NOT_CONNECTED 로 거절한다. */
function missingSdk(): SBPlay {
  const reject = (): Promise<never> => Promise.reject(notConnected());
  const handler: ProxyHandler<object> = {
    get: (_target, property) => (property === 'then' ? undefined : new Proxy(reject, handler)),
  };
  return new Proxy({}, handler) as SBPlay;
}

export class SuperboxPlayPlugin {
  readonly pluginManager: PluginManagerLike;
  readonly game: PhaserGameLike;
  /** `SBPlay.init()` 이 끝나면 풀린다. SDK 가 없거나 실패하면 null. */
  ready: Promise<SessionInfo | null> = Promise.resolve(null);
  session: SessionInfo | null = null;
  safeArea: SafeArea = ZERO_INSETS;

  #options: SuperboxPlayOptions = {};
  #started = false;
  #mixer = createProgressMixer();
  #scenes = new WeakSet<object>();
  #loaders = new WeakSet<object>();
  #failedLoad = false;
  #sawFirstScene = false;
  #framesSinceScene = 0;
  #done = false;
  #pausedByPlatform = false;
  #soundsToResume: readonly { resume(): unknown }[] = [];
  #resumeAllSounds = false;

  constructor(pluginManager: PluginManagerLike) {
    this.pluginManager = pluginManager;
    this.game = pluginManager.game;
  }

  /** 플러그인 관리자가 부른다 — data 는 `plugins.global[].data`. */
  init(data?: SuperboxPlayOptions | null): void {
    this.#options = data ?? {};
    // 게임 생성 시점이라 window.load 전이다 — 부트 런타임의 자동 닫기를 여기서 가져온다
    const loading = this.loading;
    if (loading) loading.autoComplete = false;
  }

  /** 플러그인 관리자가 부른다. 다시 불려도 한 번만 건다. */
  start(): void {
    if (this.#started) return;
    this.#started = true;
    const { events } = this.game;
    events.on('prestep', this.#scanScenes, this);
    events.on('postrender', this.#checkFirstFrame, this);
    if (this.#options.updateNotice !== false) void showUpdateNotice(globalThis as unknown as UpdateNoticeWindow);

    const sdk = this.#playWindow().SBPlay;
    if (!sdk) return;
    sdk.on('app.pause', this.#onPause);
    sdk.on('app.resume', this.#onResume);
    sdk.on('safeArea.change', this.#onSafeArea);
    sdk.on('session.changed', this.#onSessionChanged);
    this.game.scale?.on('resize', this.#onCanvasResize);
    if (this.#options.autoInit !== false) this.ready = this.#initSession(sdk);
  }

  stop(): void {
    if (!this.#started) return;
    this.#started = false;
    const { events } = this.game;
    events.off('prestep', this.#scanScenes, this);
    events.off('postrender', this.#checkFirstFrame, this);
    this.game.scale?.off('resize', this.#onCanvasResize);
    const sdk = this.#playWindow().SBPlay;
    sdk?.off('app.pause', this.#onPause);
    sdk?.off('app.resume', this.#onResume);
    sdk?.off('safeArea.change', this.#onSafeArea);
    sdk?.off('session.changed', this.#onSessionChanged);
  }

  destroy(): void {
    this.stop();
  }

  /** 전역 SBPlay — 없으면 부를 때 NOT_CONNECTED 로 거절하는 대체. */
  get sdk(): SBPlay {
    return this.#playWindow().SBPlay ?? missingSdk();
  }

  get loading(): SBPlayLoading | null {
    const win = this.#playWindow();
    return win.SBPlayLoading ?? win.SBPlay?.loading ?? null;
  }

  /** `safeArea` 를 씬 좌표로 — 캔버스가 틀과 어긋난 만큼(FIT · ENVELOP)은 이미 뺐다. 스케일 관리자가 없으면 CSS 픽셀 그대로. */
  get gameSafeArea(): SafeArea {
    const { scale } = this.game;
    if (!scale) return this.safeArea;
    const { canvasBounds: canvas, displayScale } = scale;
    const win = this.#playWindow();
    const viewport = { width: win.innerWidth ?? canvas.x + canvas.width, height: win.innerHeight ?? canvas.y + canvas.height };
    return toGameInsets(this.safeArea, canvas, displayScale, viewport);
  }

  get call(): SBPlay['call'] {
    return (method, params) => this.sdk.call(method, params);
  }

  get ads(): SBPlay['ads'] {
    return this.sdk.ads;
  }
  get store(): SBPlay['store'] {
    return this.sdk.store;
  }
  get auth(): SBPlay['auth'] {
    return this.sdk.auth;
  }
  get social(): SBPlay['social'] {
    return this.sdk.social;
  }
  get analytics(): SBPlay['analytics'] {
    return this.sdk.analytics;
  }
  get screen(): SBPlay['screen'] {
    return this.sdk.screen;
  }
  get missions(): SBPlay['missions'] {
    return this.sdk.missions;
  }
  get points(): SBPlay['points'] {
    return this.sdk.points;
  }
  get nav(): SBPlay['nav'] {
    return this.sdk.nav;
  }
  get haptic(): SBPlay['haptic'] {
    return (strength) => this.sdk.haptic(strength);
  }
  get on(): SBPlay['on'] {
    return (event, listener) => this.sdk.on(event, listener);
  }
  get off(): SBPlay['off'] {
    return (event, listener) => this.sdk.off(event, listener);
  }

  #playWindow(): PlayWindow {
    return globalThis as unknown as PlayWindow;
  }

  async #initSession(sdk: SBPlay): Promise<SessionInfo | null> {
    try {
      const session = await sdk.init();
      this.session = session;
      this.safeArea = session.safeArea ?? ZERO_INSETS;
      return session;
    } catch (error) {
      console.warn('[superbox-play] SBPlay.init 실패', error);
      return null;
    }
  }

  /** 씬 목록을 프레임마다 훑어 처음 보는 씬에 건다 — 나중에 더한 씬(Boot → Preload)도 잡는다. 첫 화면을 닫으면 멈춘다. */
  #scanScenes(): void {
    for (const scene of this.game.scene.scenes) this.#watchScene(scene);
  }

  #watchScene(scene: PhaserSceneLike): void {
    if (this.#scenes.has(scene)) return;
    const sys = scene.sys;
    if (!sys?.events) return;
    this.#scenes.add(scene);
    if (sys.load) this.#watchLoader(sys.load);
    // 로더가 비어 있는 씬은 첫 prestep 전에 이미 create 까지 끝났을 수 있다
    if ((sys.settings?.status ?? 0) >= RUNNING_STATUS) this.#markSceneCreated();
    else sys.events.once('create', this.#markSceneCreated, this);
  }

  #watchLoader(loader: LoaderLike): void {
    if (this.#loaders.has(loader)) return;
    this.#loaders.add(loader);
    let started = false;
    const report = (fraction: number): void => {
      if (this.#done) return;
      if (!started) {
        started = true;
        this.#mixer.startLoader(loader.totalToLoad ?? 1);
      }
      this.loading?.progress(this.#mixer.update(fraction));
    };
    loader.on('progress', (fraction: number) => report(fraction));
    loader.on('fileprogress', (file: LoaderFileLike) => {
      const total = loader.totalToLoad ?? 0;
      if (total > 0) report(((loader.totalComplete ?? 0) + (file.percentComplete ?? 0)) / total);
    });
    loader.on('complete', () => {
      if (!started) return;
      started = false;
      this.#mixer.endLoader();
    });
    loader.on('loaderror', (file: LoaderFileLike) => {
      if (this.#done) return;
      const name = file.key ?? file.src ?? 'unknown';
      if (this.#options.ignoreLoadErrors) {
        console.warn('[superbox-play] 파일을 불러오지 못했어요', name);
        return;
      }
      this.#failedLoad = true;
      this.loading?.error(`파일을 불러오지 못했어요: ${name}`);
    });
  }

  #markSceneCreated(): void {
    this.#sawFirstScene = true;
    this.#framesSinceScene = 0;
  }

  /** create 뒤 프레임이 그려졌고 이어서 불러오는 씬이 없으면(Boot → Preload) 닫는다. */
  #checkFirstFrame(): void {
    if (this.#done || !this.#sawFirstScene) return;
    this.#framesSinceScene += 1;
    if (this.#framesSinceScene < FRAMES_BEFORE_COMPLETE) return;
    if (this.#anySceneLoading()) {
      this.#framesSinceScene = 0;
      return;
    }
    this.#done = true;
    const { events } = this.game;
    events.off('prestep', this.#scanScenes, this);
    events.off('postrender', this.#checkFirstFrame, this);
    if (this.#options.autoComplete === false || this.#failedLoad) return;
    this.loading?.complete();
  }

  #anySceneLoading(): boolean {
    return this.game.scene.scenes.some((scene) => {
      const status = scene.sys?.settings?.status ?? 0;
      return LOADING_STATUSES.has(status) || scene.sys?.load?.isLoading?.() === true;
    });
  }

  #onPause = (data: { reason?: string }): void => {
    if (this.#pausedByPlatform) return;
    const { game } = this;
    // 게임이 스스로 멈춘 상태면 다시 시작할 때도 건드리지 않는다
    this.#pausedByPlatform = !game.isPaused;
    if (this.#pausedByPlatform) game.pause();
    this.#pauseSounds();
    game.events.emit(SBPLAY_EVENTS.PAUSE, data);
  };

  #onResume = (): void => {
    const { game } = this;
    if (this.#pausedByPlatform) game.resume();
    this.#pausedByPlatform = false;
    this.#resumeSounds();
    game.events.emit(SBPLAY_EVENTS.RESUME);
  };

  /** 지금 울리는 소리만 멈춘다 — resumeAll 은 게임이 일부러 멈춘 소리까지 되살린다. */
  #pauseSounds(): void {
    const { sound } = this.game;
    if (!sound) return;
    if (typeof sound.getAllPlaying === 'function') {
      const playing = sound.getAllPlaying();
      for (const item of playing) item.pause();
      this.#soundsToResume = [...this.#soundsToResume, ...playing];
      return;
    }
    sound.pauseAll?.();
    this.#resumeAllSounds = true;
  }

  #resumeSounds(): void {
    const { sound } = this.game;
    for (const item of this.#soundsToResume) item.resume();
    this.#soundsToResume = [];
    if (this.#resumeAllSounds) sound?.resumeAll?.();
    this.#resumeAllSounds = false;
  }

  #onSafeArea = (insets: SafeArea): void => {
    this.safeArea = insets;
    this.game.events.emit(SBPLAY_EVENTS.SAFE_AREA, insets);
  };

  /** 안전 영역 알림과 캔버스 크기 변화의 순서는 정해져 있지 않다 — 크기가 바뀐 뒤에도 알려 게임이 마지막 값으로 맞추게 한다. */
  #onCanvasResize = (): void => {
    this.game.events.emit(SBPLAY_EVENTS.SAFE_AREA, this.safeArea);
  };

  #onSessionChanged = (): void => {
    const sdk = this.#playWindow().SBPlay;
    if (!sdk) return;
    this.ready = this.#initSession(sdk).then((session) => {
      this.game.events.emit(SBPLAY_EVENTS.SESSION, session);
      return session;
    });
  };
}

/** `plugins.global` 에 넣을 항목. */
export function superboxPlayPlugin(data?: SuperboxPlayOptions): {
  readonly key: string;
  readonly plugin: typeof SuperboxPlayPlugin;
  readonly start: true;
  readonly mapping: string;
  readonly data: SuperboxPlayOptions;
} {
  return { key: SUPERBOX_PLAY_PLUGIN_KEY, plugin: SuperboxPlayPlugin, start: true, mapping: SUPERBOX_PLAY_MAPPING, data: data ?? {} };
}
