import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { getLoading, loadSBPlay, PRODUCTION_ZONE_ORIGIN, SdkLoadError } from './load.ts';
import type { SBPlay, SBPlayLoading } from './types.ts';

interface FakeScript {
  src: string;
  onload?: () => void;
  onerror?: () => void;
}

const globals = globalThis as unknown as { window?: unknown; document?: unknown };

function installDom(initial: Record<string, unknown> = {}): { readonly scripts: FakeScript[]; readonly win: Record<string, unknown> } {
  const scripts: FakeScript[] = [];
  const win: Record<string, unknown> = { ...initial };
  globals.window = win;
  globals.document = {
    createElement: () => ({ src: '' }),
    head: { appendChild: (script: FakeScript) => scripts.push(script) },
  };
  return { scripts, win };
}

afterEach(() => {
  delete globals.window;
  delete globals.document;
});

const SDK = { version: 'x' } as unknown as SBPlay;

describe('loadSBPlay', () => {
  it('returns the global when the packaged entry already has it', async () => {
    const { scripts } = installDom({ SBPlay: SDK });
    assert.equal(await loadSBPlay(), SDK);
    assert.equal(scripts.length, 0);
  });

  it('adds the script from the production zone by default', async () => {
    const { scripts, win } = installDom();
    const pending = loadSBPlay();
    assert.equal(scripts[0]?.src, `${PRODUCTION_ZONE_ORIGIN}/sdk/play/v1.js`);
    win.SBPlay = SDK;
    scripts[0]?.onload?.();
    assert.equal(await pending, SDK);
  });

  it('uses the given local zone', async () => {
    const { scripts, win } = installDom();
    const pending = loadSBPlay({ zoneOrigin: 'http://localhost:8200' });
    assert.equal(scripts[0]?.src, 'http://localhost:8200/sdk/play/v1.js');
    win.SBPlay = SDK;
    scripts[0]?.onload?.();
    await pending;
  });

  it('shares one script among concurrent calls', async () => {
    const { scripts, win } = installDom();
    const first = loadSBPlay();
    const second = loadSBPlay();
    assert.equal(scripts.length, 1);
    win.SBPlay = SDK;
    scripts[0]?.onload?.();
    assert.equal(await first, await second);
  });

  it('rejects a script failure with NOT_CONNECTED and allows another try', async () => {
    const { scripts, win } = installDom();
    const pending = loadSBPlay();
    scripts[0]?.onerror?.();
    await assert.rejects(pending, (error: unknown) => error instanceof SdkLoadError && error.code === 'NOT_CONNECTED');
    const retry = loadSBPlay();
    assert.equal(scripts.length, 2);
    win.SBPlay = SDK;
    scripts[1]?.onload?.();
    assert.equal(await retry, SDK);
  });

  it('rejects when the script loads but defines nothing', async () => {
    const { scripts } = installDom();
    const pending = loadSBPlay();
    scripts[0]?.onload?.();
    await assert.rejects(pending, SdkLoadError);
  });

  it('refuses origins that would load code from elsewhere', async () => {
    const { scripts } = installDom();
    for (const zoneOrigin of ['http://evil.example', 'https://game.superboxgo.com/path', 'javascript:alert(1)', 'not a url', 'file:///x']) {
      await assert.rejects(loadSBPlay({ zoneOrigin }), SdkLoadError, zoneOrigin);
    }
    assert.equal(scripts.length, 0);
  });
});

describe('getLoading', () => {
  const LOADING = { complete: () => undefined } as unknown as SBPlayLoading;

  it('prefers the boot runtime, then SBPlay.loading, then null', () => {
    installDom({ SBPlayLoading: LOADING });
    assert.equal(getLoading(), LOADING);
    installDom({ SBPlay: { loading: LOADING } });
    assert.equal(getLoading(), LOADING);
    installDom();
    assert.equal(getLoading(), null);
  });
});
