var __defProp = Object.defineProperty;
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);
var __privateMethod = (obj, member, method) => (__accessCheck(obj, member, "access private method"), method);

// packages/phaser/src/progress-mixer.ts
var MAX_BEFORE_SCENE = 0.9;
var FIRST_LOADER_DAMPING = 4;
function createProgressMixer() {
  let base = 0;
  let cap = MAX_BEFORE_SCENE;
  let current = 0;
  let loaders = 0;
  return {
    startLoader(fileCount) {
      base = current;
      const count = Math.max(1, fileCount);
      cap = loaders === 0 ? MAX_BEFORE_SCENE * count / (count + FIRST_LOADER_DAMPING) : MAX_BEFORE_SCENE;
      loaders += 1;
    },
    update(fraction) {
      const clamped = Math.min(1, Math.max(0, fraction));
      current = Math.max(current, base + (Math.max(cap, base) - base) * clamped);
      return current;
    },
    endLoader() {
      base = current;
    }
  };
}

// packages/phaser/src/safe-area.ts
function usableFactor(factor) {
  return Number.isFinite(factor) && factor > 0 ? factor : 1;
}
function toGameInsets(insets, canvas, scale, viewport) {
  const covered = (inset, gap, factor) => Math.max(0, inset - gap) * usableFactor(factor);
  return {
    top: covered(insets.top, canvas.y, scale.y),
    bottom: covered(insets.bottom, viewport.height - (canvas.y + canvas.height), scale.y),
    left: covered(insets.left, canvas.x, scale.x),
    right: covered(insets.right, viewport.width - (canvas.x + canvas.width), scale.x)
  };
}

// packages/phaser/src/plugin.ts
var SUPERBOX_PLAY_PLUGIN_KEY = "SuperboxPlay";
var SUPERBOX_PLAY_MAPPING = "sbplay";
var SBPLAY_EVENTS = {
  /** 게임존이 일시정지시켰다 — data `{ reason }`. 루프 · 소리는 플러그인이 이미 멈췄다. */
  PAUSE: "sbplay.pause",
  RESUME: "sbplay.resume",
  /** 안전 영역이나 캔버스 크기가 바뀌었다 — data 는 CSS 픽셀 `{ top, bottom, left, right }`. 씬 좌표는 `gameSafeArea` 로 읽는다. */
  SAFE_AREA: "sbplay.safearea",
  /** 플레이어가 바뀌었다 — data = 새 SessionInfo. */
  SESSION: "sbplay.session"
};
var ZERO_INSETS = { top: 0, bottom: 0, left: 0, right: 0 };
var RUNNING_STATUS = 5;
var LOADING_STATUSES = /* @__PURE__ */ new Set([1, 2, 3, 4]);
var FRAMES_BEFORE_COMPLETE = 2;
function notConnected() {
  return Object.assign(new Error("Play SDK\uAC00 \uC5C6\uC5B4\uC694"), { code: "NOT_CONNECTED" });
}
function missingSdk() {
  const reject = () => Promise.reject(notConnected());
  const handler = {
    get: (_target, property) => property === "then" ? void 0 : new Proxy(reject, handler)
  };
  return new Proxy({}, handler);
}
var _options, _started, _mixer, _scenes, _loaders, _failedLoad, _sawFirstScene, _framesSinceScene, _done, _pausedByPlatform, _soundsToResume, _resumeAllSounds, _SuperboxPlayPlugin_instances, playWindow_fn, initSession_fn, scanScenes_fn, watchScene_fn, watchLoader_fn, markSceneCreated_fn, checkFirstFrame_fn, anySceneLoading_fn, _onPause, _onResume, pauseSounds_fn, resumeSounds_fn, _onSafeArea, _onCanvasResize, _onSessionChanged;
var SuperboxPlayPlugin = class {
  constructor(pluginManager) {
    __privateAdd(this, _SuperboxPlayPlugin_instances);
    __publicField(this, "pluginManager");
    __publicField(this, "game");
    /** `SBPlay.init()` 이 끝나면 풀린다. SDK 가 없거나 실패하면 null. */
    __publicField(this, "ready", Promise.resolve(null));
    __publicField(this, "session", null);
    __publicField(this, "safeArea", ZERO_INSETS);
    __privateAdd(this, _options, {});
    __privateAdd(this, _started, false);
    __privateAdd(this, _mixer, createProgressMixer());
    __privateAdd(this, _scenes, /* @__PURE__ */ new WeakSet());
    __privateAdd(this, _loaders, /* @__PURE__ */ new WeakSet());
    __privateAdd(this, _failedLoad, false);
    __privateAdd(this, _sawFirstScene, false);
    __privateAdd(this, _framesSinceScene, 0);
    __privateAdd(this, _done, false);
    __privateAdd(this, _pausedByPlatform, false);
    __privateAdd(this, _soundsToResume, []);
    __privateAdd(this, _resumeAllSounds, false);
    __privateAdd(this, _onPause, (data) => {
      if (__privateGet(this, _pausedByPlatform)) return;
      const { game } = this;
      __privateSet(this, _pausedByPlatform, !game.isPaused);
      if (__privateGet(this, _pausedByPlatform)) game.pause();
      __privateMethod(this, _SuperboxPlayPlugin_instances, pauseSounds_fn).call(this);
      game.events.emit(SBPLAY_EVENTS.PAUSE, data);
    });
    __privateAdd(this, _onResume, () => {
      const { game } = this;
      if (__privateGet(this, _pausedByPlatform)) game.resume();
      __privateSet(this, _pausedByPlatform, false);
      __privateMethod(this, _SuperboxPlayPlugin_instances, resumeSounds_fn).call(this);
      game.events.emit(SBPLAY_EVENTS.RESUME);
    });
    __privateAdd(this, _onSafeArea, (insets) => {
      this.safeArea = insets;
      this.game.events.emit(SBPLAY_EVENTS.SAFE_AREA, insets);
    });
    /** 안전 영역 알림과 캔버스 크기 변화의 순서는 정해져 있지 않다 — 크기가 바뀐 뒤에도 알려 게임이 마지막 값으로 맞추게 한다. */
    __privateAdd(this, _onCanvasResize, () => {
      this.game.events.emit(SBPLAY_EVENTS.SAFE_AREA, this.safeArea);
    });
    __privateAdd(this, _onSessionChanged, () => {
      const sdk = __privateMethod(this, _SuperboxPlayPlugin_instances, playWindow_fn).call(this).SBPlay;
      if (!sdk) return;
      this.ready = __privateMethod(this, _SuperboxPlayPlugin_instances, initSession_fn).call(this, sdk).then((session) => {
        this.game.events.emit(SBPLAY_EVENTS.SESSION, session);
        return session;
      });
    });
    this.pluginManager = pluginManager;
    this.game = pluginManager.game;
  }
  /** 플러그인 관리자가 부른다 — data 는 `plugins.global[].data`. */
  init(data) {
    __privateSet(this, _options, data ?? {});
    const loading = this.loading;
    if (loading) loading.autoComplete = false;
  }
  /** 플러그인 관리자가 부른다. 다시 불려도 한 번만 건다. */
  start() {
    var _a;
    if (__privateGet(this, _started)) return;
    __privateSet(this, _started, true);
    const { events } = this.game;
    events.on("prestep", __privateMethod(this, _SuperboxPlayPlugin_instances, scanScenes_fn), this);
    events.on("postrender", __privateMethod(this, _SuperboxPlayPlugin_instances, checkFirstFrame_fn), this);
    const sdk = __privateMethod(this, _SuperboxPlayPlugin_instances, playWindow_fn).call(this).SBPlay;
    if (!sdk) return;
    sdk.on("app.pause", __privateGet(this, _onPause));
    sdk.on("app.resume", __privateGet(this, _onResume));
    sdk.on("safeArea.change", __privateGet(this, _onSafeArea));
    sdk.on("session.changed", __privateGet(this, _onSessionChanged));
    (_a = this.game.scale) == null ? void 0 : _a.on("resize", __privateGet(this, _onCanvasResize));
    if (__privateGet(this, _options).autoInit !== false) this.ready = __privateMethod(this, _SuperboxPlayPlugin_instances, initSession_fn).call(this, sdk);
  }
  stop() {
    var _a;
    if (!__privateGet(this, _started)) return;
    __privateSet(this, _started, false);
    const { events } = this.game;
    events.off("prestep", __privateMethod(this, _SuperboxPlayPlugin_instances, scanScenes_fn), this);
    events.off("postrender", __privateMethod(this, _SuperboxPlayPlugin_instances, checkFirstFrame_fn), this);
    (_a = this.game.scale) == null ? void 0 : _a.off("resize", __privateGet(this, _onCanvasResize));
    const sdk = __privateMethod(this, _SuperboxPlayPlugin_instances, playWindow_fn).call(this).SBPlay;
    sdk == null ? void 0 : sdk.off("app.pause", __privateGet(this, _onPause));
    sdk == null ? void 0 : sdk.off("app.resume", __privateGet(this, _onResume));
    sdk == null ? void 0 : sdk.off("safeArea.change", __privateGet(this, _onSafeArea));
    sdk == null ? void 0 : sdk.off("session.changed", __privateGet(this, _onSessionChanged));
  }
  destroy() {
    this.stop();
  }
  /** 전역 SBPlay — 없으면 부를 때 NOT_CONNECTED 로 거절하는 대체. */
  get sdk() {
    return __privateMethod(this, _SuperboxPlayPlugin_instances, playWindow_fn).call(this).SBPlay ?? missingSdk();
  }
  get loading() {
    var _a;
    const win = __privateMethod(this, _SuperboxPlayPlugin_instances, playWindow_fn).call(this);
    return win.SBPlayLoading ?? ((_a = win.SBPlay) == null ? void 0 : _a.loading) ?? null;
  }
  /** `safeArea` 를 씬 좌표로 — 캔버스가 틀과 어긋난 만큼(FIT · ENVELOP)은 이미 뺐다. 스케일 관리자가 없으면 CSS 픽셀 그대로. */
  get gameSafeArea() {
    const { scale } = this.game;
    if (!scale) return this.safeArea;
    const { canvasBounds: canvas, displayScale } = scale;
    const win = __privateMethod(this, _SuperboxPlayPlugin_instances, playWindow_fn).call(this);
    const viewport = { width: win.innerWidth ?? canvas.x + canvas.width, height: win.innerHeight ?? canvas.y + canvas.height };
    return toGameInsets(this.safeArea, canvas, displayScale, viewport);
  }
  get call() {
    return (method, params) => this.sdk.call(method, params);
  }
  get ads() {
    return this.sdk.ads;
  }
  get store() {
    return this.sdk.store;
  }
  get auth() {
    return this.sdk.auth;
  }
  get social() {
    return this.sdk.social;
  }
  get analytics() {
    return this.sdk.analytics;
  }
  get screen() {
    return this.sdk.screen;
  }
  get missions() {
    return this.sdk.missions;
  }
  get points() {
    return this.sdk.points;
  }
  get nav() {
    return this.sdk.nav;
  }
  get haptic() {
    return (strength) => this.sdk.haptic(strength);
  }
  get on() {
    return (event, listener) => this.sdk.on(event, listener);
  }
  get off() {
    return (event, listener) => this.sdk.off(event, listener);
  }
};
_options = new WeakMap();
_started = new WeakMap();
_mixer = new WeakMap();
_scenes = new WeakMap();
_loaders = new WeakMap();
_failedLoad = new WeakMap();
_sawFirstScene = new WeakMap();
_framesSinceScene = new WeakMap();
_done = new WeakMap();
_pausedByPlatform = new WeakMap();
_soundsToResume = new WeakMap();
_resumeAllSounds = new WeakMap();
_SuperboxPlayPlugin_instances = new WeakSet();
playWindow_fn = function() {
  return globalThis;
};
initSession_fn = async function(sdk) {
  try {
    const session = await sdk.init();
    this.session = session;
    this.safeArea = session.safeArea ?? ZERO_INSETS;
    return session;
  } catch (error) {
    console.warn("[superbox-play] SBPlay.init \uC2E4\uD328", error);
    return null;
  }
};
/** 씬 목록을 프레임마다 훑어 처음 보는 씬에 건다 — 나중에 더한 씬(Boot → Preload)도 잡는다. 첫 화면을 닫으면 멈춘다. */
scanScenes_fn = function() {
  for (const scene of this.game.scene.scenes) __privateMethod(this, _SuperboxPlayPlugin_instances, watchScene_fn).call(this, scene);
};
watchScene_fn = function(scene) {
  var _a;
  if (__privateGet(this, _scenes).has(scene)) return;
  const sys = scene.sys;
  if (!(sys == null ? void 0 : sys.events)) return;
  __privateGet(this, _scenes).add(scene);
  if (sys.load) __privateMethod(this, _SuperboxPlayPlugin_instances, watchLoader_fn).call(this, sys.load);
  if ((((_a = sys.settings) == null ? void 0 : _a.status) ?? 0) >= RUNNING_STATUS) __privateMethod(this, _SuperboxPlayPlugin_instances, markSceneCreated_fn).call(this);
  else sys.events.once("create", __privateMethod(this, _SuperboxPlayPlugin_instances, markSceneCreated_fn), this);
};
watchLoader_fn = function(loader) {
  if (__privateGet(this, _loaders).has(loader)) return;
  __privateGet(this, _loaders).add(loader);
  let started = false;
  const report = (fraction) => {
    var _a;
    if (__privateGet(this, _done)) return;
    if (!started) {
      started = true;
      __privateGet(this, _mixer).startLoader(loader.totalToLoad ?? 1);
    }
    (_a = this.loading) == null ? void 0 : _a.progress(__privateGet(this, _mixer).update(fraction));
  };
  loader.on("progress", (fraction) => report(fraction));
  loader.on("fileprogress", (file) => {
    const total = loader.totalToLoad ?? 0;
    if (total > 0) report(((loader.totalComplete ?? 0) + (file.percentComplete ?? 0)) / total);
  });
  loader.on("complete", () => {
    if (!started) return;
    started = false;
    __privateGet(this, _mixer).endLoader();
  });
  loader.on("loaderror", (file) => {
    var _a;
    if (__privateGet(this, _done)) return;
    const name = file.key ?? file.src ?? "unknown";
    if (__privateGet(this, _options).ignoreLoadErrors) {
      console.warn("[superbox-play] \uD30C\uC77C\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC5B4\uC694", name);
      return;
    }
    __privateSet(this, _failedLoad, true);
    (_a = this.loading) == null ? void 0 : _a.error(`\uD30C\uC77C\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC5B4\uC694: ${name}`);
  });
};
markSceneCreated_fn = function() {
  __privateSet(this, _sawFirstScene, true);
  __privateSet(this, _framesSinceScene, 0);
};
/** create 뒤 프레임이 그려졌고 이어서 불러오는 씬이 없으면(Boot → Preload) 닫는다. */
checkFirstFrame_fn = function() {
  var _a;
  if (__privateGet(this, _done) || !__privateGet(this, _sawFirstScene)) return;
  __privateSet(this, _framesSinceScene, __privateGet(this, _framesSinceScene) + 1);
  if (__privateGet(this, _framesSinceScene) < FRAMES_BEFORE_COMPLETE) return;
  if (__privateMethod(this, _SuperboxPlayPlugin_instances, anySceneLoading_fn).call(this)) {
    __privateSet(this, _framesSinceScene, 0);
    return;
  }
  __privateSet(this, _done, true);
  const { events } = this.game;
  events.off("prestep", __privateMethod(this, _SuperboxPlayPlugin_instances, scanScenes_fn), this);
  events.off("postrender", __privateMethod(this, _SuperboxPlayPlugin_instances, checkFirstFrame_fn), this);
  if (__privateGet(this, _options).autoComplete === false || __privateGet(this, _failedLoad)) return;
  (_a = this.loading) == null ? void 0 : _a.complete();
};
anySceneLoading_fn = function() {
  return this.game.scene.scenes.some((scene) => {
    var _a, _b, _c, _d, _e;
    const status = ((_b = (_a = scene.sys) == null ? void 0 : _a.settings) == null ? void 0 : _b.status) ?? 0;
    return LOADING_STATUSES.has(status) || ((_e = (_d = (_c = scene.sys) == null ? void 0 : _c.load) == null ? void 0 : _d.isLoading) == null ? void 0 : _e.call(_d)) === true;
  });
};
_onPause = new WeakMap();
_onResume = new WeakMap();
/** 지금 울리는 소리만 멈춘다 — resumeAll 은 게임이 일부러 멈춘 소리까지 되살린다. */
pauseSounds_fn = function() {
  var _a;
  const { sound } = this.game;
  if (!sound) return;
  if (typeof sound.getAllPlaying === "function") {
    const playing = sound.getAllPlaying();
    for (const item of playing) item.pause();
    __privateSet(this, _soundsToResume, [...__privateGet(this, _soundsToResume), ...playing]);
    return;
  }
  (_a = sound.pauseAll) == null ? void 0 : _a.call(sound);
  __privateSet(this, _resumeAllSounds, true);
};
resumeSounds_fn = function() {
  var _a;
  const { sound } = this.game;
  for (const item of __privateGet(this, _soundsToResume)) item.resume();
  __privateSet(this, _soundsToResume, []);
  if (__privateGet(this, _resumeAllSounds)) (_a = sound == null ? void 0 : sound.resumeAll) == null ? void 0 : _a.call(sound);
  __privateSet(this, _resumeAllSounds, false);
};
_onSafeArea = new WeakMap();
_onCanvasResize = new WeakMap();
_onSessionChanged = new WeakMap();
function superboxPlayPlugin(data) {
  return { key: SUPERBOX_PLAY_PLUGIN_KEY, plugin: SuperboxPlayPlugin, start: true, mapping: SUPERBOX_PLAY_MAPPING, data: data ?? {} };
}
export {
  SBPLAY_EVENTS,
  SUPERBOX_PLAY_MAPPING,
  SUPERBOX_PLAY_PLUGIN_KEY,
  SuperboxPlayPlugin,
  createProgressMixer,
  superboxPlayPlugin
};
