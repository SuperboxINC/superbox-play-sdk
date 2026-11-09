import type { SafeArea } from '@superbox-play/sdk';

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

/** 캔버스에 크기가 잡히기 전에는 0 으로 나눈 값이 온다. */
function usableFactor(factor: number): number {
  return Number.isFinite(factor) && factor > 0 ? factor : 1;
}

/**
 * 게임존이 준 안전 영역(게임 틀 기준 CSS 픽셀)을 게임 좌표로 옮긴다.
 * 캔버스가 틀 안쪽에 떠 있으면(FIT) 그 여백만큼은 게임을 가리지 않고, 틀 밖으로 나갔으면(ENVELOP) 잘린 만큼 더 가린다.
 */
export function toGameInsets(insets: SafeArea, canvas: CanvasBounds, scale: DisplayScale, viewport: ViewportSize): SafeArea {
  const covered = (inset: number, gap: number, factor: number): number => Math.max(0, inset - gap) * usableFactor(factor);
  return {
    top: covered(insets.top, canvas.y, scale.y),
    bottom: covered(insets.bottom, viewport.height - (canvas.y + canvas.height), scale.y),
    left: covered(insets.left, canvas.x, scale.x),
    right: covered(insets.right, viewport.width - (canvas.x + canvas.width), scale.x),
  };
}
