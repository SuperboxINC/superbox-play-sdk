var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// packages/sdk/src/load.ts
var PRODUCTION_ZONE_ORIGIN = "https://game.superboxgo.com";
var SDK_PATH = "/sdk/play/v1.js";
var LOCAL_HTTP_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|[^/]+\.localhost)$/;
var SdkLoadError = class extends Error {
  constructor(message) {
    super(message);
    __publicField(this, "code", "NOT_CONNECTED");
    this.name = "SdkLoadError";
  }
};
function assertZoneOrigin(origin) {
  let url;
  try {
    url = new URL(origin);
  } catch {
    throw new SdkLoadError(`\uC798\uBABB\uB41C \uAC8C\uC784\uC874 \uCD9C\uCC98: ${origin}`);
  }
  const allowed = url.protocol === "https:" || url.protocol === "http:" && LOCAL_HTTP_HOST.test(url.hostname);
  if (!allowed || url.origin !== origin) throw new SdkLoadError(`\uC798\uBABB\uB41C \uAC8C\uC784\uC874 \uCD9C\uCC98: ${origin}`);
}
var loading = null;
function loadSBPlay(options = {}) {
  if (window.SBPlay) return Promise.resolve(window.SBPlay);
  if (loading) return loading;
  const zoneOrigin = options.zoneOrigin ?? PRODUCTION_ZONE_ORIGIN;
  try {
    assertZoneOrigin(zoneOrigin);
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new SdkLoadError(String(error)));
  }
  loading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${zoneOrigin}${SDK_PATH}`;
    script.onload = () => {
      if (window.SBPlay) resolve(window.SBPlay);
      else reject(new SdkLoadError("Play SDK \uB97C \uBD88\uB7EC\uC654\uC9C0\uB9CC \uC804\uC5ED SBPlay \uAC00 \uC5C6\uC2B5\uB2C8\uB2E4"));
    };
    script.onerror = () => reject(new SdkLoadError(`Play SDK \uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4: ${script.src}`));
    document.head.appendChild(script);
  }).finally(() => {
    loading = null;
  });
  return loading;
}
function getLoading() {
  var _a;
  return window.SBPlayLoading ?? ((_a = window.SBPlay) == null ? void 0 : _a.loading) ?? null;
}

// packages/sdk/src/protocol.ts
var GAME_CHANNEL_METHODS = [
  "session.init",
  "ads.load",
  "ads.show",
  "ads.banner",
  "store.products",
  "store.purchase",
  "store.pendingOrders",
  "store.completeOrder",
  "auth.login",
  "auth.serverAuthCode",
  "social.share",
  "social.shareLink",
  "social.openUrl",
  "social.requestReview",
  "social.submitScore",
  "social.openLeaderboard",
  "analytics.track",
  "haptic",
  "screen.safeArea",
  "screen.setOrientation",
  "missions.track",
  "points.balance",
  "nav.exit"
];
var GAME_CHANNEL_EVENTS = ["app.pause", "app.resume", "safeArea.change", "session.changed"];
var PLAY_ERROR_CODES = [
  "UNSUPPORTED",
  "INVALID_PARAMS",
  "FORBIDDEN",
  "CANCELED",
  "TIMEOUT",
  "RATE_LIMITED",
  "AD_NO_FILL",
  "AD_FREQUENCY_CAPPED",
  "PAY_PENDING",
  "PAY_FAILED",
  "NOT_CONNECTED",
  "NETWORK",
  "INTERNAL"
];
var LOADING_ERROR_CODES = ["SCRIPT_LOAD", "WEBGL_CONTEXT", "ENGINE_INIT", "WATCHDOG", "UNKNOWN"];
var SBPLAY_WRAPPERS = [
  "init",
  "call",
  "on",
  "off",
  "ads.load",
  "ads.showRewarded",
  "ads.showInterstitial",
  "ads.banner",
  "store.products",
  "store.purchase",
  "store.pendingOrders",
  "store.completeOrder",
  "auth.login",
  "auth.serverAuthCode",
  "social.share",
  "social.shareLink",
  "social.openUrl",
  "analytics.track",
  "haptic",
  "screen.safeArea",
  "screen.setOrientation",
  "missions.track",
  "points.balance",
  "nav.exit"
];
var SBPLAY_LOADING_MEMBERS = ["appInfo", "onReady", "onProgress", "onComplete", "onError", "progress", "complete", "error", "hide", "autoComplete"];
export {
  GAME_CHANNEL_EVENTS,
  GAME_CHANNEL_METHODS,
  LOADING_ERROR_CODES,
  PLAY_ERROR_CODES,
  PRODUCTION_ZONE_ORIGIN,
  SBPLAY_LOADING_MEMBERS,
  SBPLAY_WRAPPERS,
  SDK_PATH,
  SdkLoadError,
  getLoading,
  loadSBPlay
};
