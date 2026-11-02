import type { SBPlay, SBPlayLoading } from './types.js';
/**
 * Play SDK 런타임을 불러오는 얇은 진입 — 패키징한 게임은 입구에 태그가 이미 있어 그대로 돌려준다.
 * SDK 는 묶어 넣지 않는다: 게임존과 같은 배포에서 내려가야 게임 채널 버전이 어긋나지 않는다.
 */
export declare const PRODUCTION_ZONE_ORIGIN = "https://game.superboxgo.com";
export declare const SDK_PATH = "/sdk/play/v1.js";
export interface LoadOptions {
    /** 게임존 출처 — 기본은 운영. 로컬 시험은 `http://localhost:8200`. */
    readonly zoneOrigin?: string;
}
export declare class SdkLoadError extends Error {
    readonly code: 'NOT_CONNECTED';
    constructor(message: string);
}
/** 전역 `SBPlay` 를 돌려준다. 없으면 `<script>` 를 넣어 받는다. 실패하면 다음 호출이 다시 시도한다. */
export declare function loadSBPlay(options?: LoadOptions): Promise<SBPlay>;
/** 로딩 API — 부트 런타임이 있으면 그것, 아니면 `SBPlay.loading`, SDK 도 없으면 null. */
export declare function getLoading(): SBPlayLoading | null;
