#!/usr/bin/env node
/**
 * 도구 묶음 빌드 — 부트 런타임 → package-core(문자열로 들어간다) → cli · sdk · phaser · Cocos 확장.
 *   npm run build            전부(타입 선언까지)
 *   node scripts/build.mjs --no-types   시험 앞에 쓴다 — 타입 선언을 빼면 몇 초 안에 끝난다
 */
import { build } from 'esbuild';
import { execFile } from 'node:child_process';
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { buildRuntime } from '../packages/runtime/build.mjs';
import { publicPhaserTypes } from './build-rules.mjs';

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webRoot = path.resolve(root, '../web');
const withTypes = !process.argv.includes('--no-types');
const NODE_TARGET = 'node20'; // Cocos Creator 3.8 의 Electron Node 와 맞춘다
const BROWSER_TARGET = ['es2020', 'safari14.1', 'chrome80'];

async function bundle(options) {
  await build({ absWorkingDir: root, bundle: true, legalComments: 'none', logLevel: 'warning', ...options });
}

const exists = (file) => stat(file).then(() => true, () => false);

/**
 * CLI `dev` 가 함께 내주는 Play SDK — 게임존과 같은 파일을 쓴다. 게임센터 웹이 옆에 있으면 그 빌드 스크립트로 만든 것을 복사하고,
 * 없으면(공개 저장소) 저장소에 같이 들어 있는 파일을 그대로 쓴다.
 */
async function copyPlaySdk() {
  const target = path.join(root, 'packages/cli/dist/v1.js');
  const webBuilder = path.join(webRoot, 'scripts/build-play-sdk.mjs');
  if (!(await exists(webBuilder))) {
    if (await exists(target)) return;
    throw new Error('packages/cli/dist/v1.js 가 없어요 — 저장소를 다시 받아 주세요');
  }
  const source = path.join(webRoot, 'public/sdk/play/v1.js');
  if (await exists(path.join(webRoot, 'node_modules/esbuild'))) await run(process.execPath, [webBuilder], { cwd: webRoot });
  if (!(await exists(source))) throw new Error('게임센터 웹의 Play SDK 빌드가 없다 — 웹 폴더에서 npm install 뒤 npm run build:sdk 를 돌린다');
  await mkdir(path.dirname(target), { recursive: true });
  await cp(source, target);
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const absolute = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  }));
  return nested.flat();
}

/** 타입 선언 — tsc 가 내고, 원본의 `.ts` import 를 배포용 `.js` 로 바꾼다. */
async function emitTypes(packageDir) {
  const outDir = path.join(root, packageDir, 'dist/types');
  await rm(outDir, { recursive: true, force: true });
  const tsc = path.join(root, 'node_modules/typescript/bin/tsc');
  await run(process.execPath, [tsc, '-p', path.join(packageDir, 'tsconfig.types.json')], { cwd: root });
  for (const file of await walk(outDir)) {
    if (!file.endsWith('.d.ts')) continue;
    const text = await readFile(file, 'utf8');
    await writeFile(file, text.replace(/(from\s+['"]\.{1,2}\/[^'"]+)\.ts(['"])/g, '$1.js$2').replace(/(import\(['"]\.{1,2}\/[^'"]+)\.ts(['"]\))/g, '$1.js$2'));
  }
}

/** Phaser 선언이 읽는 SDK 선언을 같은 저장소의 상대 경로로 — 공개 저장소에서 다시 빌드해도 받아 쓰는 쪽과 같은 선언이 나온다. */
async function pointPhaserTypesAtSdk() {
  for (const file of await walk(path.join(root, 'packages/phaser/dist/types'))) {
    if (file.endsWith('.d.ts')) await writeFile(file, publicPhaserTypes(await readFile(file, 'utf8')));
  }
}

const started = Date.now();
const sizes = await buildRuntime();

await bundle({
  entryPoints: { index: 'packages/package-core/src/index.ts' },
  outdir: 'packages/package-core/dist',
  platform: 'node',
  format: 'esm',
  target: NODE_TARGET,
});
await bundle({
  entryPoints: { browser: 'packages/package-core/src/browser.ts' },
  outdir: 'packages/package-core/dist',
  platform: 'browser',
  format: 'esm',
  target: BROWSER_TARGET,
});

await bundle({
  entryPoints: { cli: 'packages/cli/src/cli.ts' },
  outdir: 'packages/cli/dist',
  platform: 'node',
  format: 'esm',
  target: 'node24',
  banner: { js: '#!/usr/bin/env node' },
});
await copyPlaySdk();

await bundle({
  entryPoints: { index: 'packages/sdk/src/index.ts' },
  outdir: 'packages/sdk/dist',
  platform: 'browser',
  format: 'esm',
  target: BROWSER_TARGET,
});

await bundle({
  entryPoints: { index: 'packages/phaser/src/index.ts' },
  outdir: 'packages/phaser/dist',
  platform: 'browser',
  format: 'esm',
  target: BROWSER_TARGET,
});
await bundle({
  entryPoints: { 'superbox-play-phaser': 'packages/phaser/src/global.ts' },
  outdir: 'packages/phaser/dist',
  platform: 'browser',
  format: 'iife',
  target: BROWSER_TARGET,
  minify: true,
});

// 확장은 Creator 가 require 로 읽는다 — package-core 까지 한 파일에 묶어 프로젝트에 node_modules 를 요구하지 않는다
await bundle({
  entryPoints: {
    builder: 'engines/cocos-creator/superbox-play/source/builder.ts',
    hooks: 'engines/cocos-creator/superbox-play/source/hooks.ts',
    main: 'engines/cocos-creator/superbox-play/source/main.ts',
  },
  outdir: 'engines/cocos-creator/superbox-play/dist',
  platform: 'node',
  format: 'cjs',
  target: NODE_TARGET,
});

// Unity 메뉴가 Node 로 실행한다 — 한 파일에 묶어 패키지에 넣는다. `~` 폴더라 Unity 가 임포트하지 않고 .meta 도 필요 없다
await bundle({
  entryPoints: { 'package-build': 'engines/unity/packager/main.ts' },
  outdir: 'engines/unity/superbox-play/Editor/Packager~',
  outExtension: { '.js': '.mjs' },
  platform: 'node',
  format: 'esm',
  target: 'node14', // 메뉴는 Unity WebGL 모듈의 Node 로 돈다 — 낡은 Unity 의 Node 도 받는다(NodeFinder.MinimumMajorVersion 과 맞춘다)
});

if (withTypes) {
  // phaser 의 선언은 sdk 의 선언을 읽는다 — 동시에 돌리면 지워진 sdk 선언을 보고 실패한다
  await emitTypes('packages/package-core');
  await emitTypes('packages/sdk');
  await emitTypes('packages/phaser');
  await pointPhaserTypesAtSdk();
}

process.stdout.write(`빌드 완료 ${Date.now() - started}ms · 부트 ${sizes.bootBytes}B · 기본 로딩 화면 ${sizes.loadingBytes}B\n`);
