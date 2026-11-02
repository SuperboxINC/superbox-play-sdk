/**
 * 샘플 자원을 public/assets 에 그린다 — git 밖(sdk/.gitignore). 32장 · 약 12MB.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeTiles } from '../shared/make-png.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
await writeTiles(path.join(here, 'public/assets'), { count: 32 });
