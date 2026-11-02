/**
 * `superbox-play-sdk/phaser` — Phaser 3.60+ · 4 전역 플러그인.
 *
 *   new Phaser.Game({ plugins: { global: [superboxPlayPlugin()] }, scene: [...] });
 *   // 씬에서: await this.sbplay.ready; this.sbplay.ads.showRewarded('continue');
 */
export * from './plugin.js';
export * from './progress-mixer.js';
export type * from './phaser-like.js';
import type { SuperboxPlayPlugin } from './plugin.js';
declare global {
    namespace Phaser {
        interface Scene {
            sbplay: SuperboxPlayPlugin;
        }
    }
}
