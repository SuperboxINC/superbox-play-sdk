import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { installEarlyFetch, type EarlyFetchWindow, type FetchLike } from './early-fetch.ts';
import { createLoading, type LoadingController } from './loading-api.ts';
import { MAX_AUTO_RELOADS, spendAutoReload, type CounterStorage } from './reload-budget.ts';
import type { LoadingView } from './types.ts';
import { installWatchdog, STALL_LIMIT_MS } from './watchdog.ts';

/**
 * 규칙 — 어떤 실패도 게임 시작을 막지 않는다. 부트가 스스로 던지거나 끝없이 새로고침하면 게임이 죽는다.
 */
function memoryStorage(): CounterStorage & { readonly data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value) };
}

describe('auto reload budget', () => {
  it('allows two reloads per session, then stops', () => {
    const storage = memoryStorage();
    assert.equal(MAX_AUTO_RELOADS, 2);
    assert.equal(spendAutoReload(() => storage), true);
    assert.equal(spendAutoReload(() => storage), true);
    assert.equal(spendAutoReload(() => storage), false);
    assert.equal(spendAutoReload(() => storage), false);
    assert.equal(storage.data.get('sbp.reload'), '2');
  });

  it('does not reload when it cannot count — sessionStorage access throws', () => {
    assert.equal(
      spendAutoReload(() => {
        throw new Error('SecurityError');
      }),
      false,
    );
  });

  it('does not reload when reading or writing throws', () => {
    const readFails: CounterStorage = {
      getItem: () => {
        throw new Error('nope');
      },
      setItem: () => undefined,
    };
    assert.equal(spendAutoReload(() => readFails), false);
    const writeFails: CounterStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    assert.equal(spendAutoReload(() => writeFails), false);
  });

  it('treats a garbled counter as used up', () => {
    const storage = memoryStorage();
    storage.setItem('sbp.reload', 'garbled');
    assert.equal(spendAutoReload(() => storage), false);
  });
});

function fakeWindow(fetchImpl: FetchLike): EarlyFetchWindow {
  return { fetch: fetchImpl, location: { href: 'https://game.example/build/index.html' } };
}

const ok = (body = 'early'): Response => new Response(body, { status: 200 });

describe('early fetch', () => {
  it('fetches at once and hands the same response to the loader, once', async () => {
    const calls: string[] = [];
    const win = fakeWindow(async (input) => {
      calls.push(String(input));
      return ok(`for ${String(input)}`);
    });
    installEarlyFetch(win, ['Build/a.wasm'], false);
    assert.deepEqual(calls, ['Build/a.wasm']);
    const first = await win.fetch('Build/a.wasm');
    assert.equal(await first.text(), 'for Build/a.wasm');
    assert.deepEqual(calls, ['Build/a.wasm'], '로더 요청은 받아 둔 응답으로 끝난다');
  });

  it('matches absolute, URL and Request forms of the same address', async () => {
    let count = 0;
    const win = fakeWindow(async () => {
      count += 1;
      return ok();
    });
    installEarlyFetch(win, ['Build/a', 'Build/b', 'Build/c'], false);
    assert.equal(count, 3);
    await win.fetch('https://game.example/build/Build/a');
    await win.fetch(new URL('https://game.example/build/Build/b'));
    await win.fetch(new Request('https://game.example/build/Build/c'));
    assert.equal(count, 3);
  });

  it('restores fetch once everything is taken', async () => {
    const original: FetchLike = async () => ok();
    const win = fakeWindow(original);
    installEarlyFetch(win, ['Build/a'], false);
    assert.notEqual(win.fetch, original);
    await win.fetch('Build/a');
    assert.equal(win.fetch, original);
  });

  it('falls back to the real fetch when the early request failed', async () => {
    let attempts = 0;
    const win = fakeWindow(async () => {
      attempts += 1;
      if (attempts === 1) throw new TypeError('network');
      return ok('second try');
    });
    installEarlyFetch(win, ['Build/a'], false);
    const response = await win.fetch('Build/a');
    assert.equal(await response.text(), 'second try');
    assert.equal(attempts, 2);
  });

  it('falls back when the early response was not ok', async () => {
    let attempts = 0;
    const win = fakeWindow(async () => {
      attempts += 1;
      return attempts === 1 ? new Response('no', { status: 503 }) : ok('fine');
    });
    installEarlyFetch(win, ['Build/a'], false);
    assert.equal(await (await win.fetch('Build/a')).text(), 'fine');
  });

  it('survives fetch throwing synchronously? no — but a bad url is skipped', async () => {
    const calls: string[] = [];
    const win = fakeWindow(async (input) => {
      calls.push(String(input));
      return ok();
    });
    installEarlyFetch(win, ['http://[bad'], false);
    assert.deepEqual(calls, []);
  });

  it('passes other requests and non-GET through untouched', async () => {
    const calls: string[] = [];
    const win = fakeWindow(async (input, init) => {
      calls.push(`${init?.method ?? 'GET'} ${String(input)}`);
      return ok();
    });
    installEarlyFetch(win, ['Build/a'], false);
    await win.fetch('api/score');
    await win.fetch('Build/a', { method: 'HEAD' });
    assert.deepEqual(calls, ['GET Build/a', 'GET api/score', 'HEAD Build/a']);
  });

  it('does nothing on a reload, with no list, or without fetch', () => {
    const original: FetchLike = async () => {
      throw new Error('호출되면 안 된다');
    };
    const win = fakeWindow(original);
    installEarlyFetch(win, ['Build/a'], true)();
    assert.equal(win.fetch, original);
    installEarlyFetch(win, [], false)();
    assert.equal(win.fetch, original);
    const none = { location: win.location } as unknown as EarlyFetchWindow;
    installEarlyFetch(none, ['Build/a'], false)();
  });

  it('dispose restores fetch and cancels what nobody took', async () => {
    const original: FetchLike = async () => ok();
    const win = fakeWindow(original);
    let cancelled = false;
    const body = new ReadableStream({
      cancel() {
        cancelled = true;
      },
    });
    const dispose = installEarlyFetch(
      {
        ...win,
        fetch: async () => new Response(body),
      } as EarlyFetchWindow,
      ['Build/a'],
      false,
    );
    dispose();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(cancelled, true);
  });

  it('dispose leaves fetch alone if someone wrapped it afterwards', () => {
    const win = fakeWindow(async () => ok());
    const dispose = installEarlyFetch(win, ['Build/a'], false);
    const later: FetchLike = async () => ok();
    win.fetch = later;
    dispose();
    assert.equal(win.fetch, later);
  });
});

function silentView(): LoadingView {
  return { attach: () => undefined, setProgress: () => undefined, setAppInfo: () => undefined, hide: () => undefined, showError: () => undefined, hideError: () => undefined };
}

interface WatchHarness {
  readonly loading: LoadingController;
  advance(ms: number): void;
  readonly reloads: { count: number };
  setHidden(value: boolean): void;
  setResources(value: number): void;
  readonly running: () => boolean;
}

function watch(options: { allowReload: boolean }): WatchHarness {
  let clock = 0;
  let hidden = false;
  let resources = 0;
  let tick: (() => void) | null = null;
  const reloads = { count: 0 };
  const loading = createLoading({
    appInfo: { title: null, iconUrl: null, primaryColor: '#000000', backgroundColor: '#000000' },
    view: silentView(),
    post: () => undefined,
    now: () => clock,
    later: () => undefined,
    report: () => undefined,
    classify: () => 'UNKNOWN',
  });
  installWatchdog({
    loading,
    now: () => clock,
    isHidden: () => hidden,
    resourceCount: () => resources,
    reload: () => {
      reloads.count += 1;
      return options.allowReload;
    },
    setInterval: (callback) => {
      tick = callback;
      return 1;
    },
    clearInterval: () => {
      tick = null;
    },
  });
  return {
    loading,
    reloads,
    advance: (ms) => {
      for (let passed = 0; passed < ms; passed += 10_000) {
        clock += 10_000;
        tick?.();
      }
    },
    setHidden: (value) => {
      hidden = value;
    },
    setResources: (value) => {
      resources = value;
    },
    running: () => tick !== null,
  };
}

describe('stall watchdog', () => {
  it('reloads after 60 seconds without movement below 0.9', () => {
    const h = watch({ allowReload: true });
    h.loading.api.progress(0.3);
    h.advance(STALL_LIMIT_MS - 10_000);
    assert.equal(h.reloads.count, 0);
    h.advance(10_000);
    assert.equal(h.reloads.count, 1);
    assert.equal(h.running(), false);
  });

  it('shows the error screen when the budget is gone', () => {
    const h = watch({ allowReload: false });
    h.loading.api.progress(0.3);
    h.advance(STALL_LIMIT_MS);
    assert.equal(h.reloads.count, 1);
    assert.equal(h.loading.hasFailed(), true);
  });

  it('does not judge a game that never sent progress', () => {
    const h = watch({ allowReload: true });
    h.advance(STALL_LIMIT_MS * 3);
    assert.equal(h.reloads.count, 0);
    assert.equal(h.running(), true);
  });

  it('leaves the slow part above 0.9 alone', () => {
    const h = watch({ allowReload: true });
    h.loading.api.progress(0.92);
    h.advance(STALL_LIMIT_MS * 3);
    assert.equal(h.reloads.count, 0);
  });

  it('progress movement resets the clock', () => {
    const h = watch({ allowReload: true });
    h.loading.api.progress(0.1);
    h.advance(50_000);
    h.loading.api.progress(0.2);
    h.advance(50_000);
    assert.equal(h.reloads.count, 0);
    h.advance(10_000);
    assert.equal(h.reloads.count, 1);
  });

  it('resources still finishing count as movement', () => {
    const h = watch({ allowReload: true });
    h.loading.api.progress(0.1);
    h.advance(50_000);
    h.setResources(5);
    h.advance(50_000);
    assert.equal(h.reloads.count, 0);
  });

  it('does not measure while hidden', () => {
    const h = watch({ allowReload: true });
    h.loading.api.progress(0.1);
    h.setHidden(true);
    h.advance(STALL_LIMIT_MS * 3);
    assert.equal(h.reloads.count, 0);
    h.setHidden(false);
    h.advance(50_000);
    assert.equal(h.reloads.count, 0);
  });

  it('stops after complete or failure', () => {
    const done = watch({ allowReload: true });
    done.loading.api.progress(0.1);
    done.loading.api.complete();
    done.advance(STALL_LIMIT_MS * 2);
    assert.equal(done.reloads.count, 0);
    assert.equal(done.running(), false);
    const failed = watch({ allowReload: true });
    failed.loading.api.progress(0.1);
    failed.loading.fail('UNKNOWN', 'x');
    failed.advance(STALL_LIMIT_MS * 2);
    assert.equal(failed.reloads.count, 0);
  });
});
