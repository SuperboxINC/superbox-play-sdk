/**
 * Play SDK 타입 — 메서드 설명은 개발자 센터의 메서드 레퍼런스(https://developers.superboxgo.com/sdk/reference).
 * 런타임은 게임존과 같은 배포에서 URL 로 내려간다(`/sdk/play/v1.js`) — 이 패키지에는 타입과 얇은 진입만 있다.
 */
export type PlayEnvironment = 'live' | 'sandbox' | 'standalone';
export type AdFormat = 'rewarded' | 'interstitial' | 'banner';
export type HapticStrength = 'light' | 'medium' | 'heavy';
export type GameOrientation = 'portrait' | 'landscape';
export type PurchaseStatus = 'paid' | 'canceled' | 'pending' | 'failed';
export type PlayParams = Readonly<Record<string, unknown>>;

export interface SafeArea {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

export interface GameFeatures {
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

export interface PlayerInfo {
  readonly key: string;
  readonly displayName: string;
  readonly linked: boolean;
  /**
   * 이 채널에서 이 게임을 출시 전에 사전예약했는지(`session.init` 만). 사전예약 보상(아이템)은 게임이 주고, 한 번만 주는 것은 게임이 `key` 로 지킨다.
   * 게임존 밖(standalone) · 검수 미리보기 · 사전예약이 없던 게임 · 확인하지 못했을 때는 false
   */
  readonly preregistered?: boolean;
}

export interface SessionInfo {
  readonly protocol: 1;
  readonly environment: PlayEnvironment;
  readonly player: PlayerInfo;
  readonly features: GameFeatures;
  readonly safeArea: SafeArea;
  readonly locale: string;
}

export interface StoreProductInfo {
  readonly key: string;
  readonly title: string;
  readonly type: 'consumable' | 'non_consumable' | 'subscription';
  readonly price: { readonly amount: number; readonly currency: string; readonly label: string };
  /** 구독만 — 갱신 주기. price 는 주기마다 내는 돈 */
  readonly renewalPeriod?: 'weekly' | 'monthly' | 'yearly';
  /** 구독만 — 무료 체험('' 없음). 처음 구독하는 플레이어만 받는다 */
  readonly freeTrial?: '' | '3d' | '1w' | '2w' | '1m';
}

/** `store.subscriptions` 의 줄 — 이 플레이어의 이 게임 구독. 이용권은 `accessible` 만 보고 연다(만료 시각은 서버가 따진다). */
export interface SubscriptionInfo {
  readonly productKey: string;
  /** 그 구독의 첫 주문 */
  readonly orderId: string;
  /** canceled = 자동 갱신만 꺼짐(만료까지 이용) · revoked = 환불 · 취소로 바로 끝 */
  readonly status: 'active' | 'canceled' | 'expired' | 'revoked';
  readonly accessible: boolean;
  /** 만료 시각(ISO 8601) */
  readonly expiresDate: string;
  readonly autoRenew: boolean;
  readonly isTrial: boolean;
  readonly renewalPeriod: string;
}

export interface PurchaseResult {
  readonly status: PurchaseStatus;
  readonly orderId: string;
  readonly productKey: string;
  readonly simulated: boolean;
}

/** `store.purchase` 의 두 번째 인자 — 결제가 끝나면(paid) grant 를 부르고, true 를 돌려주면 SDK 가 지급 확인(`store.completeOrder`)까지 부른다. */
export interface PurchaseOptions {
  /** 아이템을 지급하고 true. false 를 돌려주거나 던지면 지급 확인을 하지 않는다 — 그 주문은 다음 실행 때 `store.pendingOrders` 로 다시 온다. */
  readonly grant: (order: PurchaseResult) => boolean | Promise<boolean>;
}

/** grant 를 넘긴 `store.purchase` 의 결과 — completed 는 지급 확인까지 끝났는지. */
export interface GrantedPurchaseResult extends PurchaseResult {
  readonly completed: boolean;
}

export interface PendingOrder {
  readonly orderId: string;
  readonly productKey: string;
  readonly status: PurchaseStatus;
  readonly simulated?: boolean;
}

/** 메서드마다 params · result — game-channel.md 2장 표. 시험이 표 · fixtures 와 대조한다. */
export interface GameChannelMethods {
  'session.init': { params: Record<string, never>; result: SessionInfo };
  'ads.load': { params: { format: AdFormat; adGroupId?: string }; result: { ready: boolean } };
  'ads.show': { params: { format: AdFormat; placement: string; adGroupId?: string }; result: { shown: boolean; rewarded: boolean } };
  'ads.banner': { params: { action: 'show' | 'hide' | 'destroy'; adGroupId?: string }; result: { visible: boolean; heightPx: number } };
  'store.products': { params: Record<string, never>; result: { products: readonly StoreProductInfo[] } };
  'store.purchase': { params: { productKey: string }; result: PurchaseResult };
  'store.pendingOrders': { params: Record<string, never>; result: { orders: readonly PendingOrder[] } };
  'store.completeOrder': { params: { orderId: string }; result: { completed: boolean } };
  'store.subscriptions': { params: Record<string, never>; result: { subscriptions: readonly SubscriptionInfo[] } };
  'auth.login': { params: Record<string, never>; result: { loggedIn: boolean; key: string; displayName: string; linked: boolean } };
  'auth.serverAuthCode': { params: Record<string, never>; result: { provider: 'superbox-play'; code: string; expiresInSeconds: number } };
  'social.share': { params: { text: string; url?: string }; result: { shared: boolean } };
  'social.shareLink': { params: { path: string }; result: { url: string } };
  'social.openUrl': { params: { url: string }; result: Record<string, never> };
  'social.requestReview': { params: PlayParams; result: Record<string, never> };
  'social.submitScore': { params: PlayParams; result: Record<string, never> };
  'social.openLeaderboard': { params: PlayParams; result: Record<string, never> };
  'analytics.track': { params: { name: string; params?: PlayParams }; result: Record<string, never> };
  haptic: { params: { strength: HapticStrength }; result: Record<string, never> };
  'screen.safeArea': { params: Record<string, never>; result: SafeArea };
  'screen.setOrientation': { params: { orientation: GameOrientation }; result: { applied: boolean } };
  'missions.track': { params: { event: string; value?: number; params?: PlayParams }; result: { accepted: boolean } };
  'points.balance': { params: Record<string, never>; result: { balance: number; unit: string } };
  'nav.exit': { params: Record<string, never>; result: Record<string, never> };
}

export type GameChannelMethod = keyof GameChannelMethods;

/** 이벤트마다 data — game-channel.md 3장. */
export interface GameChannelEvents {
  'app.pause': { reason?: 'background' | 'ad' | 'payment' | 'menu' };
  'app.resume': Record<string, never>;
  'safeArea.change': SafeArea;
  'session.changed': Record<string, never>;
}

export type GameChannelEvent = keyof GameChannelEvents;

/** 오류 코드 — reject 하는 값의 `code`. */
export type PlayErrorCode =
  | 'UNSUPPORTED'
  | 'INVALID_PARAMS'
  | 'FORBIDDEN'
  | 'CANCELED'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'AD_NO_FILL'
  | 'AD_FREQUENCY_CAPPED'
  | 'PAY_PENDING'
  | 'PAY_FAILED'
  | 'NOT_CONNECTED'
  | 'NETWORK'
  | 'INTERNAL';

export interface PlayFailure extends Error {
  readonly code: PlayErrorCode;
}

export type LoadingErrorCode = 'SCRIPT_LOAD' | 'WEBGL_CONTEXT' | 'ENGINE_INIT' | 'WATCHDOG' | 'UNKNOWN';

export interface LoadingAppInfo {
  readonly title: string | null;
  readonly iconUrl: string | null;
  readonly primaryColor: string;
  readonly backgroundColor: string;
}

export interface LoadingErrorInfo {
  readonly code: LoadingErrorCode;
  readonly message: string;
}

/** `window.SBPlayLoading` — package-format.md 6장. `SBPlay.loading` 도 같은 것을 가리킨다. */
export interface SBPlayLoading {
  readonly appInfo: LoadingAppInfo;
  /** 기본 true — 엔진 어댑터가 없으면 window.load 뒤 다음 프레임에 complete(). 직접 부르려면 시작 전에 false 로 둔다. */
  autoComplete: boolean;
  /** 앱 정보가 준비될 때마다 — 여러 번 불릴 수 있다. */
  onReady(callback: (info: LoadingAppInfo) => void): void;
  /** 0.0~1.0 — 늦게 등록하면 마지막 값을 바로 한 번 받는다. */
  onProgress(callback: (progress: number) => void): void;
  onComplete(callback: () => void): void;
  onError(callback: (error: LoadingErrorInfo) => void): void;
  /** 엔진 쪽 진행률 — 뒤로 가지 않는다. */
  progress(value: number): void;
  /** 첫 화면을 보여도 된다 — 로딩 화면을 닫는다. */
  complete(): void;
  /** 오류 화면으로. */
  error(message: unknown): void;
  /** 로딩 화면만 닫는다. */
  hide(): void;
}

/** 전역 `SBPlay`. 시험이 실제 객체와 대조한다. */
export interface SBPlay {
  readonly version: string;
  readonly session: SessionInfo | null;
  readonly loading: SBPlayLoading;
  init(): Promise<SessionInfo>;
  call<M extends GameChannelMethod>(method: M, params?: GameChannelMethods[M]['params']): Promise<GameChannelMethods[M]['result']>;
  on<E extends GameChannelEvent>(event: E, listener: (data: GameChannelEvents[E]) => void): void;
  off<E extends GameChannelEvent>(event: E, listener: (data: GameChannelEvents[E]) => void): void;
  readonly ads: {
    load(format: 'rewarded' | 'interstitial', adGroupId?: string): Promise<GameChannelMethods['ads.load']['result']>;
    showRewarded(placement: string, adGroupId?: string): Promise<GameChannelMethods['ads.show']['result']>;
    showInterstitial(placement: string, adGroupId?: string): Promise<GameChannelMethods['ads.show']['result']>;
    banner(action: 'show' | 'hide' | 'destroy', adGroupId?: string): Promise<GameChannelMethods['ads.banner']['result']>;
  };
  readonly store: {
    products(): Promise<GameChannelMethods['store.products']['result']>;
    purchase(productKey: string): Promise<PurchaseResult>;
    /** 결제 → 지급(grant) → 지급 확인을 한 번에. 채널 메시지는 같다(store.purchase · store.completeOrder). */
    purchase(productKey: string, options: PurchaseOptions): Promise<GrantedPurchaseResult>;
    pendingOrders(): Promise<GameChannelMethods['store.pendingOrders']['result']>;
    completeOrder(orderId: string): Promise<GameChannelMethods['store.completeOrder']['result']>;
    /** 이 플레이어의 구독 — 이용권은 `accessible` 만 보고 연다. 게임존 밖에서는 빈 목록. */
    subscriptions(): Promise<GameChannelMethods['store.subscriptions']['result']>;
  };
  readonly auth: {
    login(): Promise<GameChannelMethods['auth.login']['result']>;
    serverAuthCode(): Promise<GameChannelMethods['auth.serverAuthCode']['result']>;
  };
  readonly social: {
    share(text: string, url?: string): Promise<GameChannelMethods['social.share']['result']>;
    shareLink(path: string): Promise<GameChannelMethods['social.shareLink']['result']>;
    openUrl(url: string): Promise<GameChannelMethods['social.openUrl']['result']>;
  };
  readonly analytics: { track(name: string, params?: PlayParams): Promise<GameChannelMethods['analytics.track']['result']> };
  haptic(strength?: HapticStrength): Promise<GameChannelMethods['haptic']['result']>;
  readonly screen: {
    safeArea(): Promise<SafeArea>;
    setOrientation(orientation: GameOrientation): Promise<GameChannelMethods['screen.setOrientation']['result']>;
  };
  readonly missions: { track(event: string, value?: number): Promise<GameChannelMethods['missions.track']['result']> };
  readonly points: { balance(): Promise<GameChannelMethods['points.balance']['result']> };
  readonly nav: { exit(): Promise<GameChannelMethods['nav.exit']['result']> };
}

declare global {
  interface Window {
    SBPlay?: SBPlay;
    SBPlayLoading?: SBPlayLoading;
  }
}
