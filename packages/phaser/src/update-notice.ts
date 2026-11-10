import { evaluateSdkPolicy, parseSdkPolicy, SDK_POLICY_URL } from './sdk-policy.ts';

/**
 * 로컬에서 실행할 때 새 SDK 버전을 알린다 — Unity · Cocos 에디터의 팝업과 같은 정책 파일 · 같은 문구 · 하루 한 번이다.
 * Phaser 에는 에디터가 없어 게임 화면 위에 띄운다. 운영 주소에서는 묻지도 않고, 어떤 실패도 게임으로 던지지 않는다.
 */
export const PLUGIN_VERSION = '0.2.1';

const CHECKED_DATE_KEY = 'superbox-play.update-notice';
const TIMEOUT_MS = 2000;
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])$|\.localhost$/;
const INSTALL_SOURCE = 'github:SuperboxINC/superbox-play-sdk';
const BOX_STYLE =
  'position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483647;display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;padding:12px 16px;border-radius:12px;background:#191f28;color:#fff;font:14px/1.5 sans-serif';
const MESSAGE_STYLE = 'flex:1 1 0;min-width:0;margin:0';
const COMMAND_STYLE = 'order:3;flex:1 1 100%;font:12px/1.5 monospace;opacity:.8;user-select:all;word-break:break-all';
const CLOSE_STYLE = 'min-height:32px;padding:0 12px;border:0;border-radius:8px;background:#3182f6;color:#fff;font:600 13px sans-serif;cursor:pointer';

interface NoticeElement {
  id: string;
  type?: string;
  textContent: string | null;
  readonly style: { cssText: string };
  setAttribute(name: string, value: string): void;
  append(...items: NoticeElement[]): void;
  addEventListener(type: 'click', listener: () => void): void;
  remove(): void;
}

export interface UpdateNoticeWindow {
  readonly location: { readonly hostname: string };
  readonly localStorage: { getItem(key: string): string | null; setItem(key: string, value: string): void };
  readonly document: { readonly body: { append(...items: NoticeElement[]): void }; createElement(tag: string): NoticeElement };
  fetch(url: string, init: { readonly signal: AbortSignal }): Promise<{ readonly ok: boolean; json(): Promise<unknown> }>;
}

function element(document: UpdateNoticeWindow['document'], tag: string, style: string, text: string): NoticeElement {
  const created = document.createElement(tag);
  created.style.cssText = style;
  created.textContent = text;
  return created;
}

function render(document: UpdateNoticeWindow['document'], message: string, latestVersion: string): void {
  const box = element(document, 'div', BOX_STYLE, '');
  box.setAttribute('role', 'status');
  const close = element(document, 'button', CLOSE_STYLE, '닫기');
  close.type = 'button';
  close.addEventListener('click', () => box.remove());
  box.append(element(document, 'p', MESSAGE_STYLE, message), close, element(document, 'code', COMMAND_STYLE, `npm install --save-dev ${INSTALL_SOURCE}#v${latestVersion}`));
  document.body.append(box);
}

export async function showUpdateNotice(win: UpdateNoticeWindow, now: Date = new Date()): Promise<void> {
  try {
    if (!LOCAL_HOST.test(win.location.hostname)) return;
    const today = now.toISOString().slice(0, 10);
    if (win.localStorage.getItem(CHECKED_DATE_KEY) === today) return;
    win.localStorage.setItem(CHECKED_DATE_KEY, today);
    const response = await win.fetch(SDK_POLICY_URL, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    const policy = response.ok ? parseSdkPolicy(await response.json()) : null;
    if (!policy) return;
    const verdict = evaluateSdkPolicy(policy, PLUGIN_VERSION);
    if (verdict.kind !== 'ok') render(win.document, verdict.message, verdict.latestVersion);
  } catch {
    // 알림 때문에 게임이 멈추면 안 된다 — 다음 날 다시 묻는다
  }
}
