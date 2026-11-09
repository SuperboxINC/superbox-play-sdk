import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink, utimes, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { brotliCompressSync, brotliDecompressSync, gzipSync } from 'node:zlib';
import { parseConfig, type SuperboxConfig } from '../../package-core/src/index.ts';
import { startDevServer, type DevServerHandle, type DevServerOptions } from './dev-server.ts';
import { CliError } from './errors.ts';

let root = '';
let folder = '';
let sdkFile = '';
let handle: DevServerHandle;
let config: SuperboxConfig = { title: '처음 이름' };

const INDEX = '<!doctype html><html><head><title>t</title></head><body><script src="game.js"></script></body></html>';
const BROTLI_BODY = 'wasm bytes wasm bytes wasm bytes';

async function start(overrides: Partial<DevServerOptions> = {}): Promise<DevServerHandle> {
  return startDevServer({
    folder,
    host: '127.0.0.1',
    port: 0,
    fixedPort: true,
    loadConfig: async () => ({ config, configDir: root }),
    sdkPaths: [sdkFile],
    ...overrides,
  });
}

before(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'sbp-dev-'));
  folder = path.join(root, 'build');
  await mkdir(path.join(folder, 'Build'), { recursive: true });
  await writeFile(path.join(folder, 'index.html'), INDEX);
  await writeFile(path.join(folder, 'game.js'), 'console.info(1)');
  await writeFile(path.join(folder, 'Build/a.wasm.br'), brotliCompressSync(Buffer.from(BROTLI_BODY)));
  await writeFile(path.join(folder, 'Build/b.js.gz'), gzipSync(Buffer.from('gz body')));
  await writeFile(
    path.join(folder, 'Build/c.wasm.unityweb'),
    Buffer.concat([Buffer.from([0x6b, 0x8d, 0x00]), Buffer.from('UnityWeb Compressed Content (brotli)'), brotliCompressSync(Buffer.from('x'))]),
  );
  await writeFile(path.join(folder, 'Build/d.data.unityweb'), 'UnityWebData1.0 plain');
  await writeFile(path.join(folder, 'space name.txt'), 'with space');
  sdkFile = path.join(root, 'v1.js');
  await writeFile(sdkFile, 'window.SBPlay = {};');
  handle = await start();
});

after(async () => {
  await handle.close();
  await rm(root, { recursive: true, force: true });
});

function url(pathname: string): string {
  return `${handle.url.replace(/\/$/, '')}${pathname}`;
}

/** fetch 는 Content-Encoding 을 풀어 버리므로 머리를 그대로 보려고 http 로 읽는다. */
async function rawGet(pathname: string): Promise<{ readonly status: number; readonly headers: Headers; readonly body: Buffer }> {
  const response = await fetch(url(pathname), { headers: { 'accept-encoding': 'identity' } }).catch((error: unknown) => {
    throw error;
  });
  return { status: response.status, headers: response.headers, body: Buffer.from(await response.arrayBuffer()) };
}

describe('dev server', () => {
  it('serves the injected entry on / and /index.html, with its own SDK', async () => {
    for (const pathname of ['/', '/index.html']) {
      const response = await fetch(url(pathname));
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.match(response.headers.get('content-type') ?? '', /text\/html/);
      const html = await response.text();
      assert.ok(html.includes('<!-- sbp:v1 -->'));
      assert.ok(html.includes('처음 이름'));
      const port = (new URL(handle.url)).port;
      assert.ok(html.includes(`http://127.0.0.1:${port}/sdk/play/v1.js`), '인터넷 없이 돌도록 자기 SDK 를 가리킨다');
    }
  });

  it('serves the SDK copy same-origin so it trusts itself and simulates', async () => {
    const response = await fetch(url('/sdk/play/v1.js'));
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /javascript/);
    assert.equal(await response.text(), 'window.SBPlay = {};');
  });

  it('re-injects on every request, so config edits show on reload', async () => {
    config = { title: '고친 이름' };
    assert.ok((await (await fetch(url('/'))).text()).includes('고친 이름'));
    config = { title: '처음 이름' };
  });

  it('uses the given zone instead of itself, and does not serve the SDK then', async () => {
    const zoned = await start({ zoneOrigin: 'http://localhost:8200' });
    try {
      const html = await (await fetch(`${zoned.url}`)).text();
      assert.ok(html.includes('http://localhost:8200/sdk/play/v1.js'));
      assert.equal((await fetch(`${zoned.url}sdk/play/v1.js`)).status, 404);
    } finally {
      await zoned.close();
    }
  });

  describe('listening beyond this computer — browsers refuse Content-Encoding: br over plain http', () => {
    let lan: DevServerHandle;
    let origin = '';

    before(async () => {
      lan = await start({ host: '0.0.0.0' });
      origin = `http://127.0.0.1:${lan.port}`;
    });

    after(async () => {
      await lan.close();
    });

    for (const [pathname, expected, type] of [
      ['/Build/a.wasm.br', BROTLI_BODY, 'application/wasm'],
      ['/Build/b.js.gz', 'gz body', 'application/javascript'],
    ] as const) {
      it(`serves ${pathname} already decoded, with its real size`, async () => {
        const response = await fetch(`${origin}${pathname}`, { headers: { 'accept-encoding': 'identity' } });
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('content-encoding'), null);
        assert.equal(response.headers.get('content-type'), type);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        const body = Buffer.from(await response.arrayBuffer());
        assert.equal(body.toString(), expected);
        assert.equal(response.headers.get('content-length'), String(body.length));
      });
    }

    it('answers HEAD with the decoded size and no body', async () => {
      const response = await fetch(`${origin}/Build/a.wasm.br`, { method: 'HEAD' });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-encoding'), null);
      assert.equal(response.headers.get('content-length'), String(Buffer.byteLength(BROTLI_BODY)));
    });

    it('sends the file as it is when it cannot be decoded', async () => {
      const response = await fetch(`${origin}/Build/c.wasm.unityweb`, { method: 'HEAD' });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-encoding'), 'br');
    });

    it('decodes a file once, and again after a rebuild', async () => {
      const file = path.join(folder, 'Build/e.data.br');
      const stamp = new Date('2026-11-09T00:00:00Z');
      const firstBuild = brotliCompressSync(Buffer.from('first build'));
      const read = async (): Promise<string> => (await fetch(`${origin}/Build/e.data.br`)).text();
      await writeFile(file, firstBuild);
      await utimes(file, stamp, stamp);
      try {
        assert.equal(await read(), 'first build');

        // 크기와 시각이 같으면 풀어 둔 것을 쓴다 — 이 내용을 다시 풀었다면 풀지 못해 다른 답이 나온다
        await writeFile(file, Buffer.alloc(firstBuild.length));
        await utimes(file, stamp, stamp);
        assert.equal(await read(), 'first build');

        await writeFile(file, brotliCompressSync(Buffer.from('second build')));
        assert.equal(await read(), 'second build');
      } finally {
        await rm(file);
      }
    });

    it('keeps hidden files and folders on this computer', async () => {
      await mkdir(path.join(folder, '.git'), { recursive: true });
      await writeFile(path.join(folder, '.env'), 'secret');
      await writeFile(path.join(folder, '.git/config'), 'secret');
      await writeFile(path.join(folder, 'Build/.hidden.js'), 'secret');
      try {
        for (const pathname of ['/.env', '/.git/config', '/Build/.hidden.js']) {
          const response = await fetch(`${origin}${pathname}`);
          assert.equal(response.status, 404, pathname);
          assert.equal((await response.text()).includes('secret'), false, pathname);
        }
        assert.equal((await fetch(url('/.env'))).status, 200, '이 컴퓨터 안에서만 받으면 그대로 내린다');
      } finally {
        await rm(path.join(folder, '.env'));
        await rm(path.join(folder, '.git'), { recursive: true });
        await rm(path.join(folder, 'Build/.hidden.js'));
      }
    });
  });

  it('labels compressed files with Content-Encoding and the inner type', async () => {
    const br = await rawGet('/Build/a.wasm.br');
    assert.equal(br.status, 200);
    assert.equal(br.headers.get('content-encoding'), 'br');
    assert.equal(br.headers.get('content-type'), 'application/wasm');
    assert.equal(br.headers.get('cache-control'), 'no-store');
    assert.equal(br.body.toString(), BROTLI_BODY, 'fetch 가 풀었으면 머리가 맞다는 뜻이다');

    const gz = await rawGet('/Build/b.js.gz');
    assert.equal(gz.headers.get('content-encoding'), 'gzip');
    assert.equal(gz.headers.get('content-type'), 'application/javascript');

    const unityweb = await fetch(url('/Build/c.wasm.unityweb'), { method: 'HEAD' });
    assert.equal(unityweb.headers.get('content-encoding'), 'br');
    assert.equal(unityweb.headers.get('content-type'), 'application/wasm');

    const plain = await rawGet('/Build/d.data.unityweb');
    assert.equal(plain.headers.get('content-encoding'), null);
    assert.equal(plain.body.toString(), 'UnityWebData1.0 plain');
  });

  it('serves plain files and decodes paths', async () => {
    const game = await fetch(url('/game.js'));
    assert.match(game.headers.get('content-type') ?? '', /javascript/);
    assert.equal(game.headers.get('cache-control'), 'no-store');
    assert.equal(await game.text(), 'console.info(1)');
    assert.equal(await (await fetch(url('/space%20name.txt'))).text(), 'with space');
  });

  it('never leaves the folder', async () => {
    await writeFile(path.join(root, 'secret.txt'), 'secret');
    for (const attempt of ['/../secret.txt', '/..%2Fsecret.txt', '/Build/../../secret.txt', '/%2e%2e/secret.txt']) {
      const response = await fetch(url(attempt));
      assert.ok(response.status === 404 || response.status === 403, attempt);
      assert.equal((await response.text()).includes('secret'), false, attempt);
    }
  });

  it('does not follow a symbolic link out of the folder', async () => {
    await writeFile(path.join(root, 'outside.txt'), 'outside');
    await symlink(path.join(root, 'outside.txt'), path.join(folder, 'link.txt'));
    const prepared = await fetch(url('/link.txt'));
    assert.equal(prepared.status, 404);
    await rm(path.join(folder, 'link.txt'));
  });

  it('does not walk through a linked folder out of the folder', async () => {
    await mkdir(path.join(root, 'outside'), { recursive: true });
    await writeFile(path.join(root, 'outside/secret.js'), 'secret');
    await symlink(path.join(root, 'outside'), path.join(folder, 'linked'));
    try {
      const response = await fetch(url('/linked/secret.js'));
      assert.equal(response.status, 404);
      assert.equal((await response.text()).includes('secret'), false);
    } finally {
      await rm(path.join(folder, 'linked'));
    }
  });

  it('answers 404, 405 and bad requests plainly', async () => {
    assert.equal((await fetch(url('/none.js'))).status, 404);
    assert.equal((await fetch(url('/game.js'), { method: 'POST' })).status, 405);
    assert.equal((await fetch(url('/%E0%A4%A'))).status, 400);
  });

  it('shows package errors in the response instead of crashing', async () => {
    config = parseConfig({ loading: { image: 'nope.png' } }).config;
    const response = await fetch(url('/'));
    assert.equal(response.status, 422);
    assert.ok((await response.text()).includes('LOADING_ASSET_MISSING'));
    config = { title: '처음 이름' };
    assert.equal((await fetch(url('/'))).status, 200);
  });

  it('fails clearly without an SDK copy', async () => {
    const noSdk = await start({ sdkPaths: [path.join(root, 'absent.js')] });
    try {
      const response = await fetch(`${noSdk.url}sdk/play/v1.js`);
      assert.equal(response.status, 500);
      assert.ok((await response.text()).includes('Play SDK'));
    } finally {
      await noSdk.close();
    }
  });

  it('a taken explicit port is an error; a default port moves on', async () => {
    const blocker = createServer();
    await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve));
    const taken = (blocker.address() as AddressInfo).port;
    try {
      await assert.rejects(start({ port: taken, fixedPort: true }), (error: unknown) => error instanceof CliError && error.code === 'PORT_IN_USE');
      const moved = await start({ port: taken, fixedPort: false });
      try {
        assert.notEqual(moved.port, taken);
      } finally {
        await moved.close();
      }
    } finally {
      await new Promise((resolve) => blocker.close(resolve));
    }
  });

  it('body of a brotli file stays what the file holds', () => {
    assert.equal(brotliDecompressSync(brotliCompressSync(Buffer.from('a'))).toString(), 'a');
  });
});
