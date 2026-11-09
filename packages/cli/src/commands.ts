import { stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_NAMES, PackageError, type EngineName, type PackageManifest } from '../../package-core/src/browser.ts';
import { CONFIG_FILE, createPackage, initialConfig, verifyPackageFile, type PackageReport, type SuperboxConfig } from '../../package-core/src/index.ts';
import type { CliIO } from './cli.ts';
import { isFile, resolveConfig } from './config-file.ts';
import { API_KEY_ENV, API_KEY_FLAG, assertConsoleOrigin, DEFAULT_CONSOLE_ORIGIN, deployPackage, resolveApiKey } from './deploy.ts';
import { startDevServer, DEFAULT_DEV_PORT } from './dev-server.ts';
import { CliError } from './errors.ts';
import { formatBuildReport, formatDeployReport, formatInspectReport } from './report.ts';

/**
 * 명령들 — 패키지 규칙은 package-core 에 있고 여기서는 옵션을 풀어 넘긴다.
 */
export interface CommandValues {
  readonly engine?: string | undefined;
  readonly config?: string | undefined;
  readonly zone?: string | undefined;
  readonly out?: string | undefined;
  readonly 'keep-maps'?: boolean | undefined;
  readonly port?: string | undefined;
  readonly host?: string | undefined;
}

export interface DeployValues {
  readonly game?: string | undefined;
  readonly channel?: string | undefined;
  readonly note?: string | undefined;
  readonly console?: string | undefined;
  readonly 'api-key'?: string | undefined;
}

const SAFE_FILE_NAME = /[^A-Za-z0-9._-]+/g;

function parseEngine(value: string | undefined): EngineName | undefined {
  if (value === undefined) return undefined;
  if (!(ENGINE_NAMES as readonly string[]).includes(value)) throw new PackageError('ENGINE_INVALID', value);
  return value as EngineName;
}

function defaultOut(folder: string, version: string): string {
  const name = path.basename(path.resolve(folder)).replace(SAFE_FILE_NAME, '-') || 'game';
  return path.resolve(`${name}-${version}.sbp`);
}

/** 설정 초안을 폴더에 쓴다(init 명령). 이름은 폴더 이름 */
export async function writeInitialConfig(folder: string, force: boolean): Promise<{ readonly target: string; readonly config: SuperboxConfig }> {
  const target = path.resolve(folder, CONFIG_FILE);
  if (!force && (await isFile(target))) throw new CliError('CONFIG_EXISTS', target);
  const config = initialConfig(path.basename(path.resolve(folder)));
  await writeFile(target, `${JSON.stringify(config, null, 2)}\n`);
  return { target, config };
}

export async function runInit(options: { readonly force: boolean }, io: CliIO): Promise<void> {
  const { target } = await writeInitialConfig('.', options.force);
  io.out(`${target} 를 만들었어요. 모든 항목은 선택 사항이에요.\n`);
}

/** 빌드 폴더 → .sbp(build 명령). 경고는 설정 파일 것까지 합친다 */
export async function buildPackage(options: {
  readonly folder: string;
  readonly values: CommandValues;
  readonly tool: { readonly name: string; readonly version: string };
}): Promise<PackageReport> {
  const { folder, values, tool } = options;
  const engine = parseEngine(values.engine);
  const resolved = await resolveConfig(folder, values.config);
  const report = await createPackage({
    folder,
    out: values.out ?? defaultOut(folder, resolved.config.version ?? '1.0.0'),
    config: resolved.config,
    configDir: resolved.configDir,
    ...(values.zone === undefined ? {} : { zoneOrigin: values.zone }),
    ...(engine === undefined ? {} : { engine }),
    ...(values['keep-maps'] ? { keepMaps: true } : {}),
    tool,
  });
  return { ...report, warnings: [...resolved.warnings, ...report.warnings] };
}

export async function runBuild(
  options: { readonly folder: string; readonly values: CommandValues; readonly tool: { readonly name: string; readonly version: string } },
  io: CliIO,
): Promise<void> {
  io.out(formatBuildReport(await buildPackage(options)));
}

/** 패키지 검증 · 요약(inspect 명령) */
export async function inspectPackage(file: string): Promise<{ readonly file: string; readonly manifest: PackageManifest; readonly packageBytes: number }> {
  const absolute = path.resolve(file);
  if (!(await isFile(absolute))) throw new CliError('FILE_NOT_FOUND', file);
  const opened = await verifyPackageFile(absolute);
  const { size } = await stat(absolute);
  return { file: absolute, manifest: opened.manifest, packageBytes: size };
}

export async function runInspect(file: string, io: CliIO): Promise<void> {
  io.out(formatInspectReport(await inspectPackage(file)));
}

export async function runDeploy(
  options: { readonly file: string | undefined; readonly values: DeployValues; readonly envKey: string | undefined },
  io: CliIO,
): Promise<void> {
  const { file, values, envKey } = options;
  const { game, channel, note } = values;
  if (!file || !game || !channel) throw new CliError('USAGE', 'deploy <파일> --game <게임 ID> --channel <채널 키>');
  const consoleOrigin = values.console ?? DEFAULT_CONSOLE_ORIGIN;
  assertConsoleOrigin(consoleOrigin);
  const apiKey = resolveApiKey(values['api-key'], envKey);
  const absolute = path.resolve(file);
  if (!(await isFile(absolute))) throw new CliError('FILE_NOT_FOUND', file);
  if (values['api-key'] !== undefined) io.err(`${API_KEY_FLAG} 값은 명령 기록에 남아요. 환경 변수 ${API_KEY_ENV} 를 쓰는 걸 권해요.\n`);
  const result = await deployPackage({ file: absolute, game, channel, note, consoleOrigin, apiKey, out: io.out });
  io.out(formatDeployReport({ ...result, channel }));
}

function parsePort(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new CliError('PORT_INVALID', value);
  return port;
}

/** 묶인 CLI 옆의 `v1.js`(scripts/build.mjs 가 복사한다). 원본으로 돌릴 때는 저장소의 빌드 결과. */
function playSdkPaths(): readonly string[] {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return [path.join(here, 'v1.js'), path.join(here, '../dist/v1.js')];
}

export async function runDev(options: { readonly folder: string; readonly values: CommandValues }, io: CliIO): Promise<void> {
  const { folder, values } = options;
  const engine = parseEngine(values.engine);
  const info = await stat(path.resolve(folder)).catch(() => null);
  if (!info?.isDirectory()) throw new PackageError('FOLDER_MISSING', folder);
  const explicitPort = parsePort(values.port);
  const server = await startDevServer({
    folder,
    host: values.host ?? '127.0.0.1',
    port: explicitPort ?? DEFAULT_DEV_PORT,
    fixedPort: explicitPort !== undefined,
    loadConfig: () => resolveConfig(folder, values.config),
    sdkPaths: playSdkPaths(),
    ...(values.zone === undefined ? {} : { zoneOrigin: values.zone }),
    ...(engine === undefined ? {} : { engine }),
    ...(values['keep-maps'] ? { keepMaps: true } : {}),
  });
  io.out(`dev 서버 ${server.url}\n`);
  io.out(values.zone ? `게임존 ${values.zone} 에 맞춰 주입했어요.\n` : '게임존 없이 혼자 실행돼요. 광고와 결제는 시뮬레이션이에요.\n');
  await new Promise<void>((resolve) => {
    const stop = (): void => {
      void server.close().then(resolve);
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });
}
