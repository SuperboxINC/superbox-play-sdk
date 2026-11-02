/**
 * 플러그인이 쓰는 Phaser 표면 — Phaser 3.60+ · 4 공통. 타입을 Phaser 에서 가져오지 않는 까닭은 plugin.ts 머리 주석.
 * 칸은 실제 3.90 · 4.2 소스로 확인했다(src/core/Game.js · src/loader/LoaderPlugin.js · src/plugins/PluginManager.js).
 */
export interface EventsLike {
    on(event: string, listener: (...args: never[]) => void, context?: unknown): unknown;
    once(event: string, listener: (...args: never[]) => void, context?: unknown): unknown;
    off(event: string, listener: (...args: never[]) => void, context?: unknown): unknown;
    emit(event: string, ...args: unknown[]): unknown;
}
export interface LoaderFileLike {
    readonly key?: string;
    readonly src?: string;
    readonly percentComplete?: number;
}
export interface LoaderLike extends Pick<EventsLike, 'on'> {
    readonly totalToLoad?: number;
    readonly totalComplete?: number;
    isLoading?(): boolean;
}
export interface PhaserSceneLike {
    readonly sys?: {
        readonly events?: EventsLike;
        readonly load?: LoaderLike;
        readonly settings?: {
            readonly status?: number;
        };
    };
}
export interface SoundLike {
    pause(): unknown;
    resume(): unknown;
}
export interface SoundManagerLike {
    getAllPlaying?(): readonly SoundLike[];
    pauseAll?(): unknown;
    resumeAll?(): unknown;
}
export interface PhaserGameLike {
    readonly events: EventsLike;
    readonly isPaused: boolean;
    pause(): void;
    resume(): void;
    readonly scene: {
        readonly scenes: readonly PhaserSceneLike[];
    };
    readonly sound?: SoundManagerLike;
}
export interface PluginManagerLike {
    readonly game: PhaserGameLike;
}
