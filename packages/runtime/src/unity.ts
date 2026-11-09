import type { LoadingController } from './loading-api.ts';
import type { LoadingErrorCode } from './types.ts';

/**
 * Unity 접착 — `createUnityInstance` 를 감싸 진행률 · 준비 · 픽셀 비율을 잇는다. 템플릿을 고치지 않으므로 어떤 템플릿이든 된다.
 *
 * 로더의 `function createUnityInstance` 는 전역 함수 선언이라 setter 로는 가로챌 수 없다(선언이 속성을 덮어쓴다).
 * 로더 `<script>` 의 load 이벤트를 document 캡처로 받으면 템플릿의 `script.onload` 보다 먼저 돈다 — 그때 바꿔 넣는다.
 * load 는 window 까지 오지 않아 document 에 건다. 인라인으로 합친 로더처럼 load 가 없는 경우를 위해 잠깐 살펴본다.
 */
const POLL_MS = 50;
const POLL_LIMIT_MS = 30_000;

type UnityInstanceFactory = (canvas: unknown, config?: Record<string, unknown>, onProgress?: (progress: number) => void) => Promise<unknown>;

export interface UnityWindow {
  createUnityInstance?: UnityInstanceFactory;
}

export interface UnityGlueEnv {
  readonly win: UnityWindow;
  readonly doc: Pick<Document, 'addEventListener' | 'removeEventListener'>;
  readonly loading: LoadingController;
  pixelRatio(): number | null;
  classify(message: string): LoadingErrorCode;
  /** 첫 프레임을 내줄 틈 — 이 뒤에 로딩 화면을 닫는다. */
  afterFrame(callback: () => void): void;
  setInterval(callback: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
  now(): number;
}

function withPixelRatio(config: Record<string, unknown> | undefined, ratio: number | null): Record<string, unknown> | undefined {
  if (ratio === null) return config;
  const existing = config?.devicePixelRatio;
  return { ...config, devicePixelRatio: typeof existing === 'number' ? Math.min(existing, ratio) : ratio };
}

function wrapFactory(original: UnityInstanceFactory, env: UnityGlueEnv): UnityInstanceFactory {
  const { loading } = env;
  return function wrapped(this: unknown, canvas, config, onProgress) {
    loading.api.autoComplete = false;
    loading.api.progress(0);
    let ratio: number | null = null;
    try {
      ratio = env.pixelRatio();
    } catch {
      ratio = null;
    }
    const report = (progress: number): void => {
      loading.api.progress(progress);
      onProgress?.(progress);
    };
    return original.call(this, canvas, withPixelRatio(config, ratio), report).then(
      (instance) => {
        env.afterFrame(() => loading.api.complete());
        return instance;
      },
      (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        loading.fail(env.classify(message), message);
        throw error;
      },
    );
  };
}

export function installUnityGlue(env: UnityGlueEnv): void {
  const { win, doc, loading } = env;
  let wrapped = false;
  let timer: unknown;

  const stop = (): void => {
    doc.removeEventListener('load', tryWrap, true);
    env.clearInterval(timer);
  };
  const tryWrap = (): void => {
    if (wrapped) return;
    const factory = win.createUnityInstance;
    if (typeof factory !== 'function') return;
    wrapped = true;
    win.createUnityInstance = wrapFactory(factory, env);
    stop();
  };

  const startedAt = env.now();
  doc.addEventListener('load', tryWrap, true);
  timer = env.setInterval(() => {
    tryWrap();
    if (!wrapped && (loading.isComplete() || env.now() - startedAt > POLL_LIMIT_MS)) stop();
  }, POLL_MS);
}
