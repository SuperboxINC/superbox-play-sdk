export interface ProgressMixer {
    startLoader(fileCount: number): void;
    /** 이 로더의 0~1 → 전체 0~1. 뒤로 가지 않는다. */
    update(fraction: number): number;
    endLoader(): void;
}
export declare function createProgressMixer(): ProgressMixer;
