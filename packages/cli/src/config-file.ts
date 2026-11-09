import { access, stat } from 'node:fs/promises';
import path from 'node:path';
import { CONFIG_FILE, loadConfigFile, type SuperboxConfig } from '../../package-core/src/index.ts';
import type { PackageWarning } from '../../package-core/src/browser.ts';
import { CliError } from './errors.ts';

/**
 * 설정 파일 찾기 — `--config` 가 먼저, 없으면 현재 폴더, 그다음 빌드 폴더. 어디에도 없으면 빈 설정(모든 칸이 선택이다).
 * 그림 · 로딩 HTML 경로는 찾은 설정 파일이 기준이다(package-format.md 3장).
 */
export interface ResolvedConfig {
  readonly config: SuperboxConfig;
  readonly configDir: string;
  readonly configPath: string | null;
  readonly warnings: readonly PackageWarning[];
}

async function exists(file: string): Promise<boolean> {
  return access(file).then(() => true, () => false);
}

export async function resolveConfig(folder: string, explicit: string | undefined): Promise<ResolvedConfig> {
  if (explicit) {
    const configPath = path.resolve(explicit);
    if (!(await exists(configPath))) throw new CliError('CONFIG_NOT_FOUND', explicit);
    return { ...(await loadConfigFile(configPath)), configDir: path.dirname(configPath), configPath };
  }
  const candidates = [path.resolve(CONFIG_FILE), path.resolve(folder, CONFIG_FILE)];
  for (const configPath of candidates) {
    if (await exists(configPath)) return { ...(await loadConfigFile(configPath)), configDir: path.dirname(configPath), configPath };
  }
  return { config: {}, configDir: process.cwd(), configPath: null, warnings: [] };
}

export async function isFile(file: string): Promise<boolean> {
  return stat(file).then((info) => info.isFile(), () => false);
}
