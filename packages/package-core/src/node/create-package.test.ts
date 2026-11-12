import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { brotliCompressSync } from 'node:zlib';
import { PackageError, type PackageErrorCode } from '../errors.ts';
import { readPackage, type OpenedPackage } from '../reader.ts';
import { createPackage, type CreatePackageOptions } from './create-package.ts';
import { openFileBlob, type FileSlice } from './file-blob.ts';
import { assertZoneOrigin } from './prepare.ts';
import { verifyPackageFile } from './verify.ts';

const TOOL = { name: 'superbox-play', version: '0.1.0' };
const ZONE = 'https://game.superboxgo.com';

let root = '';
let counter = 0;

before(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'sbp-create-'));
});

after(async () => {
  await rm(root, { recursive: true, force: true });
});

async function makeFolder(files: Readonly<Record<string, string | Uint8Array>>): Promise<string> {
  counter += 1;
  const folder = path.join(root, `build-${counter}`);
  for (const [name, content] of Object.entries(files)) {
    const target = path.join(folder, name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  return folder;
}

const PLAIN_HTML = '<!doctype html><html><head><title>t</title></head><body><script src="game.js"></script></body></html>';

function outPath(): string {
  counter += 1;
  return path.join(root, `out-${counter}.sbp`);
}

async function pack(folder: string, options: Partial<CreatePackageOptions> = {}): Promise<Awaited<ReturnType<typeof createPackage>>> {
  return createPackage({ folder, out: outPath(), tool: TOOL, ...options });
}

async function openPackage(file: string): Promise<{ readonly opened: OpenedPackage<FileSlice>; readText(pathInWeb: string): Promise<string>; close(): Promise<void> }> {
  const blob = await openFileBlob(file);
  const opened = await readPackage(blob);
  return {
    opened,
    readText: async (pathInWeb) => {
      const entry = opened.files.find((item) => item.path === pathInWeb);
      assert.ok(entry, pathInWeb);
      return new TextDecoder().decode(await entry.slice().arrayBuffer());
    },
    close: () => blob.close(),
  };
}

async function rejectsCode(run: Promise<unknown>, code: PackageErrorCode): Promise<void> {
  await assert.rejects(run, (error: unknown) => error instanceof PackageError && error.code === code);
}

describe('createPackage', () => {
  it('writes a package the reader accepts, with manifest first and files under web/', async () => {
    const folder = await makeFolder({ 'index.html': PLAIN_HTML, 'game.js': 'console.info(1)', 'assets/a.png': new Uint8Array(100) });
    const report = await pack(folder, { now: new Date('2026-11-01T12:00:00.000Z') });
    const { manifest } = report;
    assert.equal(manifest.format, 1);
    assert.equal(manifest.version, '1.0.0');
    assert.equal(manifest.entry, 'index.html');
    assert.equal(manifest.zoneOrigin, ZONE);
    assert.equal(manifest.engine.name, 'html5');
    assert.equal(manifest.createdAt, '2026-11-01T12:00:00.000Z');
    assert.equal(manifest.loading.mode, 'default');
    assert.deepEqual(manifest.files.map((file) => file.path), ['assets/a.png', 'game.js', 'index.html']);
    assert.equal(manifest.totals.count, 3);

    const reopened = await openPackage(report.outPath);
    try {
      const html = await reopened.readText('index.html');
      assert.ok(html.includes('<!-- sbp:v1 -->'));
      assert.ok(html.includes(`${ZONE}/sdk/play/v1.js`));
      const entry = manifest.files.find((file) => file.path === 'index.html');
      assert.equal(entry?.size, Buffer.byteLength(html));
    } finally {
      await reopened.close();
    }
    await verifyPackageFile(report.outPath);
  });

  it('is plain ZIP that standard tools read', async (t) => {
    const folder = await makeFolder({ 'index.html': PLAIN_HTML, 'game.js': 'x' });
    const report = await pack(folder);
    try {
      const output = execFileSync('unzip', ['-t', report.outPath], { encoding: 'utf8' });
      assert.ok(output.includes('No errors detected'));
      const list = execFileSync('unzip', ['-Z1', report.outPath], { encoding: 'utf8' }).trim().split('\n');
      assert.equal(list[0], 'manifest.json');
      assert.ok(list.includes('web/index.html'));
      const verbose = execFileSync('unzip', ['-v', report.outPath], { encoding: 'utf8' });
      assert.ok(/stored/i.test(verbose));
      assert.equal(verbose.includes('Defl'), false);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') t.skip('unzip 없음');
      else throw error;
    }
  });

  it('leaves out OS files, source maps, metas, git and the config — and keeps maps on request', async () => {
    const folder = await makeFolder({
      'index.html': PLAIN_HTML,
      'game.js': 'x',
      'game.js.map': '{}',
      '.DS_Store': 'x',
      'Thumbs.db': 'x',
      'a.png.meta': '{}',
      '.git/config': 'x',
      'superbox.config.json': '{}',
    });
    const report = await pack(folder);
    assert.deepEqual(report.manifest.files.map((file) => file.path), ['game.js', 'index.html']);
    const kept = await pack(folder, { keepMaps: true });
    assert.deepEqual(kept.manifest.files.map((file) => file.path), ['game.js', 'game.js.map', 'index.html']);
  });

  it('does not pack its own output file when it is inside the folder', async () => {
    const folder = await makeFolder({ 'index.html': PLAIN_HTML, 'game.js': 'x' });
    const out = path.join(folder, 'game.sbp');
    await pack(folder, { out });
    const again = await pack(folder, { out });
    assert.equal(again.manifest.files.some((file) => file.path.endsWith('.sbp')), false);
  });

  it('records encodings by looking at the files', async () => {
    const brotli = brotliCompressSync(Buffer.from('x'.repeat(1000)));
    const unity = Buffer.concat([Buffer.from([0x6b, 0x8d, 0x00]), Buffer.from('UnityWeb Compressed Content (brotli)'), brotli]);
    const folder = await makeFolder({
      'index.html': PLAIN_HTML,
      'game.js': 'x',
      'Build/a.wasm.br': brotli,
      'Build/a.data.unityweb': unity,
      'Build/plain.wasm': new Uint8Array(10),
    });
    const { manifest } = await pack(folder);
    const encodings = Object.fromEntries(manifest.files.map((file) => [file.path, file.encoding]));
    assert.equal(encodings['Build/a.wasm.br'], 'br');
    assert.equal(encodings['Build/a.data.unityweb'], 'br');
    assert.equal(encodings['Build/plain.wasm'], null);
    assert.equal(encodings['index.html'], null);
  });

  it('copies loading image and html under sbp/ with fixed safe names, from outside the build', async () => {
    const folder = await makeFolder({ 'index.html': PLAIN_HTML, 'game.js': 'x' });
    const configDir = await makeFolder({ 'art/로고.PNG': new Uint8Array(40), 'screens/loading.html': '<div id="mine">x</div><script>SBPlayLoading.onProgress(function(){})</script>' });
    const report = await pack(folder, {
      configDir,
      config: { title: '이름', loading: { image: 'art/로고.PNG', html: 'screens/loading.html', backgroundColor: '#112233', primaryColor: '#445566' } },
    });
    assert.equal(report.manifest.loading.mode, 'custom');
    assert.equal(report.manifest.loading.backgroundColor, '#112233');
    const paths = report.manifest.files.map((file) => file.path);
    assert.ok(paths.includes('sbp/loading-image.png'));
    assert.ok(paths.includes('sbp/loading.html'));
    const reopened = await openPackage(report.outPath);
    try {
      const html = await reopened.readText('index.html');
      assert.ok(html.includes('<div id="mine">x</div>'));
      assert.ok(html.includes('"iconUrl":"sbp/loading-image.png"'));
    } finally {
      await reopened.close();
    }
  });

  it('writes the aspect range from the config into the manifest, and none without it', async () => {
    const folder = await makeFolder({ 'index.html': PLAIN_HTML, 'game.js': 'x' });
    const ranged = await pack(folder, { config: { aspectRange: { min: 1.3333, max: 2.4 } } });
    assert.deepEqual(ranged.manifest.aspectRange, { min: 1.3333, max: 2.4 });
    const reopened = await openPackage(ranged.outPath);
    try {
      assert.deepEqual(reopened.opened.manifest.aspectRange, { min: 1.3333, max: 2.4 });
    } finally {
      await reopened.close();
    }
    assert.equal((await pack(folder)).manifest.aspectRange, null);
  });

  it('adds the debug console only when asked, and warns', async () => {
    const folder = await makeFolder({ 'index.html': PLAIN_HTML, 'game.js': 'x' });
    const report = await pack(folder, { config: { runtime: { debugConsole: true } } });
    assert.ok(report.manifest.files.some((file) => file.path === 'sbp/debug-console.js'));
    assert.ok(report.warnings.some((item) => item.code === 'DEBUG_CONSOLE_ON'));
    const off = await pack(folder);
    assert.equal(off.manifest.files.some((file) => file.path.startsWith('sbp/')), false);
  });

  it('reports the largest files and warnings', async () => {
    const files: Record<string, string | Uint8Array> = { 'index.html': PLAIN_HTML, 'game.js': 'x', 'big.wasm': new Uint8Array(6 * 1024 * 1024) };
    for (let index = 0; index < 12; index += 1) files[`f${index}.bin`] = new Uint8Array(index + 1);
    const report = await pack(await makeFolder(files));
    assert.equal(report.largest.length, 10);
    assert.equal(report.largest[0]?.path, 'big.wasm');
    const codes = report.warnings.map((item) => item.code);
    assert.ok(codes.includes('UNCOMPRESSED_LARGE'));
    assert.ok(codes.includes('VERSION_DEFAULTED'));
    assert.ok(codes.includes('TITLE_MISSING'));
  });

  it('flags a local zone and accepts one', async () => {
    const folder = await makeFolder({ 'index.html': PLAIN_HTML, 'game.js': 'x' });
    const report = await pack(folder, { zoneOrigin: 'http://localhost:8200' });
    assert.equal(report.manifest.zoneOrigin, 'http://localhost:8200');
    assert.ok(report.warnings.some((item) => item.code === 'LOCAL_ZONE'));
  });

  it('builds a Unity early fetch list and leaves the framework out', async () => {
    const html = `<!doctype html><html><head><title>t</title></head><body><script>
      var buildUrl = "Build"; var config = { dataUrl: buildUrl + "/g.data.br", codeUrl: buildUrl + "/g.wasm.br", frameworkUrl: buildUrl + "/g.framework.js.br" };
      var script = document.createElement("script"); script.src = buildUrl + "/g.loader.js";
      script.onload = function () { createUnityInstance(canvas, config, function () {}); };
    </script></body></html>`;
    const folder = await makeFolder({ 'index.html': html, 'Build/g.loader.js': 'function createUnityInstance(){}', 'Build/g.framework.js.br': 'x', 'Build/g.data.br': 'x', 'Build/g.wasm.br': 'x' });
    const report = await pack(folder);
    assert.equal(report.manifest.engine.name, 'unity');
    const reopened = await openPackage(report.outPath);
    try {
      const entry = await reopened.readText('index.html');
      assert.ok(entry.includes('"earlyFetch":["Build/g.data.br","Build/g.wasm.br"]'));
      assert.ok(entry.includes('"engine":"unity"'));
    } finally {
      await reopened.close();
    }
  });

  it('honors runtime.earlyFetch: false', async () => {
    const folder = await makeFolder({ 'index.html': '<html><body><script>createUnityInstance("Build/g.data.br")</script></body></html>', 'Build/g.loader.js': 'x', 'Build/g.data.br': 'x' });
    const report = await pack(folder, { config: { runtime: { earlyFetch: false } } });
    const reopened = await openPackage(report.outPath);
    try {
      assert.ok((await reopened.readText('index.html')).includes('"earlyFetch":[]'));
    } finally {
      await reopened.close();
    }
  });

  it('leaves out a detected engine version that does not fit the manifest field', async () => {
    const settings = { 'index.html': PLAIN_HTML, 'application.js': 'x', 'cocos-js/cc.js': 'x' };
    const odd = await makeFolder({ ...settings, 'src/settings.json': JSON.stringify({ CocosEngine: '3.8.8 베타' }) });
    assert.deepEqual((await pack(odd)).manifest.engine, { name: 'cocos', version: null });
    const usual = await makeFolder({ ...settings, 'src/settings.json': JSON.stringify({ CocosEngine: '3.8.8' }) });
    assert.deepEqual((await pack(usual)).manifest.engine, { name: 'cocos', version: '3.8.8' });
  });

  it('lets --engine win over detection', async () => {
    const folder = await makeFolder({ 'index.html': PLAIN_HTML, 'game.js': 'x' });
    assert.deepEqual((await pack(folder, { engine: 'phaser' })).manifest.engine, { name: 'phaser', version: null });
    assert.deepEqual((await pack(folder, { config: { engine: 'cocos' } })).manifest.engine, { name: 'cocos', version: null });
  });
});

describe('createPackage refuses', () => {
  it('a missing folder or entry', async () => {
    await rejectsCode(pack(path.join(root, 'nope')), 'FOLDER_MISSING');
    await rejectsCode(pack(await makeFolder({ 'game.js': 'x' })), 'ENTRY_MISSING');
  });

  it('unsafe names, naming the files', async () => {
    const folder = await makeFolder({ 'index.html': PLAIN_HTML, '한글.png': 'x' });
    await assert.rejects(pack(folder), (error: unknown) => error instanceof PackageError && error.code === 'PATH_UNSAFE' && Boolean(error.detail?.includes('한글')));
  });

  it('reserved names', async () => {
    await rejectsCode(pack(await makeFolder({ 'index.html': PLAIN_HTML, 'sbp-manifest.json': '{}' })), 'RESERVED_NAME');
    await rejectsCode(pack(await makeFolder({ 'index.html': PLAIN_HTML, 'sbp/x.js': 'x' })), 'RESERVED_NAME');
  });

  it('symbolic links', async () => {
    const folder = await makeFolder({ 'index.html': PLAIN_HTML });
    await symlink(path.join(folder, 'index.html'), path.join(folder, 'link.html'));
    await rejectsCode(pack(folder), 'SYMLINK');
  });

  it('a document already packaged, and leaves no output behind', async () => {
    const folder = await makeFolder({ 'index.html': PLAIN_HTML, 'game.js': 'x' });
    const report = await pack(folder);
    const reopened = await openPackage(report.outPath);
    const html = await reopened.readText('index.html');
    await reopened.close();
    const again = await makeFolder({ 'index.html': html, 'game.js': 'x' });
    const out = outPath();
    await rejectsCode(pack(again, { out }), 'ALREADY_INJECTED');
    await assert.rejects(readFile(out));
  });

  it('an unresolved platform template', async () => {
    await rejectsCode(pack(await makeFolder({ 'index.html': '<html><head><title>%UNITY_WEB_NAME%</title></head></html>' })), 'TEMPLATE_UNRESOLVED');
    await rejectsCode(pack(await makeFolder({ 'index.html': '<html><body>%AIT_LOADING_SCREEN%</body></html>' })), 'TEMPLATE_UNRESOLVED');
  });

  it('warns about a resolved template made for another platform', async () => {
    const report = await pack(await makeFolder({ 'index.html': '<html><head><script>window.AITLoading = {}</script></head><body></body></html>' }));
    assert.ok(report.warnings.some((item) => item.code === 'OTHER_PLATFORM_TEMPLATE'));
  });

  it('missing or unsupported loading assets', async () => {
    const folder = await makeFolder({ 'index.html': PLAIN_HTML });
    await rejectsCode(pack(folder, { configDir: root, config: { loading: { image: 'nope.png' } } }), 'LOADING_ASSET_MISSING');
    await rejectsCode(pack(folder, { configDir: root, config: { loading: { html: 'nope.html' } } }), 'LOADING_ASSET_MISSING');
    await rejectsCode(pack(folder, { configDir: root, config: { loading: { image: 'logo.exe' } } }), 'LOADING_ASSET_INVALID');
  });

  it('a wrong zone origin', async () => {
    const folder = await makeFolder({ 'index.html': PLAIN_HTML });
    await rejectsCode(pack(folder, { zoneOrigin: 'http://game.superboxgo.com' }), 'ZONE_INVALID');
    await rejectsCode(pack(folder, { zoneOrigin: 'https://game.superboxgo.com/path' }), 'ZONE_INVALID');
    assert.doesNotThrow(() => assertZoneOrigin('https://game.superboxgo.com'));
    assert.doesNotThrow(() => assertZoneOrigin('http://sample.localhost:8200'));
  });
});

describe('verifyPackageFile', () => {
  it('finds content that differs from the manifest', async () => {
    const folder = await makeFolder({ 'index.html': PLAIN_HTML, 'game.js': 'original-content' });
    const report = await pack(folder);
    const bytes = await readFile(report.outPath);
    const at = bytes.indexOf('original-content');
    assert.ok(at > 0);
    bytes[at] = 0x58;
    const broken = outPath();
    await writeFile(broken, bytes);
    await rejectsCode(verifyPackageFile(broken), 'HASH_MISMATCH');
  });
});
