import type { LoadingController } from './loading-api.ts';
import type { BootConfig, LoadingErrorCode } from './types.ts';

/**
 * 로드 오류 감지 — 스크립트 실패 · WebGL 컨텍스트 실패 · 잡히지 않은 초기 오류 → 오류 화면(package-format.md 5장).
 * 첫 화면이 뜬 뒤(complete)에는 보지 않는다. 게임을 멈출 일이 아닌 것은 넘긴다:
 * 다른 출처 스크립트(분석 도구 등) 실패 · 상세 없는 `Script error.` · ResizeObserver 알림 · Play SDK 태그 실패(게임이 SBPlay 를 안 쓰면 돈다).
 */
const WEBGL_MESSAGE = /webgl|glctx|gl context|context lost/i;
const IGNORED_MESSAGE = /^script error\.?$|ResizeObserver loop/i;
const SDK_SCRIPT = /\/sdk\/play\/v1\.js([?#]|$)/;
/** 비동기 오류는 재생 차단처럼 무해한 것이 많다 — 코드 조각을 못 받은 경우만 본다. */
const CHUNK_FAILURE = /dynamically imported module|importing a module script failed|loading chunk|chunkloaderror|unable to (?:load|resolve) (?:specifier|bare)/i;

export interface ErrorWatchEnv {
  readonly win: Window;
  readonly config: BootConfig;
  readonly loading: LoadingController;
}

export interface ErrorWatch {
  classify(message: string): LoadingErrorCode;
}

/** loading 보다 먼저 분류기가 필요해서 둘로 나눈다. */
export function createClassifier(config: BootConfig, webglFailed: () => boolean): (message: string) => LoadingErrorCode {
  return (message) => {
    if (WEBGL_MESSAGE.test(message) || webglFailed()) return 'WEBGL_CONTEXT';
    return config.engine === 'html5' ? 'UNKNOWN' : 'ENGINE_INIT';
  };
}

function sameOrigin(url: string, win: Window): boolean {
  try {
    return new URL(url, win.location.href).origin === win.location.origin;
  } catch {
    return false;
  }
}

export function installErrorWatch(env: ErrorWatchEnv, classify: (message: string) => LoadingErrorCode, onWebglFailure: () => void): void {
  const { win, loading } = env;

  const onScriptError = (script: HTMLScriptElement): void => {
    const src = script.src;
    if (!src || SDK_SCRIPT.test(src) || !sameOrigin(src, win)) return;
    loading.fail('SCRIPT_LOAD', src);
  };

  win.addEventListener(
    'error',
    (event: Event) => {
      if (loading.isComplete()) return;
      const target = event.target;
      if (target instanceof HTMLScriptElement) {
        onScriptError(target);
        return;
      }
      if (target instanceof Element) return;
      const { message, filename } = event as ErrorEvent;
      if (!message || IGNORED_MESSAGE.test(message)) return;
      if (filename && !sameOrigin(filename, win)) return;
      loading.fail(classify(message), message);
    },
    true,
  );

  win.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    if (loading.isComplete()) return;
    const reason: unknown = event.reason;
    const text = reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason);
    if (CHUNK_FAILURE.test(text)) loading.fail('SCRIPT_LOAD', text);
  });

  // 캔버스가 문서에 있을 때만 오고, webgl2 만 실패하고 webgl 로 내려가는 경우도 있어 바로 멈추지 않는다 — 다음 오류를 WebGL 로 분류한다
  win.addEventListener('webglcontextcreationerror', onWebglFailure, true);
}
