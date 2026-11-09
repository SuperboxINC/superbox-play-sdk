import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { VERSION_PATTERN } from '../../../../packages/package-core/src/browser.ts';
import { CONFIG_FILE, createPackage, loadConfigFile, type PackageReport, type SuperboxConfig } from '../../../../packages/package-core/src/index.ts';
import extensionPackage from '../package.json' with { type: 'json' };

/**
 * Cocos 빌드 폴더 → `.sbp`. 패키징 규칙은 CLI 와 같은 package-core 다.
 * 설정 파일은 프로젝트 루트의 superbox.config.json 이고, 없는 칸은 프로젝트 package.json 의 이름 · 버전으로 채운다.
 * 출력은 빌드 폴더 옆이다(`build/web-mobile-1.0.0.sbp`) — 폴더 안에 두면 다음 패키징에 섞인다.
 */
export interface CocosPackageInput {
  readonly dest: string;
  readonly projectDir: string;
  readonly zoneOrigin?: string;
  readonly now?: Date;
}

const DEFAULT_VERSION = '1.0.0';
const MAX_TITLE_LENGTH = 100;

interface ProjectInfo {
  readonly name?: unknown;
  readonly version?: unknown;
}

async function readJsonIfExists<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

function withProjectDefaults(config: SuperboxConfig, project: ProjectInfo | null): SuperboxConfig {
  const version = config.version ?? (typeof project?.version === 'string' && VERSION_PATTERN.test(project.version) ? project.version : DEFAULT_VERSION);
  const projectName = typeof project?.name === 'string' && project.name.length <= MAX_TITLE_LENGTH ? project.name : undefined;
  const title = config.title ?? projectName;
  return { ...config, version, ...(title === undefined ? {} : { title }), engine: 'cocos' };
}

export async function packageCocosBuild(input: CocosPackageInput): Promise<PackageReport> {
  const configPath = path.join(input.projectDir, CONFIG_FILE);
  const hasConfig = (await readJsonIfExists(configPath)) !== null;
  const loaded = hasConfig ? await loadConfigFile(configPath) : { config: {}, warnings: [] };
  const project = await readJsonIfExists<ProjectInfo>(path.join(input.projectDir, 'package.json'));
  const config = withProjectDefaults(loaded.config, project);
  const report = await createPackage({
    folder: input.dest,
    out: `${path.resolve(input.dest)}-${config.version ?? DEFAULT_VERSION}.sbp`,
    config,
    configDir: input.projectDir,
    engine: 'cocos',
    ...(input.zoneOrigin === undefined ? {} : { zoneOrigin: input.zoneOrigin }),
    ...(input.now === undefined ? {} : { now: input.now }),
    tool: { name: 'superbox-play', version: extensionPackage.version },
  });
  return { ...report, warnings: [...loaded.warnings, ...report.warnings] };
}
