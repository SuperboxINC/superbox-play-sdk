import type { LoadingController } from './loading-api.ts';

/**
 * 정체 감시 — 다운로드가 오류 없이 조용히 멈추는 연결(좀비 커넥션)에서 진행률이 영원히 그대로인 문제.
 * 0.9 위는 WASM 컴파일처럼 진행률이 뜸한 구간이라 보지 않는다. 진행률 신호를 한 번도 받지 못한 게임은 판단할 근거가 없어 보지 않는다.
 * 숨겨진 동안은 잴 수 없다. 자원이 계속 끝나고 있으면(Resource Timing) 멈춘 것이 아니다.
 */
export const STALL_LIMIT_MS = 60_000;
const CHECK_INTERVAL_MS = 10_000;
const WATCHED_BELOW = 0.9;

export interface WatchdogEnv {
  readonly loading: LoadingController;
  now(): number;
  isHidden(): boolean;
  resourceCount(): number;
  /** 새로고침해도 되면 새로고침하고 true. */
  reload(): boolean;
  setInterval(callback: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export function installWatchdog(env: WatchdogEnv): void {
  let lastActivity = env.now();
  let resources = env.resourceCount();
  const timer = env.setInterval(() => {
    const { loading } = env;
    if (loading.isComplete() || loading.hasFailed()) {
      env.clearInterval(timer);
      return;
    }
    const count = env.resourceCount();
    if (count !== resources || env.isHidden()) {
      resources = count;
      lastActivity = env.now();
    }
    if (!loading.hasProgress() || loading.lastProgress() >= WATCHED_BELOW) return;
    if (env.now() - Math.max(lastActivity, loading.lastMoveAt()) < STALL_LIMIT_MS) return;
    env.clearInterval(timer);
    if (!env.reload()) loading.fail('WATCHDOG', 'loading stalled');
  }, CHECK_INTERVAL_MS);
}
