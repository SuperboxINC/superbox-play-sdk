import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { checkSdkPolicy } from '../../../../packages/package-core/src/node/sdk-policy-check.ts';

/**
 * 에디터를 켤 때 새 SDK 버전을 알린다 — Unity 에디터의 팝업 · Phaser 플러그인과 같은 정책 파일 · 같은 문구 · 프로젝트마다 하루 한 번이다.
 * 확장은 프로젝트에 복사해 쓰는 폴더라 스스로 갈아 끼우지 않고 설치 안내를 연다. 어떤 실패도 에디터로 던지지 않는다.
 */
export const UPDATE_DOCS_URL = 'https://developers.superboxgo.com/engines/cocos-creator';

const DIALOG_TITLE = 'Superbox Play';
const OPEN_GUIDE = 0;
const LATER = 1;
const BUTTONS = ['설치 안내 보기', '나중에'];
const CHECKED_DATE_FILE = 'temp/superbox-play-update-notice';

/** 이 파일이 쓰는 에디터 API 만 — 시험이 대역을 넣는다 */
export interface UpdateNoticeEditor {
  readonly Dialog: {
    info(message: string, options?: { readonly title?: string; readonly buttons?: string[]; readonly default?: number; readonly cancel?: number }): Promise<{ readonly response: number }>;
  };
  readonly Message: {
    send(pkg: string, message: string, ...args: unknown[]): void;
  };
}

export interface UpdateNoticeOptions {
  readonly editor: UpdateNoticeEditor;
  readonly projectDir: string;
  readonly version: string;
  readonly now?: Date;
}

export async function notifyUpdate(options: UpdateNoticeOptions): Promise<void> {
  const { editor, projectDir, version, now = new Date() } = options;
  try {
    const checkedDateFile = path.join(projectDir, CHECKED_DATE_FILE);
    const today = now.toISOString().slice(0, 10);
    if ((await readFile(checkedDateFile, 'utf8').catch(() => '')) === today) return;
    await mkdir(path.dirname(checkedDateFile), { recursive: true });
    await writeFile(checkedDateFile, today);
    const verdict = await checkSdkPolicy(version);
    if (verdict.kind === 'ok') return;
    const { response } = await editor.Dialog.info(verdict.message, { title: DIALOG_TITLE, buttons: BUTTONS, default: OPEN_GUIDE, cancel: LATER });
    if (response === OPEN_GUIDE) editor.Message.send('program', 'open-url', UPDATE_DOCS_URL);
  } catch (error) {
    console.warn(`[superbox-play] 새 버전을 확인하지 못했어요. ${error instanceof Error ? error.message : String(error)}`);
  }
}
