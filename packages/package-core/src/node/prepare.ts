import { open, readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadingModeOf, type SuperboxConfig } from '../config.ts';
import { earlyFetchList } from '../early-fetch.ts';
import { detectEngine, type EngineGuess } from '../engine.ts';
import { PackageError, type PackageWarning } from '../errors.ts';
import { DEBUG_CONSOLE_PATH, injectEntry, type BootConfig, type RuntimeAssets } from '../inject.ts';
import {
  DEFAULT_BACKGROUND_COLOR,
  DEFAULT_ENTRY,
  DEFAULT_PRIMARY_COLOR,
  isLocalZoneOrigin,
  isReservedBuildPath,
  isSafeBuildPath,
  isZoneOrigin,
  MAX_BUILD_BYTES,
  MAX_BUILD_FILES,
  PACKAGING_DIR,
} from '../limits.ts';
import { isPackageLabel, type EngineName, type LoadingMode, type Orientation } from '../manifest.ts';
import { warning } from '../warnings.ts';
import { readUnityVersion } from './unity-version.ts';
import { walkBuildFolder, type BuildFileEntry } from './walk.ts';

/**
 * 패키지와 dev 서버가 같이 쓰는 준비 단계 — 폴더를 걷고 엔진을 판별하고 입구를 주입한다.
 * dev 가 올리는 화면과 패키지 안 화면이 어긋나지 않게 한 곳에 둔다.
 */
export interface PrepareOptions {
  readonly folder: string;
  readonly config: SuperboxConfig;
  /** 설정 파일이 있는 폴더 — loading.image · loading.html 경로의 기준(3장). */
  readonly configDir: string;
  readonly zoneOrigin: string;
  /** dev 서버 전용 — 패키지가 아니므로 http 출처(LAN 주소)도 받는다. */
  readonly allowAnyZone?: boolean;
  /** `--engine` — 설정과 판별보다 앞선다. */
  readonly engine?: EngineName;
  readonly keepMaps?: boolean;
  readonly ignore?: readonly string[];
  readonly runtime: RuntimeAssets & { readonly debugConsoleJs: string };
}

export type PreparedSource =
  | { readonly kind: 'file'; readonly path: string }
  | { readonly kind: 'bytes'; readonly bytes: Uint8Array };

export interface PreparedFile {
  readonly path: string;
  readonly source: PreparedSource;
}

export interface PreparedBuild {
  readonly engine: EngineGuess;
  readonly entry: string;
  readonly title: string | null;
  readonly version: string;
  readonly orientation: Orientation;
  readonly loading: { readonly mode: LoadingMode; readonly backgroundColor: string; readonly primaryColor: string };
  /** 입구는 주입이 끝난 내용, `sbp/` 는 패키징이 더한 파일. 경로 차례. */
  readonly files: readonly PreparedFile[];
  readonly warnings: readonly PackageWarning[];
}

const DEFAULT_VERSION = '1.0.0';
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg']);
const UNRESOLVED_TEMPLATE = /%(?:UNITY|AIT)_[A-Z_]+%/;
const OTHER_PLATFORM_TEMPLATE = /window\.AITLoading\b|window\.AppsInToss\b|__AIT_/;
const LOADING_DOCUMENT_TAGS = /<(?:html|head|body)[\s>]/i;

export function assertZoneOrigin(zoneOrigin: string): void {
  if (!isZoneOrigin(zoneOrigin) || (zoneOrigin.startsWith('http:') && !isLocalZoneOrigin(zoneOrigin))) {
    throw new PackageError('ZONE_INVALID', zoneOrigin);
  }
}

function assertFileRules(files: readonly BuildFileEntry[]): void {
  const unsafe = files.filter((file) => !isSafeBuildPath(file.path));
  if (unsafe.length) throw new PackageError('PATH_UNSAFE', unsafe.slice(0, 5).map((file) => file.path).join(', '));
  const reserved = files.find((file) => isReservedBuildPath(file.path));
  if (reserved) throw new PackageError('RESERVED_NAME', reserved.path);
  if (files.length > MAX_BUILD_FILES) throw new PackageError('TOO_MANY_FILES', String(files.length));
  const bytes = files.reduce((sum, file) => sum + file.size, 0);
  if (bytes > MAX_BUILD_BYTES) throw new PackageError('TOO_LARGE', String(bytes));
}

async function readTextHead(file: BuildFileEntry, maxBytes: number): Promise<string> {
  const handle = await open(file.absolute, 'r');
  try {
    const buffer = new Uint8Array(Math.min(maxBytes, file.size));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return Buffer.from(buffer.subarray(0, bytesRead)).toString('latin1');
  } finally {
    await handle.close();
  }
}

async function resolveEngine(files: readonly BuildFileEntry[], html: string, options: PrepareOptions): Promise<EngineGuess> {
  const byPath = new Map(files.map((file) => [file.path, file] as const));
  const guess = await detectEngine({
    files,
    entryHtml: html,
    readText: async (filePath, maxBytes) => {
      const file = byPath.get(filePath);
      return file ? readTextHead(file, maxBytes) : null;
    },
    readUnityVersion: () => readUnityVersion(files),
  });
  const forced = options.engine ?? options.config.engine;
  if (forced && forced !== guess.name) return { name: forced, version: null };
  // 판별한 값은 게임 파일에서 읽은 글자다 — manifest 칸(ASCII 한 줄)에 맞지 않으면 모르는 것으로 둔다. 패키징을 막을 까닭은 아니다
  return isPackageLabel(guess.version) ? guess : { name: guess.name, version: null };
}

interface LoadingAssets {
  readonly iconUrl: string | null;
  readonly customHtml: string | null;
  readonly extras: readonly PreparedFile[];
  readonly warnings: readonly PackageWarning[];
}

async function readLoadingAsset(configDir: string, relative: string): Promise<Uint8Array> {
  const absolute = path.resolve(configDir, relative);
  try {
    return await readFile(absolute);
  } catch {
    throw new PackageError('LOADING_ASSET_MISSING', relative);
  }
}

/** 설정 파일 기준 경로의 그림 · HTML 을 `sbp/` 로 복사한다 — 이름은 정해 둔다(빌드 경로 규칙 밖 글자가 있어도 되게). */
async function collectLoadingAssets(options: PrepareOptions): Promise<LoadingAssets> {
  const loading = options.config.loading;
  const extras: PreparedFile[] = [];
  const warnings: PackageWarning[] = [];
  let iconUrl: string | null = null;
  let customHtml: string | null = null;
  if (loading?.image) {
    const extension = path.extname(loading.image).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(extension)) throw new PackageError('LOADING_ASSET_INVALID', loading.image);
    iconUrl = `${PACKAGING_DIR}loading-image${extension}`;
    extras.push({ path: iconUrl, source: { kind: 'bytes', bytes: await readLoadingAsset(options.configDir, loading.image) } });
  }
  if (loading?.html) {
    const bytes = await readLoadingAsset(options.configDir, loading.html);
    customHtml = Buffer.from(bytes).toString('utf8');
    if (LOADING_DOCUMENT_TAGS.test(customHtml)) warnings.push(warning('LOADING_HTML_DOCUMENT'));
    extras.push({ path: `${PACKAGING_DIR}loading.html`, source: { kind: 'bytes', bytes } });
  }
  return { iconUrl, customHtml, extras, warnings };
}

export async function prepareBuild(options: PrepareOptions): Promise<PreparedBuild> {
  if (!options.allowAnyZone) assertZoneOrigin(options.zoneOrigin);
  const walked = await walkBuildFolder(options.folder, {
    ...(options.keepMaps === undefined ? {} : { keepMaps: options.keepMaps }),
    ...(options.ignore === undefined ? {} : { ignore: options.ignore }),
  });
  const entryFile = walked.find((file) => file.path === DEFAULT_ENTRY);
  if (!entryFile) {
    assertFileRules(walked);
    throw new PackageError('ENTRY_MISSING', DEFAULT_ENTRY);
  }
  const html = await readFile(entryFile.absolute, 'utf8');
  // 경로 규칙보다 먼저 — 플랫폼 전용 템플릿 폴더는 설정 폴더 이름(`BuildConfig~`)에 먼저 걸려 까닭을 알 수 없게 된다
  if (UNRESOLVED_TEMPLATE.test(html)) throw new PackageError('TEMPLATE_UNRESOLVED', UNRESOLVED_TEMPLATE.exec(html)?.[0]);
  assertFileRules(walked);

  const engine = await resolveEngine(walked, html, options);
  const assets = await collectLoadingAssets(options);
  const { config } = options;
  const runtimeConfig = config.runtime ?? {};
  const debugConsole = runtimeConfig.debugConsole ?? false;
  const loading = {
    mode: loadingModeOf(config),
    backgroundColor: config.loading?.backgroundColor ?? DEFAULT_BACKGROUND_COLOR,
    primaryColor: config.loading?.primaryColor ?? DEFAULT_PRIMARY_COLOR,
  };
  const boot: BootConfig = {
    zoneOrigin: options.zoneOrigin,
    engine: engine.name,
    mode: loading.mode,
    title: config.title ?? null,
    iconUrl: assets.iconUrl,
    primaryColor: loading.primaryColor,
    backgroundColor: loading.backgroundColor,
    tips: config.loading?.tips ?? [],
    earlyFetch: runtimeConfig.earlyFetch === false ? [] : earlyFetchList(engine.name, walked, html),
    maxDevicePixelRatio: runtimeConfig.maxDevicePixelRatio ?? 'auto',
    watchdog: runtimeConfig.watchdog ?? true,
  };
  const injected = injectEntry({ html, boot, customLoadingHtml: assets.customHtml, debugConsole, runtime: options.runtime });

  const packagingFiles: readonly PreparedFile[] = debugConsole
    ? [...assets.extras, { path: DEBUG_CONSOLE_PATH, source: { kind: 'bytes', bytes: new TextEncoder().encode(options.runtime.debugConsoleJs) } }]
    : assets.extras;
  const gameFiles: readonly PreparedFile[] = walked.map((file) =>
    file.path === DEFAULT_ENTRY
      ? { path: file.path, source: { kind: 'bytes', bytes: new TextEncoder().encode(injected.html) } }
      : { path: file.path, source: { kind: 'file', path: file.absolute } },
  );

  const warnings: PackageWarning[] = [
    ...injected.warnings,
    ...assets.warnings,
    ...(config.version ? [] : [warning('VERSION_DEFAULTED')]),
    ...(config.title ? [] : [warning('TITLE_MISSING')]),
    ...(isLocalZoneOrigin(options.zoneOrigin) ? [warning('LOCAL_ZONE')] : []),
    ...(debugConsole ? [warning('DEBUG_CONSOLE_ON')] : []),
    ...(OTHER_PLATFORM_TEMPLATE.test(html) ? [warning('OTHER_PLATFORM_TEMPLATE')] : []),
  ];

  return {
    engine,
    entry: DEFAULT_ENTRY,
    title: config.title ?? null,
    version: config.version ?? DEFAULT_VERSION,
    orientation: config.orientation ?? 'auto',
    loading,
    files: [...gameFiles, ...packagingFiles].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
    warnings,
  };
}
