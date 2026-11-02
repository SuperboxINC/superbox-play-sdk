/**
 * 프로토콜 목록을 값으로도 낸다 — 타입(types.ts)과 같은 내용이고, 시험이 game-channel.md · fixtures · 게임존 원본과 대조한다.
 */
export declare const GAME_CHANNEL_METHODS: readonly ["session.init", "ads.load", "ads.show", "ads.banner", "store.products", "store.purchase", "store.pendingOrders", "store.completeOrder", "auth.login", "auth.serverAuthCode", "social.share", "social.shareLink", "social.openUrl", "social.requestReview", "social.submitScore", "social.openLeaderboard", "analytics.track", "haptic", "screen.safeArea", "screen.setOrientation", "missions.track", "points.balance", "nav.exit"];
export declare const GAME_CHANNEL_EVENTS: readonly ["app.pause", "app.resume", "safeArea.change", "session.changed"];
export declare const PLAY_ERROR_CODES: readonly ["UNSUPPORTED", "INVALID_PARAMS", "FORBIDDEN", "CANCELED", "TIMEOUT", "RATE_LIMITED", "AD_NO_FILL", "AD_FREQUENCY_CAPPED", "PAY_PENDING", "PAY_FAILED", "NOT_CONNECTED", "NETWORK", "INTERNAL"];
export declare const LOADING_ERROR_CODES: readonly ["SCRIPT_LOAD", "WEBGL_CONTEXT", "ENGINE_INIT", "WATCHDOG", "UNKNOWN"];
/** 게임 쪽이 부를 수 있는 얇은 래퍼 — 전역 SBPlay 의 점 경로. 시험이 실제 객체와 대조한다. */
export declare const SBPLAY_WRAPPERS: readonly ["init", "call", "on", "off", "ads.load", "ads.showRewarded", "ads.showInterstitial", "ads.banner", "store.products", "store.purchase", "store.pendingOrders", "store.completeOrder", "auth.login", "auth.serverAuthCode", "social.share", "social.shareLink", "social.openUrl", "analytics.track", "haptic", "screen.safeArea", "screen.setOrientation", "missions.track", "points.balance", "nav.exit"];
/** `SBPlayLoading` 멤버 — package-format.md 6장 표. */
export declare const SBPLAY_LOADING_MEMBERS: readonly ["appInfo", "onReady", "onProgress", "onComplete", "onError", "progress", "complete", "error", "hide", "autoComplete"];
