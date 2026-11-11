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

/**
 * 기기 저장 자리 — Unity WebGL 은 PlayerPrefs · persistentDataPath 를 IndexedDB 의 /idbfs/md5(문서 주소의 폴더)에 둔다. 게임 문서는
 * `<게임 주소>/<빌드 키>/index.html` 이라 버전마다 폴더가 바뀌어, 새 버전마다 기기 진행과 PlayerPrefs 에 둔 게스트 계정이 처음부터 시작했다. 프레임워크는
 * 그 폴더를 document.URL 로 읽는다(_JS_SystemInfo_GetDocumentURL) — 로더를 부르기 전에 document.URL 을 버전과 상관없는 주소로 덮는다.
 * 이 이름은 바꾸지 않는다 — 바꾸면 그날 모든 Unity 게임의 기기 저장이 다시 끊긴다(운영에서는 먼저 같은 고정을 넣은 게임의 값과 같다)
 */
const STABLE_DOCUMENT_PATH = '../persistent/index.html';
const DEFAULT_STREAMING_ASSETS = 'StreamingAssets';

type UnityInstanceFactory = (canvas: unknown, config?: Record<string, unknown>, onProgress?: (progress: number) => void) => Promise<unknown>;

export interface UnityWindow {
  createUnityInstance?: UnityInstanceFactory;
}

/**
 * 버전과 상관없는 문서 주소 — 게임 문서 폴더(빌드 키)의 위 폴더 + persistent/index.html. 쿼리는 그대로 둔다(Unity 는 ? 뒤를 저장 자리에 넣지 않고,
 * Application.absoluteURL 은 쿼리를 읽는다), # 뒤는 뺀다. 운영 `https://<게임>.superboxgo.com/<빌드 키>/index.html` → `https://<게임>.superboxgo.com/persistent/index.html`
 */
export function stableDocumentUrl(realHref: string): string {
  // 상대 주소는 문서 폴더 기준으로 풀린다 — '../' 가 빌드 키 폴더 하나를 올라간다(맨 위 폴더면 그 자리). # 은 싣지 않아 빠진다
  return new URL(STABLE_DOCUMENT_PATH + new URL(realHref).search, realHref).href;
}

/** document.URL 을 그 값으로 덮는다 — 문서 객체에 읽기 속성을 둬 Document.prototype 의 것을 가린다. 브라우저가 거절하면 false */
export function pinDocumentUrl(doc: { readonly URL: string }, url: string): boolean {
  try {
    Object.defineProperty(doc, 'URL', { configurable: true, get: () => url });
    return doc.URL === url;
  } catch {
    return false;
  }
}

export interface UnityGlueEnv {
  /** location.href = 실제 문서 주소(저장 자리 고정의 기준) */
  readonly win: UnityWindow & { readonly location: { readonly href: string } };
  /** URL = 지금 document.URL — 템플릿이 먼저 덮었을 수 있다 */
  readonly doc: Pick<Document, 'addEventListener' | 'removeEventListener' | 'URL'>;
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
  const { loading, win, doc } = env;
  // 한 번 덮으면 그 문서가 끝날 때까지 그대로 — 두 번째 부름도 streamingAssetsUrl 을 실제 위치로 푼다(document.URL 은 이미 덮은 값이다)
  let pinned = false;
  const storageConfig = (config: Record<string, unknown> | undefined): Record<string, unknown> | undefined => {
    try {
      const real = win.location.href;
      // 템플릿이 먼저 덮었으면(document.URL 이 실제 주소와 다르다) 그 값을 둔다 — 그 게임은 streamingAssetsUrl 도 스스로 준다
      pinned ||= doc.URL === real && pinDocumentUrl(doc, stableDocumentUrl(real));
      if (!pinned) return config;
      // 로더는 streamingAssetsUrl 을 document.URL 기준으로 푼다 — 덮은 주소가 아니라 실제 위치 기준 절대 주소로(템플릿 설정은 고치지 않는다)
      const given = config?.streamingAssetsUrl;
      return { ...config, streamingAssetsUrl: new URL(typeof given === 'string' && given ? given : DEFAULT_STREAMING_ASSETS, real).href };
    } catch {
      return config;
    }
  };
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
    return original.call(this, canvas, withPixelRatio(storageConfig(config), ratio), report).then(
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
