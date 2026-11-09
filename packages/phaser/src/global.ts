import { SBPLAY_EVENTS, superboxPlayPlugin, SuperboxPlayPlugin } from './plugin.ts';

/**
 * 번들러 없이 `<script>` 로 쓰는 게임용 — 전역 `SuperboxPlayPhaser`.
 */
(globalThis as unknown as Record<string, unknown>).SuperboxPlayPhaser = { SuperboxPlayPlugin, superboxPlayPlugin, SBPLAY_EVENTS };
