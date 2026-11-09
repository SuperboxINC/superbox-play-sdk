import type { LoadingController } from './loading-api.ts';
import type { LoadingErrorCode } from './types.ts';

/**
 * Cocos 안전망 — 런타임 조각(SuperboxPlay)을 import 하지 않은 게임도 첫 씬까지 덮어 준다.
 * Cocos 는 window.load 뒤에야 엔진이 뜨는 경우가 있어 일반 autoComplete 로는 첫 씬 전에 닫혀 검은 화면이 보인다.
 * 조각이 있으면 `autoComplete = false` 로 가져가고 여기서는 물러난다. 제한 시간이 지나면 어떤 경우든 닫는다(fail-open).
 */
const POLL_MS = 100;
export const COCOS_FALLBACK_LIMIT_MS = 60_000;
const ENGINE_SEEN_PROGRESS = 0.3;

export interface CocosGlobal {
  readonly director?: { getScene?: () => unknown };
}

export interface CocosGlueEnv {
  readonly win: { readonly cc?: CocosGlobal; readonly console: { error: (...args: unknown[]) => void } };
  readonly loading: LoadingController;
  now(): number;
  classify(message: string): LoadingErrorCode;
  setInterval(callback: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export function installCocosGlue(env: CocosGlueEnv): void {
  const { win, loading } = env;
  const startedAt = env.now();
  let engineSeen = false;
  const sceneIsUp = (): boolean => Boolean(win.cc?.director?.getScene?.());

  // 빌드 템플릿의 index.js 가 엔진 시작 실패를 `.catch(console.error)` 로 삼켜 오류 감지에 오지 않는다 — WebGL 이 없는 기기가 1분 동안 로딩을 본다.
  // 엔진의 오류 코드 로그(문자열)는 넘기고 Error 객체 하나만 넘긴 호출을 본다. 게임이 남긴 것이어도 씬이 뜨면 아래가 오류 화면을 걷는다
  const log = win.console;
  const original = log.error;
  log.error = (...args: unknown[]): void => {
    const [first] = args;
    if (args.length === 1 && first instanceof Error && !sceneIsUp()) loading.fail(env.classify(first.message), first.message);
    original.apply(log, args);
  };

  const timer = env.setInterval(() => {
    if (loading.isComplete() || !loading.api.autoComplete) {
      env.clearInterval(timer);
      return;
    }
    if (win.cc && !engineSeen) {
      engineSeen = true;
      loading.api.progress(ENGINE_SEEN_PROGRESS);
    }
    const expired = env.now() - startedAt > COCOS_FALLBACK_LIMIT_MS;
    if (!sceneIsUp() && !expired) return;
    env.clearInterval(timer);
    // 씬이 떴으면 게임을 믿는다. 시간만 지났으면 오류 화면을 걷지 않는다 — 걷으면 검은 화면이다
    if (sceneIsUp() || !loading.hasFailed()) loading.api.complete();
  }, POLL_MS);
}
