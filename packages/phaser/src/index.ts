/**
 * `superbox-play-sdk/phaser` — Phaser 3.60+ · 4 전역 플러그인.
 *
 *   new Phaser.Game({ plugins: { global: [superboxPlayPlugin()] }, scene: [...] });
 *   // 씬에서: await this.sbplay.ready; this.sbplay.ads.showRewarded('continue');
 */
export * from './plugin.ts';
export * from './progress-mixer.ts';
export type * from './phaser-like.ts';

import type { SuperboxPlayPlugin } from './plugin.ts';

declare global {
  // Phaser 타입이 있는 프로젝트에서 `this.sbplay` 를 쓸 수 있게 한다
  namespace Phaser {
    interface Scene {
      sbplay: SuperboxPlayPlugin;
    }
  }
}
