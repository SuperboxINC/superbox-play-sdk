/**
 * Cocos 샘플 준비 — 확장을 프로젝트 extensions/ 로 복사하고 자원을 그린다. 둘 다 git 밖이다(sdk/.gitignore).
 * 저장소에 큰 이진 파일을 넣지 않기 위해 자원은 여기서 만든다. 먼저 sdk 에서 npm run build.
 */
import { cp, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeTiles } from '../shared/make-png.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const extension = path.resolve(here, '../../engines/cocos-creator/superbox-play');
const target = path.join(here, 'extensions/superbox-play');
const TILE_COUNT = 24;

const built = await stat(path.join(extension, 'dist/hooks.js')).catch(() => null);
if (!built) throw new Error('확장이 빌드되지 않았습니다 — sdk 에서 npm run build 를 먼저 돌립니다');

await mkdir(target, { recursive: true });
for (const item of ['package.json', 'dist', 'assets']) {
  await cp(path.join(extension, item), path.join(target, item), { recursive: true });
}
await writeTiles(path.join(here, 'assets/resources/generated'), { count: TILE_COUNT });
