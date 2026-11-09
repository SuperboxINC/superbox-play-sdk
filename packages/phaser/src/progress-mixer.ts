/**
 * 로더 여러 개의 진행률을 하나로 — Boot 씬(파일 한두 개) → Preload 씬(수백 개) 흐름에서
 * 첫 로더가 막대를 끝까지 밀어 놓고 정작 긴 로드 동안 멈춘 것처럼 보이지 않게 한다.
 * 뒤에 또 로더가 오는지 모르므로, 파일이 적은 로더일수록 작은 몫만 쓴다. 나머지는 첫 씬이 뜰 때 complete 가 채운다.
 */
const MAX_BEFORE_SCENE = 0.9;
/** 파일 수 n 인 첫 로더의 몫 = n / (n + 이 값) — 1개 18% · 10개 64% · 100개 86%. */
const FIRST_LOADER_DAMPING = 4;

export interface ProgressMixer {
  startLoader(fileCount: number): void;
  /** 이 로더의 0~1 → 전체 0~1. 뒤로 가지 않는다. */
  update(fraction: number): number;
  endLoader(): void;
}

export function createProgressMixer(): ProgressMixer {
  let base = 0;
  let cap = MAX_BEFORE_SCENE;
  let current = 0;
  let loaders = 0;
  return {
    startLoader(fileCount) {
      base = current;
      const count = Math.max(1, fileCount);
      cap = loaders === 0 ? (MAX_BEFORE_SCENE * count) / (count + FIRST_LOADER_DAMPING) : MAX_BEFORE_SCENE;
      loaders += 1;
    },
    update(fraction) {
      const clamped = Math.min(1, Math.max(0, fraction));
      current = Math.max(current, base + (Math.max(cap, base) - base) * clamped);
      return current;
    },
    endLoader() {
      base = current;
    },
  };
}
