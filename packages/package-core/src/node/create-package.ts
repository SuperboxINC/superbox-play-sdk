import { mkdir, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { CONFIG_FILE, parseConfig, type SuperboxConfig } from '../config.ts';
import { detectEncoding } from '../encoding.ts';
import { PackageError, type PackageWarning } from '../errors.ts';
import { FORMAT_VERSION, MANIFEST_ENTRY, MAX_BUILD_BYTES, MAX_BUILD_FILES, PRODUCTION_ZONE_ORIGIN, WEB_PREFIX } from '../limits.ts';
import { parseManifest, type EngineName, type ManifestFile, type PackageManifest } from '../manifest.ts';
import { readPackage } from '../reader.ts';
import { BOOT_JS, DEBUG_CONSOLE_JS, LOADING_TEMPLATE } from '../runtime-assets.generated.ts';
import { warning } from '../warnings.ts';
import { toDosDateTime } from '../zip-format.ts';
import { openFileBlob } from './file-blob.ts';
import { digestBytes, digestFile, type FileDigest } from './hash-file.ts';
import { prepareBuild, type PreparedFile } from './prepare.ts';
import { writeStoredZip, type ZipEntryInput } from './zip-writer.ts';

/**
 * 빌드 폴더 → `.sbp` — CLI `build` 와 Cocos 확장이 부른다. 임시 파일에 쓰고 스스로 읽어 본 뒤에 이름을 바꾼다:
 * 만든 파일이 읽는 쪽 거절 규칙에 걸리면 올리기 전에 여기서 멈춘다.
 */
export const BUNDLED_RUNTIME = { bootJs: BOOT_JS, loadingTemplate: LOADING_TEMPLATE, debugConsoleJs: DEBUG_CONSOLE_JS } as const;

export interface CreatePackageOptions {
  readonly folder: string;
  readonly out: string;
  readonly config?: SuperboxConfig;
  readonly configDir?: string;
  readonly zoneOrigin?: string;
  readonly engine?: EngineName;
  readonly keepMaps?: boolean;
  readonly tool: { readonly name: string; readonly version: string };
  readonly now?: Date;
}

export interface PackageReport {
  readonly manifest: PackageManifest;
  readonly outPath: string;
  readonly packageBytes: number;
  /** 큰 파일부터 10개. */
  readonly largest: readonly ManifestFile[];
  readonly warnings: readonly PackageWarning[];
}

const LARGEST_COUNT = 10;
const LARGE_UNCOMPRESSED_BYTES = 5 * 1024 * 1024;
const COMPRESSIBLE = /\.(wasm|data|js|json)$/i;
const SYMBOLS_FILE = /\.symbols\.json(\.(br|gz|unityweb))?$/;

/** 설정 파일을 찾는다 — 빌드 폴더에 있어도 되지만 패키지에는 넣지 않는다(walk 가 뺀다). */
export async function loadConfigFile(configPath: string): Promise<{ readonly config: SuperboxConfig; readonly warnings: readonly PackageWarning[] }> {
  let text: string;
  try {
    text = await readFile(configPath, 'utf8');
  } catch {
    throw new PackageError('CONFIG_INVALID', `${configPath}를 읽을 수 없어요`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new PackageError('CONFIG_INVALID', `${CONFIG_FILE} JSON`);
  }
  return parseConfig(raw);
}

async function digestPrepared(file: PreparedFile): Promise<FileDigest> {
  return file.source.kind === 'bytes' ? digestBytes(file.source.bytes) : digestFile(file.source.path);
}

function postWarnings(files: readonly ManifestFile[]): readonly PackageWarning[] {
  const warnings: PackageWarning[] = [];
  const symbols = files.find((file) => SYMBOLS_FILE.test(file.path));
  if (symbols) warnings.push(warning('SYMBOLS_INCLUDED', symbols.path));
  const large = files.find((file) => file.encoding === null && file.size >= LARGE_UNCOMPRESSED_BYTES && COMPRESSIBLE.test(file.path));
  if (large) warnings.push(warning('UNCOMPRESSED_LARGE', large.path));
  return warnings;
}

export async function createPackage(options: CreatePackageOptions): Promise<PackageReport> {
  const now = options.now ?? new Date();
  const outPath = path.resolve(options.out);
  const zoneOrigin = options.zoneOrigin ?? PRODUCTION_ZONE_ORIGIN;
  const prepared = await prepareBuild({
    folder: options.folder,
    config: options.config ?? {},
    configDir: options.configDir ?? process.cwd(),
    zoneOrigin,
    ...(options.engine === undefined ? {} : { engine: options.engine }),
    ...(options.keepMaps === undefined ? {} : { keepMaps: options.keepMaps }),
    ignore: [outPath],
    runtime: BUNDLED_RUNTIME,
  });

  const digests = new Map<string, FileDigest>();
  for (const file of prepared.files) digests.set(file.path, await digestPrepared(file));

  const files: readonly ManifestFile[] = prepared.files.map((file) => {
    const digest = digests.get(file.path) as FileDigest;
    return { path: file.path, size: digest.size, sha256: digest.sha256, encoding: detectEncoding(file.path, digest.head) };
  });
  if (files.length > MAX_BUILD_FILES) throw new PackageError('TOO_MANY_FILES', String(files.length));
  const bytes = files.reduce((sum, file) => sum + file.size, 0);
  if (bytes > MAX_BUILD_BYTES) throw new PackageError('TOO_LARGE', String(bytes));

  const manifest = parseManifest({
    format: FORMAT_VERSION,
    version: prepared.version,
    entry: prepared.entry,
    title: prepared.title,
    orientation: prepared.orientation,
    aspectRange: prepared.aspectRange,
    engine: prepared.engine,
    tool: options.tool,
    zoneOrigin,
    loading: prepared.loading,
    createdAt: now.toISOString(),
    totals: { count: files.length, bytes },
    files,
  } satisfies PackageManifest);

  const manifestBytes = new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`);
  const entries: readonly ZipEntryInput[] = [
    { name: MANIFEST_ENTRY, size: manifestBytes.length, crc32: digestBytes(manifestBytes).crc32, source: { kind: 'bytes', bytes: manifestBytes } },
    ...prepared.files.map((file): ZipEntryInput => {
      const digest = digests.get(file.path) as FileDigest;
      return { name: `${WEB_PREFIX}${file.path}`, size: digest.size, crc32: digest.crc32, source: file.source };
    }),
  ];

  await mkdir(path.dirname(outPath), { recursive: true });
  const temporary = `${outPath}.${process.pid}.tmp`;
  try {
    const packageBytes = await writeStoredZip(temporary, entries, toDosDateTime(now));
    const blob = await openFileBlob(temporary);
    try {
      await readPackage(blob);
    } finally {
      await blob.close();
    }
    await rename(temporary, outPath);
    return {
      manifest,
      outPath,
      packageBytes,
      largest: [...files].sort((a, b) => b.size - a.size).slice(0, LARGEST_COUNT),
      warnings: [...prepared.warnings, ...postWarnings(files)],
    };
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}
