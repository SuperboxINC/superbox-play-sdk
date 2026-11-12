import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PackageError } from './errors.ts';
import { isSafeBuildPath, isZoneOrigin } from './limits.ts';
import { parseManifest } from './manifest.ts';
import { sampleManifest } from './test-support.ts';

function failsOn(overrides: Readonly<Record<string, unknown>>, field: string): void {
  assert.throws(
    () => parseManifest(sampleManifest(overrides)),
    (error: unknown) => error instanceof PackageError && error.code === 'MANIFEST_INVALID' && error.detail === field,
    field,
  );
}

const ONE_FILE = (file: Record<string, unknown>): Record<string, unknown> => ({ totals: { count: 1, bytes: 1 }, entry: 'a.js', files: [{ path: 'a.js', size: 1, sha256: 'a'.repeat(64), encoding: null, ...file }] });

describe('parseManifest', () => {
  it('returns the checked fields and drops unknown ones', () => {
    const manifest = parseManifest(sampleManifest({ future: true }));
    assert.equal(manifest.zoneOrigin, 'https://game.superboxgo.com');
    assert.equal('future' in manifest, false);
  });

  it('reads the aspect range — null when the package has none (packages before it)', () => {
    assert.equal(parseManifest(sampleManifest()).aspectRange, null);
    assert.equal(parseManifest(sampleManifest({ aspectRange: null })).aspectRange, null);
    assert.deepEqual(parseManifest(sampleManifest({ aspectRange: { min: 1.3333, max: 2.4, step: 1 } })).aspectRange, { min: 1.3333, max: 2.4 });
  });

  it('accepts null title and null engine version', () => {
    const manifest = parseManifest(sampleManifest({ title: null, engine: { name: 'unity', version: null } }));
    assert.equal(manifest.title, null);
    assert.equal(manifest.engine.name, 'unity');
  });

  it('takes the ranges the server takes — offsets, nanoseconds, an emoji title', () => {
    for (const createdAt of ['2026-11-01T21:00:00+09:00', '2026-11-01T12:00:00Z', '2026-11-01T12:00:00.123456789Z', '2026-11-01T12:00:00.5-05:00']) {
      assert.equal(parseManifest(sampleManifest({ createdAt })).createdAt, createdAt);
    }
    const family = String.fromCodePoint(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467);
    assert.equal(parseManifest(sampleManifest({ title: `숫자 게임 ${family}` })).title, `숫자 게임 ${family}`);
    const label = 'x'.repeat(64);
    const manifest = parseManifest(sampleManifest({ engine: { name: 'unity', version: label }, tool: { name: label, version: '1.0 beta (x64)' } }));
    assert.equal(manifest.engine.version, label);
    assert.equal(manifest.tool.version, '1.0 beta (x64)');
  });

  it('refuses an unknown major format', () => {
    assert.throws(() => parseManifest(sampleManifest({ format: 2 })), (error: unknown) => error instanceof PackageError && error.code === 'FORMAT_UNSUPPORTED');
    failsOn({ format: '1' }, 'format');
  });

  it('checks every field by length and shape', () => {
    failsOn({ version: 'a b' }, 'version');
    failsOn({ version: '-1' }, 'version');
    failsOn({ title: '' }, 'title');
    failsOn({ title: 'x'.repeat(101) }, 'title');
    failsOn({ title: 'a\u0007b' }, 'title');
    failsOn({ orientation: 'up' }, 'orientation');
    failsOn({ engine: { name: 'godot', version: null } }, 'engine.name');
    failsOn({ engine: { name: 'unity', version: 'x'.repeat(65) } }, 'engine.version');
    failsOn({ tool: { name: '', version: '1' } }, 'tool.name');
    failsOn({ zoneOrigin: 'https://game.superboxgo.com/path' }, 'zoneOrigin');
    failsOn({ zoneOrigin: 'javascript:alert(1)' }, 'zoneOrigin');
    failsOn({ loading: { mode: 'fancy', backgroundColor: '#000000', primaryColor: '#000000' } }, 'loading.mode');
    failsOn({ loading: { mode: 'default', backgroundColor: 'red', primaryColor: '#000000' } }, 'loading.backgroundColor');
    failsOn({ loading: { mode: 'default', backgroundColor: '#000000', primaryColor: '#00000' } }, 'loading.primaryColor');
    failsOn({ createdAt: 'yesterday' }, 'createdAt');
    failsOn({ createdAt: '2026-11-01T12:00:00' }, 'createdAt');
    failsOn({ createdAt: '2026-11-01 12:00:00Z' }, 'createdAt');
    failsOn({ createdAt: '2026-13-41T12:00:00Z' }, 'createdAt');
    failsOn({ engine: { name: 'unity', version: '6000.3\n' } }, 'engine.version');
    failsOn({ engine: { name: 'unity', version: '육천' } }, 'engine.version');
    failsOn({ engine: { name: 'unity', version: '   ' } }, 'engine.version');
    failsOn({ tool: { name: '도구', version: '1' } }, 'tool.name');
    failsOn({ tool: { name: 'x'.repeat(65), version: '1' } }, 'tool.name');
    failsOn({ tool: { name: 'a', version: '1\u0000' } }, 'tool.version');
    failsOn({ tool: { name: 'a', version: 'é' } }, 'tool.version');
    failsOn({ title: `a${String.fromCharCode(0x2028)}b` }, 'title');
    failsOn({ title: `a${String.fromCharCode(0x2029)}b` }, 'title');
    failsOn({ title: `a${String.fromCharCode(0x202e)}b` }, 'title');
    failsOn({ title: `a${String.fromCharCode(0x2066)}b` }, 'title');
    failsOn({ totals: { count: 2, bytes: -1 } }, 'totals.bytes');
    failsOn({ totals: { count: 3, bytes: 1 } }, 'totals');
    failsOn({ files: 'none' }, 'files');
    failsOn(ONE_FILE({ sha256: 'A'.repeat(64) }), 'files[0].sha256');
    failsOn(ONE_FILE({ sha256: 'a'.repeat(63) }), 'files[0].sha256');
    failsOn(ONE_FILE({ size: 1.5 }), 'files[0].size');
    failsOn(ONE_FILE({ encoding: 'zstd' }), 'files[0].encoding');
    failsOn({ aspectRange: 'wide' }, 'aspectRange');
    failsOn({ aspectRange: { min: 1.3333 } }, 'aspectRange.max');
    failsOn({ aspectRange: { min: '4:3', max: 2.4 } }, 'aspectRange.min');
    failsOn({ aspectRange: { min: 0.1, max: 2 } }, 'aspectRange.min');
    failsOn({ aspectRange: { min: 1, max: 5 } }, 'aspectRange.max');
    failsOn({ aspectRange: { min: 2.4, max: 1.3333 } }, 'aspectRange');
  });

  it('refuses unsafe, reserved and duplicate paths, and an entry outside the files', () => {
    assert.throws(() => parseManifest(sampleManifest({ entry: '../index.html' })), (error: unknown) => error instanceof PackageError && error.code === 'PATH_UNSAFE');
    assert.throws(() => parseManifest(sampleManifest(ONE_FILE({ path: '../a.js' }))), (error: unknown) => error instanceof PackageError && error.code === 'PATH_UNSAFE');
    assert.throws(() => parseManifest(sampleManifest({ ...ONE_FILE({ path: 'sbp-manifest.json' }), entry: 'sbp-manifest.json' })), (error: unknown) => error instanceof PackageError && error.code === 'RESERVED_NAME');
    assert.throws(() => parseManifest(sampleManifest({ entry: 'missing.html' })), (error: unknown) => error instanceof PackageError && error.code === 'ENTRY_MISSING');
    const base = sampleManifest() as { files: unknown[] };
    assert.throws(
      () => parseManifest(sampleManifest({ files: [base.files[0], base.files[0]] })),
      (error: unknown) => error instanceof PackageError && error.code === 'DUPLICATE_PATH',
    );
  });

  it('refuses too many files and too many bytes', () => {
    const many = Array.from({ length: 2001 }, (_, index) => ({ path: `f${index}`, size: 0, sha256: 'a'.repeat(64), encoding: null }));
    assert.throws(() => parseManifest(sampleManifest({ files: many })), (error: unknown) => error instanceof PackageError && error.code === 'TOO_MANY_FILES');
    assert.throws(
      () => parseManifest(sampleManifest({ entry: 'a', totals: { count: 1, bytes: 600_000_000 }, files: [{ path: 'a', size: 600_000_000, sha256: 'a'.repeat(64), encoding: null }] })),
      (error: unknown) => error instanceof PackageError && error.code === 'TOO_LARGE',
    );
  });
});

describe('build rules', () => {
  it('match the api isSafeBuildPath cases', () => {
    assert.equal(isSafeBuildPath('index.html'), true);
    assert.equal(isSafeBuildPath('Build/game.wasm.br'), true);
    assert.equal(isSafeBuildPath('TemplateData/style (1).css'), true);
    assert.equal(isSafeBuildPath('assets/main/native/5a/5af201b5-5951-4e2c-a81f-ac4aad9132cb@b47c0@bb97f.jpg'), true, 'Cocos 서브 에셋');
    assert.equal(isSafeBuildPath('../other-game/index.html'), false);
    assert.equal(isSafeBuildPath('Build/../../x'), false);
    assert.equal(isSafeBuildPath('/abs'), false);
    assert.equal(isSafeBuildPath('dir/'), false);
    assert.equal(isSafeBuildPath('BuildConfig~/x'), false);
    assert.equal(isSafeBuildPath(''), false);
  });

  it('zone origins are bare origins', () => {
    assert.equal(isZoneOrigin('https://game.superboxgo.com'), true);
    assert.equal(isZoneOrigin('http://localhost:8200'), true);
    assert.equal(isZoneOrigin('https://game.superboxgo.com/'), false);
    assert.equal(isZoneOrigin('ftp://x'), false);
    assert.equal(isZoneOrigin(undefined), false);
  });
});
