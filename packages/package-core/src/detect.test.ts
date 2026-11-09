import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { contentTypeFor } from './content-type.ts';
import { earlyFetchList } from './early-fetch.ts';
import { detectEncoding } from './encoding.ts';
import { detectEngine, type EngineProbe } from './engine.ts';

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe('detectEncoding', () => {
  it('trusts .br and checks the magic of .gz', () => {
    assert.equal(detectEncoding('Build/a.wasm.br', new Uint8Array(4)), 'br');
    assert.equal(detectEncoding('Build/a.wasm.gz', Uint8Array.from([0x1f, 0x8b, 8, 0])), 'gzip');
    assert.equal(detectEncoding('Build/a.wasm.gz', bytes('plain')), null);
    assert.equal(detectEncoding('Build/A.WASM.BR', new Uint8Array(4)), 'br');
  });

  it('reads the .unityweb head, as real Unity 6 files have it', () => {
    const brotli = Uint8Array.from([0x6b, 0x8d, 0x00, ...bytes('UnityWeb Compressed Content (brotli)'), 0xfc, 0xff]);
    assert.equal(detectEncoding('Build/webgl.wasm.unityweb', brotli), 'br');
    const gzip = Uint8Array.from([0x1f, 0x8b, 8, 0x10, 0, 0, 0, 0, 0, 3, ...bytes('UnityWeb Compressed Content (gzip)')]);
    assert.equal(detectEncoding('Build/webgl.data.unityweb', gzip), 'gzip');
    assert.equal(detectEncoding('Build/webgl.data.unityweb', Uint8Array.from([0x1f, 0x8b, 8, 0])), 'gzip');
    assert.equal(detectEncoding('Build/webgl.data.unityweb', bytes('UnityWebData1.0')), null);
  });

  it('leaves everything else alone', () => {
    assert.equal(detectEncoding('index.html', bytes('<html>')), null);
    assert.equal(detectEncoding('a.wasm', Uint8Array.from([0, 0x61, 0x73, 0x6d])), null);
  });
});

describe('contentTypeFor', () => {
  it('uses the extension before the encoding one', () => {
    assert.equal(contentTypeFor('Build/x.wasm.unityweb', 'br'), 'application/wasm');
    assert.equal(contentTypeFor('Build/x.framework.js.unityweb', 'gzip'), 'application/javascript');
    assert.equal(contentTypeFor('Build/x.wasm.br', 'br'), 'application/wasm');
    assert.equal(contentTypeFor('Build/x.data.gz', 'gzip'), 'application/octet-stream');
  });

  it('uses the last extension without an encoding', () => {
    assert.equal(contentTypeFor('index.html', null), 'text/html; charset=utf-8');
    assert.equal(contentTypeFor('a/b.PNG', null), 'image/png');
    assert.equal(contentTypeFor('x.unityweb', null), 'application/octet-stream');
    assert.equal(contentTypeFor('noext', null), 'application/octet-stream');
    assert.equal(contentTypeFor('x.unknown', null), 'application/octet-stream');
    assert.equal(contentTypeFor('x.constructor', null), 'application/octet-stream');
    assert.equal(contentTypeFor('x.__proto__.br', 'br'), 'application/octet-stream');
  });
});

function probe(paths: readonly string[], options: { html?: string; texts?: Readonly<Record<string, string>>; unityVersion?: string } = {}): EngineProbe {
  return {
    files: paths.map((path) => ({ path, size: options.texts?.[path]?.length ?? 1000 })),
    entryHtml: options.html ?? '<html></html>',
    readText: async (path) => options.texts?.[path] ?? '',
    readUnityVersion: async () => options.unityVersion ?? null,
  };
}

describe('detectEngine', () => {
  it('recognizes Unity by loader and framework, whatever the template', async () => {
    const guess = await detectEngine(probe(['index.html', 'Build/g.loader.js', 'Build/g.framework.js.br', 'Build/g.wasm.br', 'Build/g.data.br'], { unityVersion: '6000.3.27f1' }));
    assert.deepEqual(guess, { name: 'unity', version: '6000.3.27f1' });
    const hashed = await detectEngine(probe(['Build/2fab.loader.js'], { html: '<script>createUnityInstance(c, config)</script>' }));
    assert.equal(hashed.name, 'unity');
    assert.equal((await detectEngine(probe(['lib/my.loader.js']))).name, 'html5');
  });

  it('recognizes Cocos Creator 3 by its real output and reads the version from settings', async () => {
    const guess = await detectEngine(
      probe(['index.html', 'application.js', 'cocos-js/cc.js', 'cocos-js/_virtual_cc-CArsJ5Rl.js', 'src/settings.json'], { texts: { 'src/settings.json': '{"CocosEngine":"3.8.8","engine":{}}' } }),
    );
    assert.deepEqual(guess, { name: 'cocos', version: '3.8.8' });
    const md5 = await detectEngine(probe(['cocos-js/cc.1a2b3.js', 'src/settings.abc12.json'], { texts: { 'src/settings.abc12.json': '{"CocosEngine":"3.8.5"}' } }));
    assert.deepEqual(md5, { name: 'cocos', version: '3.8.5' });
  });

  it('recognizes Phaser in a bundle, minified or not, 3 or 4', async () => {
    const min3 = await detectEngine(probe(['index.html', 'game.js'], { texts: { 'game.js': 'x,8054:(t,e,i)=>{var s={VERSION:"3.90.0",LOG_VERSION:"v390",BlendModes:i(1)' } }));
    assert.deepEqual(min3, { name: 'phaser', version: '3.90.0' });
    const min4 = await detectEngine(probe(['game.js'], { texts: { 'game.js': 'var r={VERSION:"4.2.1",LOG_VERSION:"v4021"' } }));
    assert.deepEqual(min4, { name: 'phaser', version: '4.2.1' });
    const plain = await detectEngine(probe(['lib/phaser.js'], { texts: { 'lib/phaser.js': "VERSION: '3.60.0',\n\n    LOG_VERSION: 'v360'," } }));
    assert.deepEqual(plain, { name: 'phaser', version: '3.60.0' });
    assert.deepEqual(await detectEngine(probe(['lib/phaser.min.js'], { texts: { 'lib/phaser.min.js': 'renamed' } })), { name: 'phaser', version: null });
  });

  it('falls back to html5', async () => {
    assert.deepEqual(await detectEngine(probe(['index.html', 'game.js'], { texts: { 'game.js': 'plain' } })), { name: 'html5', version: null });
  });
});

describe('earlyFetchList', () => {
  const UNITY = [
    { path: 'Build/g.loader.js', size: 10 },
    { path: 'Build/g.framework.js.br', size: 10 },
    { path: 'Build/g.data.br', size: 10 },
    { path: 'Build/g.wasm.br', size: 10 },
    { path: 'Build/g.symbols.json.br', size: 10 },
  ];
  const HTML = 'dataUrl: buildUrl + "/g.data.br", codeUrl: buildUrl + "/g.wasm.br", frameworkUrl: buildUrl + "/g.framework.js.br"';

  it('takes Unity data and wasm but never the framework or symbols', () => {
    assert.deepEqual(earlyFetchList('unity', UNITY, HTML), ['Build/g.data.br', 'Build/g.wasm.br']);
  });

  it('skips a file the template does not ask for by that exact name', () => {
    assert.deepEqual(earlyFetchList('unity', UNITY, 'dataUrl: "Build/g.data.br?v=2", codeUrl: "Build/g.wasm.br"'), ['Build/g.wasm.br']);
  });

  it('takes the big Cocos wasm, which the engine fetches', () => {
    const files = [
      { path: 'cocos-js/assets/bullet.release.wasm-BIzkn7bF.wasm', size: 469_455 },
      { path: 'cocos-js/assets/small-x.wasm', size: 2000 },
      { path: 'cocos-js/_virtual_cc-CArsJ5Rl.js', size: 3_133_775 },
    ];
    assert.deepEqual(earlyFetchList('cocos', files, ''), ['cocos-js/assets/bullet.release.wasm-BIzkn7bF.wasm']);
  });

  it('leaves Phaser and plain HTML5 out — their loaders do not fetch', () => {
    assert.deepEqual(earlyFetchList('phaser', [{ path: 'a.data', size: 1e7 }], '"a.data"'), []);
    assert.deepEqual(earlyFetchList('html5', [{ path: 'a.wasm', size: 1e7 }], '"a.wasm"'), []);
  });
});
