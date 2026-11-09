import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { publishSdkPolicy } from '../../../../packages/package-core/src/test-support.ts';
import { notifyUpdate, UPDATE_DOCS_URL, type UpdateNoticeEditor } from './update-notice.ts';

const OPEN_GUIDE = 0;
const LATER = 1;
const DAY = new Date('2026-11-09T03:00:00Z');
const NEXT_DAY = new Date('2026-11-10T03:00:00Z');

interface Asked {
  readonly message: string;
  readonly buttons: readonly string[] | undefined;
}

function fakeEditor(response: number): { readonly editor: UpdateNoticeEditor; readonly asked: Asked[]; readonly opened: string[] } {
  const asked: Asked[] = [];
  const opened: string[] = [];
  return {
    asked,
    opened,
    editor: {
      Dialog: {
        info: async (message, options) => {
          asked.push({ message, buttons: options?.buttons });
          return { response };
        },
      },
      Message: {
        send: (pkg, message, url) => {
          opened.push(`${pkg} ${message} ${String(url)}`);
        },
      },
    },
  };
}

describe('Cocos 새 버전 알림', () => {
  let projectDir = '';
  let close: () => Promise<void> = async () => undefined;

  beforeEach(async () => {
    projectDir = await mkdtemp(path.join(tmpdir(), 'sbp-cocos-update-'));
    close = await publishSdkPolicy({ minVersion: '0.1.0', recommendedVersion: '0.3.0' });
  });

  afterEach(async () => {
    await close();
    await rm(projectDir, { recursive: true, force: true });
  });

  it('새 버전이 있으면 묻고, 안내를 고르면 설치 안내를 연다', async () => {
    const { editor, asked, opened } = fakeEditor(OPEN_GUIDE);

    await notifyUpdate({ editor, projectDir, version: '0.2.0', now: DAY });

    assert.equal(asked.length, 1);
    assert.ok(asked[0]?.message.includes('0.3.0'));
    assert.ok(asked[0]?.message.includes('0.2.0'));
    assert.equal(asked[0]?.buttons?.length, 2);
    assert.deepEqual(opened, [`program open-url ${UPDATE_DOCS_URL}`]);
  });

  it('나중에를 고르면 아무것도 열지 않는다', async () => {
    const { editor, opened } = fakeEditor(LATER);

    await notifyUpdate({ editor, projectDir, version: '0.2.0', now: DAY });

    assert.deepEqual(opened, []);
  });

  it('하루에 한 번만 묻고, 다음 날 다시 묻는다', async () => {
    const { editor, asked } = fakeEditor(LATER);

    await notifyUpdate({ editor, projectDir, version: '0.2.0', now: DAY });
    await notifyUpdate({ editor, projectDir, version: '0.2.0', now: DAY });
    assert.equal(asked.length, 1);

    await notifyUpdate({ editor, projectDir, version: '0.2.0', now: NEXT_DAY });
    assert.equal(asked.length, 2);
  });

  it('최신 버전이면 묻지 않는다', async () => {
    const { editor, asked } = fakeEditor(LATER);

    await notifyUpdate({ editor, projectDir, version: '0.3.0', now: DAY });

    assert.deepEqual(asked, []);
  });

  it('정책을 읽지 못하면 묻지 않고 조용히 끝난다', async () => {
    await close();
    close = await publishSdkPolicy({ minVersion: 'latest', recommendedVersion: '0.3.0' });
    const { editor, asked } = fakeEditor(LATER);

    await notifyUpdate({ editor, projectDir, version: '0.2.0', now: DAY });

    assert.deepEqual(asked, []);
  });

  it('대화상자가 실패해도 에디터로 오류를 던지지 않는다', async () => {
    const editor: UpdateNoticeEditor = {
      Dialog: { info: () => Promise.reject(new Error('no window')) },
      Message: { send: () => undefined },
    };

    await assert.doesNotReject(notifyUpdate({ editor, projectDir, version: '0.2.0', now: DAY }));
  });
});
