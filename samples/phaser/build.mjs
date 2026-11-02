/**
 * 같은 게임 코드를 Phaser 3 · 4 로 각각 묶는다 — dist/phaser3 · dist/phaser4.
 * 자원은 그때 그린다(저장소에 큰 이진 파일을 넣지 않는다).
 */
import { build } from 'esbuild';
import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeTiles } from '../shared/make-png.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const TILE_COUNT = 32;

for (const variant of ['phaser3', 'phaser4']) {
  const out = path.join(here, 'dist', variant);
  await mkdir(out, { recursive: true });
  await cp(path.join(here, 'public'), out, { recursive: true });
  await writeTiles(path.join(out, 'assets'), { count: TILE_COUNT });
  await build({
    absWorkingDir: here,
    entryPoints: ['src/game.ts'],
    outfile: path.join(out, 'game.js'),
    bundle: true,
    minify: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2020'],
    // 게임사가 쓰는 이름 그대로 부른다 — 이 저장소에서는 옆의 빌드 결과로 잇는다(먼저 빌드)
    alias: { phaser: variant, 'superbox-play-sdk/phaser': path.resolve(here, '../../packages/phaser/dist/index.js') },
    legalComments: 'none',
    logLevel: 'warning',
  });
}
