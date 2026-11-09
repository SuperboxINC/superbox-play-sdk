import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { toGameInsets } from './safe-area.ts';

/**
 * 게임존이 주는 안전 영역(게임 틀 기준 CSS 픽셀)을 게임 좌표로 — Phaser 의 FIT · ENVELOP 처럼 캔버스가 틀과 어긋나는 경우까지.
 */
const INSETS = { top: 88, bottom: 34, left: 0, right: 0 };
const VIEWPORT = { width: 390, height: 844 };

describe('toGameInsets', () => {
  it('scales CSS pixels to game units when the canvas fills the frame', () => {
    const insets = toGameInsets(INSETS, { x: 0, y: 0, width: 390, height: 844 }, { x: 2, y: 2 }, VIEWPORT);
    assert.deepEqual(insets, { top: 176, bottom: 68, left: 0, right: 0 });
  });

  it('counts only what reaches past the margin of a letterboxed canvas', () => {
    // FIT — 위 30 · 아래 14 여백
    const insets = toGameInsets(INSETS, { x: 0, y: 30, width: 390, height: 800 }, { x: 2, y: 2 }, VIEWPORT);
    assert.deepEqual(insets, { top: 116, bottom: 40, left: 0, right: 0 });
  });

  it('gives zero when the margin is wider than the inset', () => {
    const insets = toGameInsets(INSETS, { x: 0, y: 100, width: 390, height: 644 }, { x: 2, y: 2 }, VIEWPORT);
    assert.deepEqual(insets, { top: 0, bottom: 0, left: 0, right: 0 });
  });

  it('uses each axis for its own sides', () => {
    const insets = toGameInsets({ top: 10, bottom: 10, left: 44, right: 44 }, { x: 4, y: 0, width: 836, height: 390 }, { x: 0.5, y: 2 }, { width: 844, height: 390 });
    assert.deepEqual(insets, { top: 20, bottom: 20, left: 20, right: 20 });
  });

  it('counts a cropped canvas edge as covered', () => {
    // ENVELOP — 캔버스가 틀 밖으로 위아래 20 씩 나갔다
    const insets = toGameInsets({ top: 0, bottom: 0, left: 0, right: 0 }, { x: 0, y: -20, width: 390, height: 884 }, { x: 1, y: 1 }, VIEWPORT);
    assert.deepEqual(insets, { top: 20, bottom: 20, left: 0, right: 0 });
  });

  it('treats an unusable scale as one, before the canvas has a size', () => {
    const insets = toGameInsets(INSETS, { x: 0, y: 0, width: 0, height: 0 }, { x: Number.POSITIVE_INFINITY, y: Number.NaN }, VIEWPORT);
    assert.equal(insets.top, 88);
    assert.ok(Number.isFinite(insets.bottom));
  });
});
