import { lstat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { CONFIG_FILE } from '../config.ts';
import { PackageError } from '../errors.ts';

/**
 * 빌드 폴더 걷기 — 패키지에 넣지 않는 파일을 뺀다(package-format.md 3장). 심볼릭 링크는 멈춘다:
 * 패키지가 받지 않고, 링크를 따라가면 폴더 밖 파일이 패키지에 들어갈 수 있다.
 */
export interface WalkOptions {
  readonly keepMaps?: boolean;
  /** 빼야 하는 절대 경로 — 출력 파일이 빌드 폴더 안일 때. */
  readonly ignore?: readonly string[];
}

export interface BuildFileEntry {
  /** 폴더 기준 `/` 경로. */
  readonly path: string;
  readonly absolute: string;
  readonly size: number;
}

const IGNORED_NAMES = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);
const IGNORED_FOLDERS = new Set(['.git', '__MACOSX']);

function isSkipped(name: string, keepMaps: boolean): boolean {
  if (IGNORED_NAMES.has(name)) return true;
  if (name.endsWith('.meta')) return true;
  return !keepMaps && name.endsWith('.map');
}

export async function walkBuildFolder(folder: string, options: WalkOptions = {}): Promise<readonly BuildFileEntry[]> {
  const root = path.resolve(folder);
  const stat = await lstat(root).catch(() => null);
  if (!stat?.isDirectory()) throw new PackageError('FOLDER_MISSING', folder);

  const ignore = new Set((options.ignore ?? []).map((item) => path.resolve(item)));
  const files: BuildFileEntry[] = [];
  const visit = async (dir: string, prefix: string): Promise<void> => {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const relative = `${prefix}${entry.name}`;
      const absolute = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new PackageError('SYMLINK', relative);
      if (entry.isDirectory()) {
        if (!IGNORED_FOLDERS.has(entry.name)) await visit(absolute, `${relative}/`);
        continue;
      }
      if (!entry.isFile() || isSkipped(entry.name, options.keepMaps ?? false)) continue;
      if (relative === CONFIG_FILE || ignore.has(absolute)) continue;
      files.push({ path: relative, absolute, size: (await lstat(absolute)).size });
    }
  };
  await visit(root, '');
  return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}
