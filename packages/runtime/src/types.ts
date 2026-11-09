/**
 * 부트 런타임 공용 꼴 — package-format.md 6 · 7장. 게임이 보는 타입은 @superbox-play/sdk 가 따로 내고 시험이 대조한다.
 */
export const LOADING_ERROR_CODES = ['SCRIPT_LOAD', 'WEBGL_CONTEXT', 'ENGINE_INIT', 'WATCHDOG', 'UNKNOWN'] as const;
export type LoadingErrorCode = (typeof LOADING_ERROR_CODES)[number];

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

/** `window.SBPlayLoading` — 6장. */
export interface SBPlayLoadingApi {
  readonly appInfo: LoadingAppInfo;
  autoComplete: boolean;
  onReady(callback: (info: LoadingAppInfo) => void): void;
  onProgress(callback: (progress: number) => void): void;
  onComplete(callback: () => void): void;
  onError(callback: (error: LoadingErrorInfo) => void): void;
  progress(value: number): void;
  complete(): void;
  error(message: unknown): void;
  hide(): void;
}

export type LoadingSignal =
  | { readonly stage: 'shell' }
  | { readonly stage: 'progress'; readonly progress: number }
  | { readonly stage: 'ready'; readonly elapsedMs: number }
  | { readonly stage: 'error'; readonly code: LoadingErrorCode; readonly message: string };

export interface LoadingView {
  /** 로딩 화면이 문서에 들어온 뒤 한 번. */
  attach(): void;
  setProgress(progress: number): void;
  setAppInfo(info: LoadingAppInfo): void;
  hide(): void;
  showError(error: LoadingErrorInfo, info: LoadingAppInfo): void;
  hideError(): void;
}

/** 부트 설정 — package-core `BootConfig` 와 같은 모양(inject 가 JSON 으로 넣는다). */
export interface BootConfig {
  readonly zoneOrigin: string;
  readonly engine: 'unity' | 'cocos' | 'phaser' | 'html5';
  readonly mode: 'default' | 'theme' | 'custom';
  readonly title: string | null;
  readonly iconUrl: string | null;
  readonly primaryColor: string;
  readonly backgroundColor: string;
  readonly tips: readonly string[];
  readonly earlyFetch: readonly string[];
  readonly maxDevicePixelRatio: number | 'auto';
  readonly watchdog: boolean;
}

export interface SBPlayBootGlobal {
  readonly config: BootConfig;
  /** 입구가 로딩 화면 바로 뒤에서 부른다. */
  shell?: () => void;
  /** 권장 픽셀 비율 — 엔진 어댑터가 읽는다. 데스크톱 + auto 면 null(손대지 않는다). */
  pixelRatio?: number | null;
}
