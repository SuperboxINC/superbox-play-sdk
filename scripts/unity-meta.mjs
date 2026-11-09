#!/usr/bin/env node
/**
 * Unity 패키지의 .meta 를 만든다 — git 주소로 받는 패키지는 읽기 전용이라 Unity 가 만들지 못하고, .meta 없는 파일은 조용히 빠진다.
 * GUID 는 경로에서 뽑아 몇 번을 돌려도 같다. 파일을 더하면 `npm run unity:meta`.
 */
import { createHash } from 'node:crypto';
import { readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const UNITY_PACKAGE_NAME = 'com.superbox.play';
export const UNITY_PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../engines/unity/superbox-play');

export function guidOf(relative) {
  return createHash('md5').update(`${UNITY_PACKAGE_NAME}/${relative}`).digest('hex');
}

const importerBlock = (name) => `${name}:\n  externalObjects: {}\n  userData: \n  assetBundleName: \n  assetBundleVariant: \n`;

/** 파일 종류마다 Unity 가 만드는 것과 같은 모양 — 스크립트 · jslib 은 두 줄이면 나머지를 Unity 가 기본값으로 채운다 */
export function metaTextFor(relative, isDirectory) {
  const head = `fileFormatVersion: 2\nguid: ${guidOf(relative)}\n`;
  if (isDirectory) return `${head}folderAsset: yes\n${importerBlock('DefaultImporter')}`;
  if (relative === 'package.json') return `${head}${importerBlock('PackageManifestImporter')}`;
  if (relative.endsWith('.asmdef')) return `${head}${importerBlock('AssemblyDefinitionImporter')}`;
  if (relative.endsWith('.md') || relative.endsWith('.json')) return `${head}${importerBlock('TextScriptImporter')}`;
  return head;
}

/** .meta 가 있어야 하는 파일과 폴더 — Unity 가 무시하는 `~` 폴더 · 점 파일은 뺀다 */
export async function unityAssets(dir = UNITY_PACKAGE_ROOT, prefix = '') {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .filter((entry) => !entry.name.endsWith('~') && !entry.name.startsWith('.') && !entry.name.endsWith('.meta'))
      .map(async (entry) => {
        const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (!entry.isDirectory()) return [{ relative, isDirectory: false }];
        return [{ relative, isDirectory: true }, ...(await unityAssets(path.join(dir, entry.name), relative))];
      }),
  );
  return nested.flat();
}

async function writeMissingMetas() {
  let written = 0;
  for (const { relative, isDirectory } of await unityAssets()) {
    const file = path.join(UNITY_PACKAGE_ROOT, `${relative}.meta`);
    const exists = await stat(file).then(() => true, () => false);
    if (exists) continue;
    await writeFile(file, metaTextFor(relative, isDirectory));
    written += 1;
  }
  process.stdout.write(`.meta ${written}개를 만들었어요\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await writeMissingMetas();
