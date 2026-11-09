import type { SafeArea, SBPlay, SBPlayLoading, SessionInfo } from '../../../sdk/dist/types/index.js';
import type { PhaserGameLike, PluginManagerLike } from './phaser-like.js';
/**
 * Phaser 전역 플러그인 — 3.60 이상과 4 에서 그대로 돈다(둘 다 실제로 돌려 시험한다).
 * Phaser 를 import 하지 않는다: 플러그인 관리자는 `new plugin(pluginManager)` · `init(data)` · `start()` 만 부르므로
 * BasePlugin 을 상속할 까닭이 없고, 상속하면 어느 Phaser 번들을 쓰는지 묶이게 된다.
 *
 * 게임 설정: `plugins: { global: [superboxPlayPlugin()] }` → 씬에서 `this.sbplay`.
 */
export declare const SUPERBOX_PLAY_PLUGIN_KEY = "SuperboxPlay";
export declare const SUPERBOX_PLAY_MAPPING = "sbplay";
/** `game.events` 로 내는 게임 이벤트. */
export declare const SBPLAY_EVENTS: {
    /** 게임존이 일시정지시켰다 — data `{ reason }`. 루프 · 소리는 플러그인이 이미 멈췄다. */
    readonly PAUSE: "sbplay.pause";
    readonly RESUME: "sbplay.resume";
    /** 안전 영역이나 캔버스 크기가 바뀌었다 — data 는 CSS 픽셀 `{ top, bottom, left, right }`. 씬 좌표는 `gameSafeArea` 로 읽는다. */
    readonly SAFE_AREA: "sbplay.safearea";
    /** 플레이어가 바뀌었다 — data = 새 SessionInfo. */
    readonly SESSION: "sbplay.session";
};
export interface SuperboxPlayOptions {
    /** 시작 때 `SBPlay.init()` 을 부른다. 기본 true. */
    readonly autoInit?: boolean;
    /** 첫 씬이 뜨면 로딩 화면을 닫는다. 기본 true — 게임이 직접 닫으려면 false 로 두고 `this.sbplay.loading.complete()`. */
    readonly autoComplete?: boolean;
    /** 파일 하나를 못 받아도 게임을 그대로 띄운다. 기본 false — 오류 화면과 다시 시도를 보인다. */
    readonly ignoreLoadErrors?: boolean;
    /** 로컬에서 실행할 때 새 SDK 버전을 화면에 알린다. 기본 true — 운영 주소에서는 켜져 있어도 아무것도 하지 않는다. */
    readonly updateNotice?: boolean;
}
export declare class SuperboxPlayPlugin {
    #private;
    readonly pluginManager: PluginManagerLike;
    readonly game: PhaserGameLike;
    /** `SBPlay.init()` 이 끝나면 풀린다. SDK 가 없거나 실패하면 null. */
    ready: Promise<SessionInfo | null>;
    session: SessionInfo | null;
    safeArea: SafeArea;
    constructor(pluginManager: PluginManagerLike);
    /** 플러그인 관리자가 부른다 — data 는 `plugins.global[].data`. */
    init(data?: SuperboxPlayOptions | null): void;
    /** 플러그인 관리자가 부른다. 다시 불려도 한 번만 건다. */
    start(): void;
    stop(): void;
    destroy(): void;
    /** 전역 SBPlay — 없으면 부를 때 NOT_CONNECTED 로 거절하는 대체. */
    get sdk(): SBPlay;
    get loading(): SBPlayLoading | null;
    /** `safeArea` 를 씬 좌표로 — 캔버스가 틀과 어긋난 만큼(FIT · ENVELOP)은 이미 뺐다. 스케일 관리자가 없으면 CSS 픽셀 그대로. */
    get gameSafeArea(): SafeArea;
    get call(): SBPlay['call'];
    get ads(): SBPlay['ads'];
    get store(): SBPlay['store'];
    get auth(): SBPlay['auth'];
    get social(): SBPlay['social'];
    get analytics(): SBPlay['analytics'];
    get screen(): SBPlay['screen'];
    get missions(): SBPlay['missions'];
    get points(): SBPlay['points'];
    get nav(): SBPlay['nav'];
    get haptic(): SBPlay['haptic'];
    get on(): SBPlay['on'];
    get off(): SBPlay['off'];
}
/** `plugins.global` 에 넣을 항목. */
export declare function superboxPlayPlugin(data?: SuperboxPlayOptions): {
    readonly key: string;
    readonly plugin: typeof SuperboxPlayPlugin;
    readonly start: true;
    readonly mapping: string;
    readonly data: SuperboxPlayOptions;
};
