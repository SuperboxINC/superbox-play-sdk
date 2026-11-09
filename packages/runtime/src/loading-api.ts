import type { LoadingAppInfo, LoadingErrorCode, LoadingErrorInfo, LoadingSignal, LoadingView, SBPlayLoadingApi } from './types.ts';

/**
 * `window.SBPlayLoading` 의 상태 — package-format.md 6장. 화면과 게임존 신호는 밖에서 받아 DOM 없이 시험한다.
 * 게임 콜백이 던져도 로딩 흐름은 멈추지 않는다(fail-open).
 */
export interface LoadingEnv {
  readonly appInfo: LoadingAppInfo;
  readonly view: LoadingView;
  post(signal: LoadingSignal): void;
  now(): number;
  later(callback: () => void, ms: number): void;
  report(error: unknown): void;
  classify(message: string): LoadingErrorCode;
}

export interface LoadingController {
  readonly api: SBPlayLoadingApi;
  fail(code: LoadingErrorCode, message: string): void;
  setAppInfo(patch: Partial<LoadingAppInfo>): void;
  isComplete(): boolean;
  hasFailed(): boolean;
  /** 진행률 신호가 한 번이라도 왔는지 — 정체 감시는 신호가 있을 때만 판단할 수 있다. */
  hasProgress(): boolean;
  lastProgress(): number;
  lastMoveAt(): number;
}

/** 게임존이 값을 믿지 않지만 긴 글을 보낼 까닭도 없다. */
const MAX_MESSAGE_LENGTH = 200;
const PROGRESS_SIGNAL_INTERVAL_MS = 100;

function errorText(value: unknown): string {
  if (value instanceof Error) return value.message;
  return typeof value === 'string' ? value : String(value);
}

export function createLoading(env: LoadingEnv): LoadingController {
  let appInfo = env.appInfo;
  let progress = 0;
  let progressSeen = false;
  let movedAt = env.now();
  let signaledAt = -Infinity;
  let signalQueued = false;
  let completed = false;
  let failure: LoadingErrorInfo | null = null;
  const readyCallbacks: ((info: LoadingAppInfo) => void)[] = [];
  const progressCallbacks: ((value: number) => void)[] = [];
  const completeCallbacks: (() => void)[] = [];
  const errorCallbacks: ((error: LoadingErrorInfo) => void)[] = [];

  const invoke = <T>(callback: (value: T) => void, value: T): void => {
    try {
      callback(value);
    } catch (error) {
      env.report(error);
    }
  };

  // 마지막 값을 잃지 않는다 — 빠르게 오른 뒤 긴 로드에서 멈추면 게임존이 본 값은 멈춘 값이어야 한다
  const signalProgress = (): void => {
    const wait = signaledAt + PROGRESS_SIGNAL_INTERVAL_MS - env.now();
    if (wait <= 0) {
      signaledAt = env.now();
      env.post({ stage: 'progress', progress });
    } else if (!signalQueued) {
      signalQueued = true;
      env.later(() => {
        signalQueued = false;
        if (!completed) signalProgress();
      }, wait);
    }
  };

  const fail = (code: LoadingErrorCode, message: string): void => {
    if (completed || failure) return;
    failure = { code, message: message.slice(0, MAX_MESSAGE_LENGTH) };
    env.view.showError(failure, appInfo);
    env.post({ stage: 'error', ...failure });
    for (const callback of errorCallbacks) invoke(callback, failure);
  };

  const api: SBPlayLoadingApi = {
    get appInfo() {
      return appInfo;
    },
    autoComplete: true,
    onReady(callback) {
      readyCallbacks.push(callback);
      invoke(callback, appInfo);
    },
    onProgress(callback) {
      progressCallbacks.push(callback);
      if (progressSeen) invoke(callback, progress);
    },
    onComplete(callback) {
      if (completed) invoke(callback, undefined);
      else completeCallbacks.push(callback);
    },
    onError(callback) {
      errorCallbacks.push(callback);
      if (failure) invoke(callback, failure);
    },
    progress(value) {
      if (completed || typeof value !== 'number' || !Number.isFinite(value)) return;
      const next = Math.min(1, Math.max(0, value));
      const first = !progressSeen;
      progressSeen = true;
      if (next <= progress && !first) return;
      if (next > progress) movedAt = env.now();
      progress = Math.max(progress, next);
      env.view.setProgress(progress);
      signalProgress();
      for (const callback of progressCallbacks) invoke(callback, progress);
    },
    complete() {
      if (completed) return;
      completed = true;
      progress = 1;
      progressSeen = true;
      env.view.setProgress(1);
      env.post({ stage: 'ready', elapsedMs: Math.round(env.now()) });
      env.view.hide();
      // 그사이 오류 화면이 떠 있었어도 게임이 준비됐다고 했으면 게임을 믿는다
      if (failure) env.view.hideError();
      for (const callback of progressCallbacks) invoke(callback, 1);
      for (const callback of completeCallbacks.splice(0)) invoke(callback, undefined);
    },
    error(message) {
      const text = errorText(message);
      fail(env.classify(text), text);
    },
    hide() {
      env.view.hide();
    },
  };

  return {
    api,
    fail,
    setAppInfo(patch) {
      appInfo = { ...appInfo, ...patch };
      env.view.setAppInfo(appInfo);
      for (const callback of readyCallbacks) invoke(callback, appInfo);
    },
    isComplete: () => completed,
    hasFailed: () => failure !== null,
    hasProgress: () => progressSeen,
    lastProgress: () => progress,
    lastMoveAt: () => movedAt,
  };
}
