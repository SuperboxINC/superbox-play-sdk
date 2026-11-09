import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import type { PluginManagerLike } from './phaser-like.ts';
import { SuperboxPlayPlugin } from './plugin.ts';
import { PLUGIN_VERSION, showUpdateNotice, type UpdateNoticeWindow } from './update-notice.ts';

const NEWER_POLICY = { schemaVersion: 1, minVersion: '0.1.0', recommendedVersion: '9.0.0' };
const DAY = new Date('2026-11-09T03:00:00Z');
const NEXT_DAY = new Date('2026-11-10T03:00:00Z');

class FakeElement {
  id = '';
  type = '';
  textContent = '';
  removed = false;
  readonly style = { cssText: '' };
  readonly children: FakeElement[] = [];
  readonly #listeners = new Map<string, () => void>();

  setAttribute(): void {}

  append(...items: FakeElement[]): void {
    this.children.push(...items);
  }

  addEventListener(type: string, listener: () => void): void {
    this.#listeners.set(type, listener);
  }

  remove(): void {
    this.removed = true;
  }

  click(): void {
    this.#listeners.get('click')?.();
  }

  get allText(): string {
    return [this.textContent, ...this.children.map((child) => child.allText)].join(' ');
  }
}

function fakeWindow(options: { readonly host?: string; readonly policy?: unknown; readonly offline?: boolean; readonly noStorage?: boolean } = {}) {
  const store = new Map<string, string>();
  const body = new FakeElement();
  const asked = { count: 0 };
  const win = {
    location: { hostname: options.host ?? 'localhost' },
    get localStorage() {
      if (options.noStorage) throw new Error('blocked');
      return { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value) };
    },
    document: { body, createElement: () => new FakeElement() },
    fetch: async () => {
      asked.count += 1;
      if (options.offline) throw new Error('offline');
      return new Response(JSON.stringify(options.policy ?? NEWER_POLICY));
    },
  };
  return { win: win as unknown as UpdateNoticeWindow, body, asked };
}

/** 플러그인은 전역 창을 읽는다 — 시험 동안만 브라우저처럼 꾸민다. */
async function startPluginInBrowser(data: { readonly updateNotice?: boolean }): Promise<number> {
  const { win, asked } = fakeWindow();
  const names = ['location', 'localStorage', 'document', 'fetch'] as const;
  const previous = names.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
  for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, value: win[name] });
  try {
    const events = { on: () => undefined, off: () => undefined, emit: () => undefined };
    const plugin = new SuperboxPlayPlugin({ game: { events } } as unknown as PluginManagerLike);
    plugin.init(data);
    plugin.start();
    await new Promise((resolve) => setTimeout(resolve, 10));
    plugin.stop();
    return asked.count;
  } finally {
    names.forEach((name, index) => {
      const descriptor = previous[index];
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
}

describe('Phaser 새 버전 알림', () => {
  it('로컬에서 새 버전이 있으면 게임 화면 위에 알리고 설치 명령을 보여 준다', async () => {
    const { win, body } = fakeWindow();

    await showUpdateNotice(win, DAY);

    assert.equal(body.children.length, 1);
    assert.ok(body.allText.includes('9.0.0'));
    assert.ok(body.allText.includes(PLUGIN_VERSION));
    assert.ok(body.allText.includes('superbox-play-sdk#v9.0.0'));
  });

  it('닫기를 누르면 사라진다', async () => {
    const { win, body } = fakeWindow();

    await showUpdateNotice(win, DAY);
    const notice = body.children[0];
    notice?.children.find((child) => child.type === 'button')?.click();

    assert.equal(notice?.removed, true);
  });

  for (const host of ['127.0.0.1', '[::1]', 'game.localhost']) {
    it(`${host} 도 로컬이다`, async () => {
      const { win, body } = fakeWindow({ host });

      await showUpdateNotice(win, DAY);

      assert.equal(body.children.length, 1);
    });
  }

  for (const host of ['game.superboxgo.com', 'cdn.example', '192.168.0.12']) {
    it(`${host} 에서는 묻지도 띄우지도 않는다`, async () => {
      const { win, body, asked } = fakeWindow({ host });

      await showUpdateNotice(win, DAY);

      assert.equal(asked.count, 0);
      assert.equal(body.children.length, 0);
    });
  }

  it('하루에 한 번만 묻고, 다음 날 다시 묻는다', async () => {
    const { win, asked } = fakeWindow();

    await showUpdateNotice(win, DAY);
    await showUpdateNotice(win, DAY);
    assert.equal(asked.count, 1);

    await showUpdateNotice(win, NEXT_DAY);
    assert.equal(asked.count, 2);
  });

  it('최신 버전이면 띄우지 않는다', async () => {
    const { win, body } = fakeWindow({ policy: { schemaVersion: 1, minVersion: '0.0.1', recommendedVersion: PLUGIN_VERSION } });

    await showUpdateNotice(win, DAY);

    assert.equal(body.children.length, 0);
  });

  it('네트워크 · 저장소 · 틀린 정책 어느 쪽도 게임으로 오류를 던지지 않는다', async () => {
    for (const options of [{ offline: true }, { noStorage: true }, { policy: { schemaVersion: 1, minVersion: 'latest' } }]) {
      const { win, body } = fakeWindow(options);

      await assert.doesNotReject(showUpdateNotice(win, DAY));

      assert.equal(body.children.length, 0);
    }
  });

  it('창이 없는 곳(시험 · 서버)에서는 아무것도 하지 않는다', async () => {
    await assert.doesNotReject(showUpdateNotice({} as UpdateNoticeWindow, DAY));
  });

  it('플러그인이 시작할 때 확인하고, updateNotice: false 면 확인하지 않는다', async () => {
    assert.equal(await startPluginInBrowser({}), 1);
    assert.equal(await startPluginInBrowser({ updateNotice: false }), 0);
  });

  it('판정은 도구와 글자까지 같은 파일이다 — Unity · Cocos 와 같은 규칙 · 같은 문구', async () => {
    const [copy, source] = await Promise.all([readFile(new URL('./sdk-policy.ts', import.meta.url), 'utf8'), readFile(new URL('../../package-core/src/sdk-policy.ts', import.meta.url), 'utf8')]);

    assert.equal(copy, source);
  });

  it('플러그인 버전은 패키지 버전과 같다', async () => {
    const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as { readonly version: string };

    assert.equal(PLUGIN_VERSION, manifest.version);
  });
});
