import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { verifyPackageFile } from '../../../../packages/package-core/src/index.ts';
import { publishSdkPolicy } from '../../../../packages/package-core/src/test-support.ts';
import { configs, DEFAULT_ZONE_ORIGIN, isAcceptableZone, PACKAGE_NAME, readBuildOptions } from './builder.ts';
import { onAfterBuild, throwError } from './hooks.ts';
import { packageCocosBuild } from './package-build.ts';

/**
 * 에디터 없이 하는 검증 — Creator 3.8.8 실제 빌드에서 그대로 옮긴 구조로 패키징을 본다.
 * 실제 빌드 검증은 sdk/README 의 절차(창 모드 + 빌더 메시지)에 있다.
 */
const here = path.dirname(fileURLToPath(import.meta.url));

// Creator 3.8.8 `build/web-mobile/index.html` 그대로(주석 일부만 줄였다)
const REAL_INDEX = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">

  <title>Cocos Creator | hello-world</title>

  <!--http://www.html5rocks.com/en/mobile/mobifying/-->
  <meta name="viewport"
        content="width=device-width,user-scalable=no,initial-scale=1,minimum-scale=1,maximum-scale=1,minimal-ui=true"/>

  <link rel="stylesheet" type="text/css" href="style.css"/>

</head>
<body>
  <div id="GameDiv" cc_exact_fit_screen="true">
      <div id="Cocos3dGameContainer">
        <canvas id="GameCanvas" oncontextmenu="event.preventDefault()" tabindex="99"></canvas>
      </div>
    </div>


<!-- Polyfills bundle. -->

<script src="src/polyfills.bundle.js" charset="utf-8"> </script>


<!-- SystemJS support. -->
<script src="src/system.bundle.js" charset="utf-8"> </script>

<!-- Import map -->
<script src="src/import-map.json" type="systemjs-importmap" charset="utf-8"> </script>

<script>
    System.import('./index.js').catch(function(err) { console.error(err); })
</script>

</body>
</html>
`;

const REAL_FILES: Readonly<Record<string, string | Uint8Array>> = {
  'index.html': REAL_INDEX,
  'index.js': 'System.register([],function(){return{execute:function(){}}});',
  'application.js': 'System.register([],function(){return{execute:function(){}}});',
  'style.css': 'html{}',
  'cocos-js/cc.js': 'System.register([],function(){});',
  'cocos-js/_virtual_cc-CArsJ5Rl.js': 'x'.repeat(2048),
  'cocos-js/assets/bullet.release.wasm-BIzkn7bF.wasm': new Uint8Array(200 * 1024),
  'cocos-js/assets/spine-CC34fKUR.wasm': new Uint8Array(1024),
  'src/settings.json': '{"CocosEngine":"3.8.8","engine":{"platform":"web-mobile"}}',
  'src/import-map.json': '{"imports":{"cc":"./../cocos-js/cc.js"}}',
  'src/system.bundle.js': 'x',
  'src/polyfills.bundle.js': 'x',
  'src/effect.bin': new Uint8Array(16),
  'src/chunks/bundle.js': 'x',
  'assets/main/config.json': '{}',
  'assets/main/index.js': 'x',
  'assets/internal/config.json': '{}',
  'assets/internal/index.js': 'x',
  'assets/main/native/95/95e5b02a-e338-423c-bdbb-17486db1d9eb.jpg': new Uint8Array(8),
  'assets/main/native/5a/5af201b5-5951-4e2c-a81f-ac4aad9132cb@b47c0@bb97f.jpg': new Uint8Array(8),
};

let root = '';
let counter = 0;

before(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'sbp-cocos-'));
});

after(async () => {
  await rm(root, { recursive: true, force: true });
});

async function makeProject(extra: Readonly<Record<string, string>> = {}): Promise<{ readonly projectDir: string; readonly dest: string }> {
  counter += 1;
  const projectDir = path.join(root, `project-${counter}`);
  const dest = path.join(projectDir, 'build/web-mobile');
  for (const [name, content] of Object.entries(REAL_FILES)) {
    const target = path.join(dest, name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  for (const [name, content] of Object.entries(extra)) {
    const target = path.join(projectDir, name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  return { projectDir, dest };
}

describe('packageCocosBuild on the real web-mobile structure', () => {
  it('packages as cocos with the version from settings and a valid, verifiable file', async () => {
    const { projectDir, dest } = await makeProject({ 'package.json': JSON.stringify({ name: 'my-game', version: '1.2.3' }) });
    const report = await packageCocosBuild({ dest, projectDir });
    assert.equal(report.manifest.engine.name, 'cocos');
    assert.equal(report.manifest.engine.version, '3.8.8');
    assert.equal(report.manifest.title, 'my-game');
    assert.equal(report.manifest.version, '1.2.3');
    assert.equal(report.manifest.zoneOrigin, DEFAULT_ZONE_ORIGIN);
    assert.equal(path.basename(report.outPath), 'web-mobile-1.2.3.sbp');
    assert.equal(path.dirname(report.outPath), path.dirname(dest), '빌드 폴더 안에 두지 않는다');
    await verifyPackageFile(report.outPath);
  });

  it('keeps sub-asset names with @ — real Cocos builds have them', async () => {
    const { projectDir, dest } = await makeProject();
    const report = await packageCocosBuild({ dest, projectDir });
    assert.ok(report.manifest.files.some((file) => file.path.endsWith('5af201b5-5951-4e2c-a81f-ac4aad9132cb@b47c0@bb97f.jpg')));
  });

  it('injects before the polyfills and lists the big engine wasm for early fetch', async () => {
    const { projectDir, dest } = await makeProject({ 'superbox.config.json': JSON.stringify({ title: '설정 이름', version: '9.0.0', loading: { primaryColor: '#14B8A6' } }) });
    const report = await packageCocosBuild({ dest, projectDir, zoneOrigin: 'http://localhost:8200' });
    assert.equal(report.manifest.title, '설정 이름');
    assert.equal(report.manifest.version, '9.0.0');
    assert.equal(report.manifest.zoneOrigin, 'http://localhost:8200');
    assert.equal(report.manifest.loading.mode, 'theme');
    const bytes = await readFile(report.outPath);
    const text = bytes.toString('utf8');
    const entryAt = text.indexOf('<!-- sbp:v1 -->');
    assert.ok(entryAt > 0);
    const sdkAt = text.indexOf('http://localhost:8200/sdk/play/v1.js', entryAt);
    assert.ok(sdkAt > entryAt);
    assert.ok(sdkAt < text.indexOf('src/polyfills.bundle.js', entryAt));
    assert.ok(text.includes('"earlyFetch":["cocos-js/assets/bullet.release.wasm-BIzkn7bF.wasm"]'));
    assert.ok(text.includes('"engine":"cocos"'));
    assert.ok(report.warnings.some((item) => item.code === 'VIEWPORT_KEPT'));
    assert.ok(report.warnings.some((item) => item.code === 'LOCAL_ZONE'));
  });

  it('does not touch the build folder itself', async () => {
    const { projectDir, dest } = await makeProject();
    await packageCocosBuild({ dest, projectDir });
    assert.equal(await readFile(path.join(dest, 'index.html'), 'utf8'), REAL_INDEX);
  });

  it('packages twice without packaging its own output', async () => {
    const { projectDir, dest } = await makeProject();
    const first = await packageCocosBuild({ dest, projectDir });
    const second = await packageCocosBuild({ dest, projectDir });
    assert.equal(second.manifest.totals.count, first.manifest.totals.count);
  });

  it('defaults version and title without a project package.json', async () => {
    const { projectDir, dest } = await makeProject();
    const report = await packageCocosBuild({ dest, projectDir });
    assert.equal(report.manifest.version, '1.0.0');
    assert.equal(report.manifest.title, null);
  });
});

describe('build options', () => {
  it('defaults to enabled and the production zone — the command line has no panel values', () => {
    assert.deepEqual(readBuildOptions(undefined), { enabled: true, zone: DEFAULT_ZONE_ORIGIN });
    assert.deepEqual(readBuildOptions({}), { enabled: true, zone: DEFAULT_ZONE_ORIGIN });
    assert.deepEqual(readBuildOptions({ [PACKAGE_NAME]: { enabled: false, zone: '' } }), { enabled: false, zone: DEFAULT_ZONE_ORIGIN });
    assert.deepEqual(readBuildOptions({ [PACKAGE_NAME]: { zone: 'http://localhost:8200' } }), { enabled: true, zone: 'http://localhost:8200' });
  });

  it('accepts https and local http zones', () => {
    assert.equal(isAcceptableZone('https://game.superboxgo.com'), true);
    assert.equal(isAcceptableZone('http://localhost:8200'), true);
    assert.equal(isAcceptableZone('http://sample.localhost:8200'), true);
    assert.equal(isAcceptableZone('http://game.superboxgo.com'), false);
    assert.equal(isAcceptableZone('https://game.superboxgo.com/x'), false);
    assert.equal(isAcceptableZone(1), false);
  });

  it('registers on the two web platforms only', () => {
    assert.deepEqual(Object.keys(configs).sort(), ['web-desktop', 'web-mobile']);
    assert.equal(configs['web-mobile'].hooks, './hooks');
    assert.equal(configs['web-mobile'].verifyRuleMap.superboxZone.func('http://localhost:8200'), true);
    assert.equal(configs['web-mobile'].verifyRuleMap.superboxZone.func('nope'), false);
  });
});

describe('hooks', () => {
  it('fails the build when packaging fails', () => {
    assert.equal(throwError, true);
  });

  it('does nothing when disabled', async () => {
    const { dest } = await makeProject();
    await onAfterBuild({ platform: 'web-mobile', packages: { [PACKAGE_NAME]: { enabled: false } } }, { dest });
    await assert.rejects(readFile(`${dest}-1.0.0.sbp`));
  });

  it('rejects when the build folder breaks the rules, so the build shows as failed', async () => {
    const { dest } = await makeProject();
    await writeFile(path.join(dest, '한글.png'), 'x');
    await assert.rejects(onAfterBuild({ platform: 'web-mobile' }, { dest }));
  });

  it('rejects when this tool version can no longer be used, and makes no package', async () => {
    const { dest } = await makeProject();
    const close = await publishSdkPolicy({ minVersion: '99.0.0', recommendedVersion: '99.0.0' });
    try {
      await assert.rejects(onAfterBuild({ platform: 'web-mobile' }, { dest }), /99\.0\.0/);
      await assert.rejects(readFile(`${dest}-1.0.0.sbp`));
    } finally {
      await close();
    }
  });
});

describe('extension manifest', () => {
  it('registers the builder script and mounts the runtime piece read-only', async () => {
    const manifest = JSON.parse(await readFile(path.join(here, '../package.json'), 'utf8'));
    assert.equal(manifest.package_version, 2);
    assert.equal(manifest.name, PACKAGE_NAME);
    assert.equal(manifest.contributions.builder, './dist/builder.js');
    assert.deepEqual(manifest.contributions['asset-db'].mount, { path: './assets', readonly: true });
  });

  it('the runtime piece covers the wrappers and pauses the game', async () => {
    const piece = await readFile(path.join(here, '../assets/SuperboxPlay.ts'), 'utf8');
    for (const text of ['showRewarded', 'showInterstitial', 'purchase', 'completeOrder', 'missions', "'app.pause'", "'app.resume'", 'game.pause()', 'game.resume()', 'preloadScene', 'EVENT_AFTER_SCENE_LAUNCH']) {
      assert.ok(piece.includes(text), text);
    }
  });
});
