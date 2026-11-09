import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { afterEach, describe, it } from 'node:test';
import type { SBPlay } from '../../../../packages/sdk/src/types.ts';
import { SBPLAY_WRAPPERS } from '../../../../packages/sdk/src/protocol.ts';

/**
 * 게임 코드가 쓰는 런타임 조각(assets/SuperboxPlay.ts)을 가짜 엔진 위에서 돌린다 — 실제 Creator 빌드 검증은 sdk/README 절차.
 * 안전 영역의 단위는 Cocos 3.8.8 소스 그대로다: view 의 스케일 · 뷰포트는 물리 픽셀(screen.windowSize = CSS × devicePixelRatio).
 */
type RuntimeModule = typeof import('../assets/SuperboxPlay.ts');
type Listener = (...args: unknown[]) => void;

/** 조각이 Play SDK 표면과 같은 모양인지 컴파일 때 잡는다 — init 은 SDK 가 없을 때 null 을 돌려줘서 뺐다. */
type SameSurface = Pick<SBPlay, 'ads' | 'store' | 'auth' | 'social' | 'analytics' | 'screen' | 'missions' | 'points' | 'nav' | 'haptic'>;
export const surfaceMatches = (piece: RuntimeModule['SuperboxPlay']): SameSurface => piece;

interface FakeCc {
  readonly AudioSource: new () => object;
  readonly Director: Record<string, string>;
  readonly director: {
    once(event: string, callback: Listener): void;
    getScene(): { getComponentsInChildren(): readonly { playing: boolean; pause(): void; play(): void }[] } | null;
    preloadScene(name: string, onProgress: Listener, onDone: Listener): void;
  };
  readonly game: { canvas: { getBoundingClientRect(): DOMRectLike } | null; isPaused(): boolean; pause(): void; resume(): void };
  readonly screen: { devicePixelRatio: number };
  readonly view: {
    getScaleX(): number;
    getScaleY(): number;
    getViewportRect(): { x: number; y: number };
    on(event: string, callback: Listener): void;
    off(event: string, callback: Listener): void;
  };
}

interface DOMRectLike {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

const FAKE_SOURCE = `
const cc = globalThis.__fakeCc;
export const AudioSource = cc.AudioSource;
export const Director = cc.Director;
export const director = cc.director;
export const game = cc.game;
export const screen = cc.screen;
export const view = cc.view;
`;

// 'cc' · 'cc/env' 는 Creator 가 빌드 때 만드는 모듈이라 Node 에 없다 — 불러온 쪽의 쿼리를 이어 받아 시험마다 새 가짜를 만든다
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'cc' || specifier === 'cc/env') {
      const search = context.parentURL ? new URL(context.parentURL).search : '';
      return { url: `fake-engine:${specifier}${search}`, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith('fake-engine:cc/env')) return { format: 'module', source: 'export const EDITOR = false;', shortCircuit: true };
    if (url.startsWith('fake-engine:cc')) return { format: 'module', source: FAKE_SOURCE, shortCircuit: true };
    return nextLoad(url, context);
  },
});

interface Globals {
  __fakeCc?: FakeCc;
  SBPlay?: unknown;
  SBPlayLoading?: unknown;
  innerWidth?: number;
  innerHeight?: number;
}

const globals = globalThis as unknown as Globals;

interface RigOptions {
  readonly scale?: number;
  readonly dpr?: number;
  readonly viewport?: { readonly x: number; readonly y: number };
  readonly canvas?: DOMRectLike | null;
  readonly withSdk?: boolean;
}

interface Rig {
  readonly SuperboxPlay: RuntimeModule['SuperboxPlay'];
  readonly calls: [string, unknown][];
  fire(event: string, data?: unknown): void;
  resizeCanvas(): void;
  readonly state: { paused: boolean; pauseCalls: number; resumeCalls: number; audio: { playing: boolean; pauses: number; plays: number } };
  readonly viewListeners: Map<string, Listener[]>;
}

const FULL_CANVAS: DOMRectLike = { top: 0, bottom: 844, left: 0, right: 390 };
const SESSION = { protocol: 1, environment: 'sandbox', player: { key: 'p', displayName: '', linked: false }, features: {}, safeArea: { top: 88, bottom: 34, left: 0, right: 0 }, locale: 'ko-KR' };
let caseNumber = 0;

async function rig(options: RigOptions = {}): Promise<Rig> {
  const sdkListeners = new Map<string, Listener[]>();
  const viewListeners = new Map<string, Listener[]>();
  const calls: [string, unknown][] = [];
  const state = { paused: false, pauseCalls: 0, resumeCalls: 0, audio: { playing: true, pauses: 0, plays: 0 } };
  const audio = {
    get playing() {
      return state.audio.playing;
    },
    pause() {
      state.audio.playing = false;
      state.audio.pauses += 1;
    },
    play() {
      state.audio.playing = true;
      state.audio.plays += 1;
    },
  };
  const canvasBox = options.canvas === undefined ? FULL_CANVAS : options.canvas;
  globals.__fakeCc = {
    AudioSource: class {},
    Director: { EVENT_BEFORE_SCENE_LOADING: 'before', EVENT_AFTER_SCENE_LAUNCH: 'launch', EVENT_AFTER_DRAW: 'draw' },
    director: { once: () => undefined, getScene: () => ({ getComponentsInChildren: () => [audio] }), preloadScene: () => undefined },
    game: {
      canvas: canvasBox ? { getBoundingClientRect: () => canvasBox } : null,
      isPaused: () => state.paused,
      pause() {
        state.paused = true;
        state.pauseCalls += 1;
      },
      resume() {
        state.paused = false;
        state.resumeCalls += 1;
      },
    },
    screen: { devicePixelRatio: options.dpr ?? 2 },
    view: {
      getScaleX: () => options.scale ?? 2,
      getScaleY: () => options.scale ?? 2,
      getViewportRect: () => options.viewport ?? { x: 0, y: 0 },
      on: (event, callback) => void viewListeners.set(event, [...(viewListeners.get(event) ?? []), callback]),
      off: (event, callback) =>
        void viewListeners.set(
          event,
          (viewListeners.get(event) ?? []).filter((item) => item !== callback),
        ),
    },
  };
  globals.innerWidth = 390;
  globals.innerHeight = 844;
  if (options.withSdk !== false) {
    const answer = (method: string): unknown => (method === 'store.subscriptions' ? { subscriptions: [] } : {});
    globals.SBPlay = {
      session: null,
      loading: { autoComplete: true, progress: () => undefined, complete: () => undefined, error: () => undefined },
      init: async () => SESSION,
      call: async (method: string, params: unknown) => {
        calls.push([method, params]);
        return answer(method);
      },
      on: (event: string, listener: Listener) => void sdkListeners.set(event, [...(sdkListeners.get(event) ?? []), listener]),
      off: () => undefined,
      store: { purchase: async () => ({}) },
    };
  }
  caseNumber += 1;
  const url = new URL('../assets/SuperboxPlay.ts', import.meta.url);
  url.search = `?case=${caseNumber}`;
  const { SuperboxPlay } = (await import(url.href)) as RuntimeModule;
  return {
    SuperboxPlay,
    calls,
    state,
    viewListeners,
    fire: (event, data = {}) => {
      for (const listener of sdkListeners.get(event) ?? []) listener(data);
    },
    resizeCanvas: () => {
      // 창 크기가 바뀌어도 _updateAdaptResult → setDesignResolutionSize 를 지나 이 이벤트가 온다
      for (const listener of viewListeners.get('design-resolution-changed') ?? []) listener();
    },
  };
}

afterEach(() => {
  delete globals.__fakeCc;
  delete globals.SBPlay;
  delete globals.SBPlayLoading;
  delete globals.innerWidth;
  delete globals.innerHeight;
});

function lookup(root: unknown, dotted: string): unknown {
  return dotted.split('.').reduce<unknown>((value, key) => (value as Record<string, unknown> | undefined)?.[key], root);
}

describe('SuperboxPlay surface', () => {
  it('has every SBPlay wrapper', async () => {
    const { SuperboxPlay } = await rig();
    for (const wrapper of SBPLAY_WRAPPERS) assert.equal(typeof lookup(SuperboxPlay, wrapper), 'function', wrapper);
  });

  it('sends subscriptions, the server auth code and share links over the channel', async () => {
    const { SuperboxPlay, calls } = await rig();
    await SuperboxPlay.store.subscriptions();
    await SuperboxPlay.auth.serverAuthCode();
    await SuperboxPlay.social.shareLink('/stage/3');
    assert.deepEqual(calls, [
      ['store.subscriptions', undefined],
      ['auth.serverAuthCode', undefined],
      ['social.shareLink', { path: '/stage/3' }],
    ]);
  });

  it('answers NOT_CONNECTED when there is no SDK, and the game goes on', async () => {
    const { SuperboxPlay } = await rig({ withSdk: false });
    await assert.rejects(SuperboxPlay.store.subscriptions(), { code: 'NOT_CONNECTED' });
    assert.equal(await SuperboxPlay.init(), null);
  });
});

describe('platform pause', () => {
  it('stops the loop and the playing audio, and brings back only those', async () => {
    const { fire, state } = await rig();
    fire('app.pause', { reason: 'ad' });
    assert.equal(state.pauseCalls, 1);
    assert.equal(state.audio.pauses, 1);
    fire('app.resume');
    assert.equal(state.resumeCalls, 1);
    assert.equal(state.audio.plays, 1);
  });

  it('does not double up on a repeated pause', async () => {
    const { fire, state } = await rig();
    fire('app.pause');
    fire('app.pause');
    assert.equal(state.pauseCalls, 1);
  });
});

describe('safe area', () => {
  it('starts at zero and follows init and the zone event', async () => {
    const { SuperboxPlay, fire } = await rig();
    assert.deepEqual(SuperboxPlay.safeArea, { top: 0, bottom: 0, left: 0, right: 0 });
    await SuperboxPlay.init();
    assert.deepEqual(SuperboxPlay.safeArea, SESSION.safeArea);
    fire('safeArea.change', { top: 10, bottom: 20, left: 30, right: 40 });
    assert.deepEqual(SuperboxPlay.safeArea, { top: 10, bottom: 20, left: 30, right: 40 });
  });

  it('keeps the last value when the zone sends a partial one', async () => {
    const { SuperboxPlay, fire } = await rig();
    await SuperboxPlay.init();
    fire('safeArea.change', { top: 10 });
    assert.deepEqual(SuperboxPlay.safeArea, SESSION.safeArea);
  });

  it('converts CSS pixels to design units through device pixels', async () => {
    // CSS 88 · 34 → 물리 176 · 68 → 물리 4 픽셀이 디자인 1
    const { SuperboxPlay } = await rig({ scale: 4, dpr: 2 });
    await SuperboxPlay.init();
    assert.deepEqual(SuperboxPlay.designSafeArea, { top: 44, bottom: 17, left: 0, right: 0 });
  });

  it('takes the letterbox out of what is covered', async () => {
    // 뷰포트가 위아래로 물리 40 씩 들어와 있다
    const { SuperboxPlay } = await rig({ scale: 2, dpr: 2, viewport: { x: 0, y: 40 } });
    await SuperboxPlay.init();
    assert.deepEqual(SuperboxPlay.designSafeArea, { top: 68, bottom: 14, left: 0, right: 0 });
  });

  it('counts what a cropping policy cuts off as covered', async () => {
    // NO_BORDER — 뷰포트가 창 밖으로 물리 30 씩 나가 있고 visibleRect 는 잘린 부분까지 포함한다(엔진의 _convertToUISpace 와 같은 식)
    const { SuperboxPlay } = await rig({ scale: 2, dpr: 2, viewport: { x: -30, y: -30 } });
    await SuperboxPlay.init();
    assert.deepEqual(SuperboxPlay.designSafeArea, { top: 103, bottom: 49, left: 15, right: 15 });
  });

  it('takes out the gap of a canvas that does not fill the frame', async () => {
    const { SuperboxPlay } = await rig({ scale: 2, dpr: 2, canvas: { top: 30, bottom: 830, left: 0, right: 390 } });
    await SuperboxPlay.init();
    assert.deepEqual(SuperboxPlay.designSafeArea, { top: 58, bottom: 20, left: 0, right: 0 });
  });

  it('gives zero before the engine has a canvas', async () => {
    const { SuperboxPlay } = await rig({ canvas: null });
    await SuperboxPlay.init();
    assert.deepEqual(SuperboxPlay.designSafeArea, { top: 0, bottom: 0, left: 0, right: 0 });
  });

  it('watchSafeArea calls back now, on zone changes and on canvas resizes, until stopped', async () => {
    const { SuperboxPlay, fire, resizeCanvas, viewListeners } = await rig({ scale: 2, dpr: 2 });
    const seen: number[] = [];
    const stop = SuperboxPlay.watchSafeArea(({ top }) => seen.push(top));
    assert.deepEqual(seen, [0]);
    await SuperboxPlay.init();
    assert.deepEqual(seen, [0, 88]);
    fire('safeArea.change', { top: 10, bottom: 0, left: 0, right: 0 });
    resizeCanvas();
    assert.deepEqual(seen, [0, 88, 10, 10]);
    stop();
    fire('safeArea.change', { top: 20, bottom: 0, left: 0, right: 0 });
    resizeCanvas();
    assert.deepEqual(seen, [0, 88, 10, 10]);
    assert.deepEqual(viewListeners.get('design-resolution-changed'), []);
  });
});
