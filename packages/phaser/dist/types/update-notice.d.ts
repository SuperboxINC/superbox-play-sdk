/**
 * 로컬에서 실행할 때 새 SDK 버전을 알린다 — Unity · Cocos 에디터의 창과 같은 정책 파일 · 하루 한 번(이 컴퓨터의 날짜)이다.
 * Phaser 에는 에디터가 없어 게임 화면 위에 띄운다. 운영 주소에서는 묻지도 않고, 어떤 실패도 게임으로 던지지 않는다.
 */
export declare const PLUGIN_VERSION = "0.2.4";
interface NoticeElement {
    id: string;
    type?: string;
    textContent: string | null;
    readonly style: {
        cssText: string;
    };
    setAttribute(name: string, value: string): void;
    append(...items: NoticeElement[]): void;
    addEventListener(type: 'click', listener: () => void): void;
    remove(): void;
}
export interface UpdateNoticeWindow {
    readonly location: {
        readonly hostname: string;
    };
    readonly localStorage: {
        getItem(key: string): string | null;
        setItem(key: string, value: string): void;
    };
    readonly document: {
        readonly body: {
            append(...items: NoticeElement[]): void;
        };
        createElement(tag: string): NoticeElement;
    };
    fetch(url: string, init: {
        readonly signal: AbortSignal;
    }): Promise<{
        readonly ok: boolean;
        json(): Promise<unknown>;
    }>;
}
export declare function showUpdateNotice(win: UpdateNoticeWindow, now?: Date): Promise<void>;
export {};
