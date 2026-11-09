import type { SBPlay, SBPlayLoading } from './types.ts';

/**
 * Play SDK 런타임을 불러오는 얇은 진입 — 패키징한 게임은 입구에 태그가 이미 있어 그대로 돌려준다.
 * SDK 는 묶어 넣지 않는다: 게임존과 같은 배포에서 내려가야 게임 채널 버전이 어긋나지 않는다.
 */
export const PRODUCTION_ZONE_ORIGIN = 'https://game.superboxgo.com';
export const SDK_PATH = '/sdk/play/v1.js';

const LOCAL_HTTP_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|[^/]+\.localhost)$/;

export interface LoadOptions {
  /** 게임존 출처 — 기본은 운영. 로컬 시험은 `http://localhost:8200`. */
  readonly zoneOrigin?: string;
}

export class SdkLoadError extends Error {
  readonly code: 'NOT_CONNECTED' = 'NOT_CONNECTED';

  constructor(message: string) {
    super(message);
    this.name = 'SdkLoadError';
  }
}

function assertZoneOrigin(origin: string): void {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new SdkLoadError(`잘못된 게임존 주소: ${origin}`);
  }
  const allowed = url.protocol === 'https:' || (url.protocol === 'http:' && LOCAL_HTTP_HOST.test(url.hostname));
  if (!allowed || url.origin !== origin) throw new SdkLoadError(`잘못된 게임존 주소: ${origin}`);
}

let loading: Promise<SBPlay> | null = null;

/** 전역 `SBPlay` 를 돌려준다. 없으면 `<script>` 를 넣어 받는다. 실패하면 다음 호출이 다시 시도한다. */
export function loadSBPlay(options: LoadOptions = {}): Promise<SBPlay> {
  if (window.SBPlay) return Promise.resolve(window.SBPlay);
  if (loading) return loading;
  const zoneOrigin = options.zoneOrigin ?? PRODUCTION_ZONE_ORIGIN;
  try {
    assertZoneOrigin(zoneOrigin);
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new SdkLoadError(String(error)));
  }
  loading = new Promise<SBPlay>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${zoneOrigin}${SDK_PATH}`;
    script.onload = () => {
      if (window.SBPlay) resolve(window.SBPlay);
      else reject(new SdkLoadError('Play SDK를 불러왔지만 전역 SBPlay가 없어요'));
    };
    script.onerror = () => reject(new SdkLoadError(`Play SDK를 불러오지 못했어요: ${script.src}`));
    document.head.appendChild(script);
  }).finally(() => {
    loading = null;
  });
  return loading;
}

/** 로딩 API — 부트 런타임이 있으면 그것, 아니면 `SBPlay.loading`, SDK 도 없으면 null. */
export function getLoading(): SBPlayLoading | null {
  return window.SBPlayLoading ?? window.SBPlay?.loading ?? null;
}
