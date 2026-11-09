import type { SafeArea } from '../../../sdk/dist/types/index.js';
/** 틀 안 캔버스 자리(CSS 픽셀) — ScaleManager.canvasBounds. */
export interface CanvasBounds {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}
/** CSS 픽셀 하나가 게임 좌표로 얼마인지 — ScaleManager.displayScale. */
export interface DisplayScale {
    readonly x: number;
    readonly y: number;
}
export interface ViewportSize {
    readonly width: number;
    readonly height: number;
}
/**
 * 게임존이 준 안전 영역(게임 틀 기준 CSS 픽셀)을 게임 좌표로 옮긴다.
 * 캔버스가 틀 안쪽에 떠 있으면(FIT) 그 여백만큼은 게임을 가리지 않고, 틀 밖으로 나갔으면(ENVELOP) 잘린 만큼 더 가린다.
 */
export declare function toGameInsets(insets: SafeArea, canvas: CanvasBounds, scale: DisplayScale, viewport: ViewportSize): SafeArea;
