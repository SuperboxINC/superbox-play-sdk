import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COCOS_FALLBACK_LIMIT_MS, installCocosGlue, type CocosGlobal } from './cocos.ts';
import { createClassifier } from './error-watch.ts';
import { createLoading, type LoadingController } from './loading-api.ts';
import { recommendPixelRatio, type DeviceHints } from './pixel-ratio.ts';
import type { BootConfig, LoadingView } from './types.ts';
import { installUnityGlue, type UnityWindow } from './unity.ts';

function silentView(): LoadingView {
  return { attach: () => undefined, setProgress: () => undefined, setAppInfo: () => undefined, hide: () => undefined, showError: () => undefined, hideError: () => undefined };
}

function makeLoading(): LoadingController {
  return createLoading({
    appInfo: { title: null, iconUrl: null, primaryColor: '#000000', backgroundColor: '#000000' },
    view: silentView(),
    post: () => undefined,
    now: () => 0,
    later: () => undefined,
    report: () => undefined,
    classify: () => 'ENGINE_INIT',
  });
}

const CONFIG: BootConfig = {
  zoneOrigin: 'https://z.example',
  engine: 'unity',
  mode: 'default',
  title: null,
  iconUrl: null,
  primaryColor: '#000000',
  backgroundColor: '#000000',
  tips: [],
  earlyFetch: [],
  maxDevicePixelRatio: 'auto',
  watchdog: true,
};

describe('error classifier', () => {
  it('finds WebGL failures and otherwise names by engine', () => {
    assert.equal(createClassifier(CONFIG, () => false)('Your browser does not support WebGL'), 'WEBGL_CONTEXT');
    assert.equal(createClassifier(CONFIG, () => false)('GLctx is undefined'), 'WEBGL_CONTEXT');
    assert.equal(createClassifier(CONFIG, () => false)('boom'), 'ENGINE_INIT');
    assert.equal(createClassifier({ ...CONFIG, engine: 'html5' }, () => false)('boom'), 'UNKNOWN');
    assert.equal(createClassifier(CONFIG, () => true)('boom'), 'WEBGL_CONTEXT');
  });
});

describe('recommendPixelRatio', () => {
  const phone: DeviceHints = { devicePixelRatio: 3, mobile: true, ios: false, memoryGb: 8, cores: 8, renderer: 'Adreno (TM) 740' };

  it('does not touch desktop in auto', () => {
    assert.equal(recommendPixelRatio('auto', { ...phone, mobile: false }), null);
  });

  it('a fixed number always wins, up to the real ratio', () => {
    assert.equal(recommendPixelRatio(2, phone), 2);
    assert.equal(recommendPixelRatio(4, phone), 3);
    assert.equal(recommendPixelRatio(1.5, { ...phone, mobile: false, devicePixelRatio: 2 }), 1.5);
  });

  it('keeps full resolution on strong phones', () => {
    assert.equal(recommendPixelRatio('auto', phone), 3);
    assert.equal(recommendPixelRatio('auto', { devicePixelRatio: 3, mobile: true, ios: true, cores: 6, renderer: 'Apple GPU' }), 3);
  });

  it('drops to 1 on weak devices', () => {
    assert.equal(recommendPixelRatio('auto', { ...phone, memoryGb: 2 }), 1);
    assert.equal(recommendPixelRatio('auto', { ...phone, cores: 2 }), 1);
    assert.equal(recommendPixelRatio('auto', { ...phone, renderer: 'Mali-T720' }), 1);
    assert.equal(recommendPixelRatio('auto', { ...phone, renderer: 'Adreno (TM) 330' }), 1);
    assert.equal(recommendPixelRatio('auto', { ...phone, renderer: 'PowerVR SGX 544' }), 1);
  });

  it('caps at 2 in between', () => {
    assert.equal(recommendPixelRatio('auto', { ...phone, memoryGb: 4 }), 2);
    assert.equal(recommendPixelRatio('auto', { devicePixelRatio: 3, mobile: true, ios: true, cores: 4, renderer: '' }), 2);
    assert.equal(recommendPixelRatio('auto', { ...phone, memoryGb: undefined, renderer: '' }), 2);
    assert.equal(recommendPixelRatio('auto', { ...phone, memoryGb: 4, devicePixelRatio: 1.5 }), 1.5);
  });
});

interface UnityHarness {
  readonly win: UnityWindow;
  readonly loading: LoadingController;
  fireLoad(): void;
  tick(): void;
  flushFrame(): void;
  advance(ms: number): void;
}

function unityHarness(ratio: number | null = null): UnityHarness {
  const win: UnityWindow = {};
  const loading = makeLoading();
  let onLoad: (() => void) | null = null;
  let tick: (() => void) | null = null;
  let clock = 0;
  const frames: (() => void)[] = [];
  installUnityGlue({
    win,
    doc: {
      addEventListener: ((_type: string, listener: () => void) => {
        onLoad = listener;
      }) as Document['addEventListener'],
      removeEventListener: (() => {
        onLoad = null;
      }) as Document['removeEventListener'],
    },
    loading,
    pixelRatio: () => ratio,
    classify: (message) => (/webgl/i.test(message) ? 'WEBGL_CONTEXT' : 'ENGINE_INIT'),
    afterFrame: (callback) => frames.push(callback),
    setInterval: (callback) => {
      tick = callback;
      return 1;
    },
    clearInterval: () => {
      tick = null;
    },
    now: () => clock,
  });
  return {
    win,
    loading,
    fireLoad: () => onLoad?.(),
    tick: () => tick?.(),
    flushFrame: () => {
      for (const frame of frames.splice(0)) frame();
    },
    advance: (ms) => {
      clock += ms;
    },
  };
}

describe('Unity glue', () => {
  it('wraps createUnityInstance on the loader script load, before the template calls it', async () => {
    const h = unityHarness();
    const original = async (): Promise<string> => 'instance';
    h.win.createUnityInstance = original;
    h.fireLoad();
    assert.notEqual(h.win.createUnityInstance, original);
    assert.equal(h.loading.api.autoComplete, true, '부르기 전까지는 자동 닫기를 건드리지 않는다');
    await h.win.createUnityInstance?.({}, {});
    assert.equal(h.loading.api.autoComplete, false);
  });

  it('forwards progress to the screen and to the template, and arms the watchdog', async () => {
    const h = unityHarness();
    h.win.createUnityInstance = async (_canvas, _config, onProgress) => {
      onProgress?.(0.5);
      return 'instance';
    };
    h.fireLoad();
    const seen: number[] = [];
    await h.win.createUnityInstance?.({}, {}, (value) => seen.push(value));
    assert.deepEqual(seen, [0.5]);
    assert.equal(h.loading.lastProgress(), 0.5);
    assert.equal(h.loading.hasProgress(), true);
  });

  it('closes after the first frame once the instance is ready, and returns the instance', async () => {
    const h = unityHarness();
    h.win.createUnityInstance = async () => 'instance';
    h.fireLoad();
    assert.equal(await h.win.createUnityInstance?.({}, {}), 'instance');
    assert.equal(h.loading.isComplete(), false);
    h.flushFrame();
    assert.equal(h.loading.isComplete(), true);
  });

  it('reports a failed instance and keeps the rejection for the template', async () => {
    const h = unityHarness();
    h.win.createUnityInstance = async () => {
      throw 'Your browser does not support WebGL';
    };
    h.fireLoad();
    await assert.rejects(Promise.resolve(h.win.createUnityInstance?.({}, {})));
    assert.equal(h.loading.hasFailed(), true);
    const errors: string[] = [];
    h.loading.api.onError((error) => errors.push(error.code));
    assert.deepEqual(errors, ['WEBGL_CONTEXT']);
  });

  it('fills devicePixelRatio without mutating the template config, and takes the smaller of two', async () => {
    const h = unityHarness(2);
    const configs: unknown[] = [];
    h.win.createUnityInstance = async (_canvas, config) => {
      configs.push(config);
      return 'instance';
    };
    h.fireLoad();
    const templateConfig = { dataUrl: 'x' };
    await h.win.createUnityInstance?.({}, templateConfig);
    await h.win.createUnityInstance?.({}, { devicePixelRatio: 1.5 });
    assert.deepEqual(configs[0], { dataUrl: 'x', devicePixelRatio: 2 });
    assert.deepEqual(templateConfig, { dataUrl: 'x' });
    assert.deepEqual(configs[1], { devicePixelRatio: 1.5 });
  });

  it('leaves the config alone when there is no recommendation', async () => {
    const h = unityHarness(null);
    const configs: unknown[] = [];
    const templateConfig = { dataUrl: 'x' };
    h.win.createUnityInstance = async (_canvas, config) => {
      configs.push(config);
      return 'instance';
    };
    h.fireLoad();
    await h.win.createUnityInstance?.({}, templateConfig);
    assert.equal(configs[0], templateConfig);
  });

  it('a throwing pixel ratio does not stop the game', async () => {
    const win: UnityWindow = {};
    const loading = makeLoading();
    let onLoad: (() => void) | null = null;
    installUnityGlue({
      win,
      doc: {
        addEventListener: ((_type: string, listener: () => void) => {
          onLoad = listener;
        }) as Document['addEventListener'],
        removeEventListener: (() => undefined) as Document['removeEventListener'],
      },
      loading,
      pixelRatio: () => {
        throw new Error('WebGL 시험이 던졌다');
      },
      classify: () => 'ENGINE_INIT',
      afterFrame: (callback) => callback(),
      setInterval: () => 1,
      clearInterval: () => undefined,
      now: () => 0,
    });
    win.createUnityInstance = async () => 'instance';
    (onLoad as unknown as () => void)();
    assert.equal(await win.createUnityInstance?.({}, {}), 'instance');
  });

  it('finds an inlined loader by polling, and gives up quietly', () => {
    const found = unityHarness();
    const original = async (): Promise<string> => 'x';
    found.win.createUnityInstance = original;
    found.tick();
    assert.notEqual(found.win.createUnityInstance, original);

    const never = unityHarness();
    never.advance(40_000);
    never.tick();
    never.win.createUnityInstance = original;
    never.tick();
    assert.equal(never.win.createUnityInstance, original);
  });

  it('wraps only once', () => {
    const h = unityHarness();
    h.win.createUnityInstance = async () => 'x';
    h.fireLoad();
    const wrapped = h.win.createUnityInstance;
    h.fireLoad();
    h.tick();
    assert.equal(h.win.createUnityInstance, wrapped);
  });
});

interface CocosWindow {
  cc?: CocosGlobal;
  console: { error: (...args: unknown[]) => void };
}

interface CocosHarness {
  readonly win: CocosWindow;
  readonly logged: unknown[][];
  readonly loading: LoadingController;
  tick(): void;
  advance(ms: number): void;
  readonly running: () => boolean;
}

function cocosHarness(): CocosHarness {
  const logged: unknown[][] = [];
  const win: CocosWindow = { console: { error: (...args) => logged.push(args) } };
  const loading = makeLoading();
  let tick: (() => void) | null = null;
  let clock = 0;
  installCocosGlue({
    win,
    loading,
    now: () => clock,
    classify: (message) => (/webgl/i.test(message) ? 'WEBGL_CONTEXT' : 'ENGINE_INIT'),
    setInterval: (callback) => {
      tick = callback;
      return 1;
    },
    clearInterval: () => {
      tick = null;
    },
  });
  return {
    win,
    logged,
    loading,
    tick: () => tick?.(),
    advance: (ms) => {
      clock += ms;
    },
    running: () => tick !== null,
  };
}

describe('Cocos safety net', () => {
  it('shows the error when the template swallows a start failure with console.error', () => {
    const h = cocosHarness();
    h.win.cc = { director: { getScene: () => null } };
    h.win.console.error(new TypeError('Cannot read properties of null'));
    assert.equal(h.loading.hasFailed(), true);
    assert.equal(h.logged.length, 1, '로그는 그대로 남긴다');
  });

  it('classifies a logged WebGL failure', () => {
    const h = cocosHarness();
    const failures: string[] = [];
    h.loading.api.onError((error) => failures.push(error.code));
    h.win.console.error(new Error('WebGL context failed'));
    assert.deepEqual(failures, ['WEBGL_CONTEXT']);
  });

  it('passes engine error strings and calls with more arguments', () => {
    const h = cocosHarness();
    h.win.console.error('Error 16405, please go to https://example.invalid to see details.');
    h.win.console.error('asset failed', new Error('one asset'));
    assert.equal(h.loading.hasFailed(), false);
    assert.equal(h.logged.length, 2);
  });

  it('ignores logged errors once the scene is up', () => {
    const h = cocosHarness();
    h.win.cc = { director: { getScene: () => ({}) } };
    h.win.console.error(new Error('later problem'));
    assert.equal(h.loading.hasFailed(), false);
  });

  it('closes a false alarm when the scene comes up after all', () => {
    const h = cocosHarness();
    h.win.console.error(new Error('the game logged something and went on'));
    assert.equal(h.loading.hasFailed(), true);
    h.tick();
    h.win.cc = { director: { getScene: () => ({}) } };
    h.tick();
    assert.equal(h.loading.isComplete(), true);
    assert.equal(h.running(), false);
  });

  it('moves the bar when the engine appears and closes when the first scene is up', () => {
    const h = cocosHarness();
    h.tick();
    assert.equal(h.loading.hasProgress(), false);
    h.win.cc = { director: { getScene: () => null } };
    h.tick();
    assert.equal(h.loading.lastProgress(), 0.3);
    assert.equal(h.loading.isComplete(), false);
    h.win.cc = { director: { getScene: () => ({}) } };
    h.tick();
    assert.equal(h.loading.isComplete(), true);
    assert.equal(h.running(), false);
  });

  it('steps back when the runtime piece took over', () => {
    const h = cocosHarness();
    h.loading.api.autoComplete = false;
    h.win.cc = { director: { getScene: () => ({}) } };
    h.tick();
    assert.equal(h.loading.isComplete(), false);
    assert.equal(h.running(), false);
  });

  it('closes anyway after the limit — fail-open', () => {
    const h = cocosHarness();
    h.advance(COCOS_FALLBACK_LIMIT_MS + 1);
    h.tick();
    assert.equal(h.loading.isComplete(), true);
  });

  it('stops after a failure instead of hiding the error', () => {
    const h = cocosHarness();
    h.loading.fail('SCRIPT_LOAD', 'x');
    h.advance(COCOS_FALLBACK_LIMIT_MS + 1);
    h.tick();
    assert.equal(h.loading.isComplete(), false);
    assert.equal(h.running(), false);
  });
});
