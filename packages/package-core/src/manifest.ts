import { PackageError } from './errors.ts';
import {
  COLOR_PATTERN,
  FORMAT_VERSION,
  isAspectRatio,
  isSafeBuildPath,
  isZoneOrigin,
  MAX_BUILD_BYTES,
  MAX_BUILD_FILES,
  RESERVED_FILE,
  VERSION_PATTERN,
} from './limits.ts';

/**
 * manifest.json — 패키지 포맷 규격 2장. 서버와 콘솔은 manifest 를 믿지 않는다 —
 * 모든 칸을 길이 · 형식으로 보고, 값은 표시와 부가 검사에만 쓴다. 모르는 칸은 버린다(9장 — 칸을 더해도 format 은 그대로다).
 * 브라우저에서도 돈다 — Node API 를 쓰지 않는다(콘솔 웹이 가져다 쓴다).
 */
export const ENGINE_NAMES = ['unity', 'cocos', 'phaser', 'html5'] as const;
export type EngineName = (typeof ENGINE_NAMES)[number];

export const ORIENTATIONS = ['portrait', 'landscape', 'auto'] as const;
export type Orientation = (typeof ORIENTATIONS)[number];

export const LOADING_MODES = ['default', 'theme', 'custom'] as const;
export type LoadingMode = (typeof LOADING_MODES)[number];

export const FILE_ENCODINGS = ['br', 'gzip'] as const;
export type FileEncoding = (typeof FILE_ENCODINGS)[number] | null;

export interface ManifestFile {
  readonly path: string;
  readonly size: number;
  readonly sha256: string;
  readonly encoding: FileEncoding;
}

/** 게임이 받는 화면 비율 범위(가로 ÷ 세로, 2장) — 게임존이 게임 틀을 이 안에서 채운다. 없으면 null(무대 전부를 채운다) */
export interface AspectRange {
  readonly min: number;
  readonly max: number;
}

export interface PackageManifest {
  readonly format: 1;
  readonly version: string;
  readonly entry: string;
  readonly title: string | null;
  readonly orientation: Orientation;
  readonly aspectRange: AspectRange | null;
  readonly engine: { readonly name: EngineName; readonly version: string | null };
  readonly tool: { readonly name: string; readonly version: string };
  readonly zoneOrigin: string;
  readonly loading: { readonly mode: LoadingMode; readonly backgroundColor: string; readonly primaryColor: string };
  readonly createdAt: string;
  readonly totals: { readonly count: number; readonly bytes: number };
  readonly files: readonly ManifestFile[];
}

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
// 칸 범위는 서버(api build-package.rules)와 같다 — 여기서 지나간 패키지가 올리는 단계에서 거절되지 않게
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const ASCII_LINE = /^[\x20-\x7E]+$/;
// 제목은 사람이 쓴 글 — 제어 문자 · 줄 구분자 · 글 방향을 뒤집는 문자만 막는다(이모지의 ZWJ 는 지난다)
const UNSAFE_TITLE_CHARS = new RegExp('[\\p{Cc}\\p{Zl}\\p{Zp}\\u202A-\\u202E\\u2066-\\u2069]', 'u');
const MAX_TITLE_LENGTH = 100;
const MAX_LABEL_LENGTH = 64;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 엔진 · 도구의 이름과 버전 — 사람이 아니라 도구가 적는 값이라 인쇄 가능한 ASCII 한 줄만. */
export function isPackageLabel(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_LABEL_LENGTH && ASCII_LINE.test(value) && value.trim() !== '';
}

export function isSafeTitle(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_TITLE_LENGTH && value.trim() !== '' && !UNSAFE_TITLE_CHARS.test(value);
}

function invalid(field: string): PackageError {
  return new PackageError('MANIFEST_INVALID', field);
}

function pickEnum<T extends string>(values: readonly T[], value: unknown, field: string): T {
  if (typeof value !== 'string' || !(values as readonly string[]).includes(value)) throw invalid(field);
  return value as T;
}

function pickLabel(value: unknown, field: string): string {
  if (!isPackageLabel(value)) throw invalid(field);
  return value;
}

function pickNullableLabel(value: unknown, field: string): string | null {
  return value === null || value === undefined ? null : pickLabel(value, field);
}

function pickNullableTitle(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (!isSafeTitle(value)) throw invalid('title');
  return value;
}

function pickRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) throw invalid(field);
  return value;
}

function pickCount(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw invalid(field);
  return value;
}

function pickFile(raw: unknown, index: number): ManifestFile {
  const field = `files[${index}]`;
  const value = pickRecord(raw, field);
  const path = value.path;
  if (typeof path !== 'string' || !isSafeBuildPath(path)) throw new PackageError('PATH_UNSAFE', `${field}.path`);
  if (path === RESERVED_FILE) throw new PackageError('RESERVED_NAME', path);
  const sha256 = value.sha256;
  if (typeof sha256 !== 'string' || !SHA256_PATTERN.test(sha256)) throw invalid(`${field}.sha256`);
  const encoding = value.encoding ?? null;
  return {
    path,
    size: pickCount(value.size, `${field}.size`),
    sha256,
    encoding: encoding === null ? null : pickEnum(FILE_ENCODINGS, encoding, `${field}.encoding`),
  };
}

function pickFiles(raw: unknown): readonly ManifestFile[] {
  if (!Array.isArray(raw)) throw invalid('files');
  if (raw.length > MAX_BUILD_FILES) throw new PackageError('TOO_MANY_FILES', String(raw.length));
  const files = raw.map(pickFile);
  const seen = new Set<string>();
  for (const file of files) {
    if (seen.has(file.path)) throw new PackageError('DUPLICATE_PATH', file.path);
    seen.add(file.path);
  }
  return files;
}

function pickColor(value: unknown, field: string): string {
  if (typeof value !== 'string' || !COLOR_PATTERN.test(value)) throw invalid(field);
  return value;
}

/** 없으면 null — 이 칸 전에 만든 패키지도 그대로 읽힌다 */
function pickAspectRange(value: unknown): AspectRange | null {
  if (value === null || value === undefined) return null;
  const range = pickRecord(value, 'aspectRange');
  if (!isAspectRatio(range.min)) throw invalid('aspectRange.min');
  if (!isAspectRatio(range.max)) throw invalid('aspectRange.max');
  if (range.min > range.max) throw invalid('aspectRange');
  return { min: range.min, max: range.max };
}

/** 받은 JSON → 검증한 manifest. 틀리면 PackageError(칸 이름이 detail). */
export function parseManifest(raw: unknown): PackageManifest {
  const value = pickRecord(raw, 'manifest');
  if (value.format !== FORMAT_VERSION) {
    if (typeof value.format === 'number') throw new PackageError('FORMAT_UNSUPPORTED', String(value.format));
    throw invalid('format');
  }
  const version = value.version;
  if (typeof version !== 'string' || !VERSION_PATTERN.test(version)) throw invalid('version');
  const entry = value.entry;
  if (typeof entry !== 'string' || !isSafeBuildPath(entry)) throw new PackageError('PATH_UNSAFE', 'entry');
  if (!isZoneOrigin(value.zoneOrigin)) throw invalid('zoneOrigin');
  const createdAt = value.createdAt;
  if (typeof createdAt !== 'string' || !ISO_INSTANT.test(createdAt) || Number.isNaN(Date.parse(createdAt))) throw invalid('createdAt');

  const engine = pickRecord(value.engine, 'engine');
  const tool = pickRecord(value.tool, 'tool');
  const loading = pickRecord(value.loading, 'loading');
  const totals = pickRecord(value.totals, 'totals');
  const files = pickFiles(value.files);

  const manifest: PackageManifest = {
    format: FORMAT_VERSION,
    version,
    entry,
    title: pickNullableTitle(value.title),
    orientation: pickEnum(ORIENTATIONS, value.orientation, 'orientation'),
    aspectRange: pickAspectRange(value.aspectRange),
    engine: {
      name: pickEnum(ENGINE_NAMES, engine.name, 'engine.name'),
      version: pickNullableLabel(engine.version, 'engine.version'),
    },
    tool: {
      name: pickLabel(tool.name, 'tool.name'),
      version: pickLabel(tool.version, 'tool.version'),
    },
    zoneOrigin: value.zoneOrigin,
    loading: {
      mode: pickEnum(LOADING_MODES, loading.mode, 'loading.mode'),
      backgroundColor: pickColor(loading.backgroundColor, 'loading.backgroundColor'),
      primaryColor: pickColor(loading.primaryColor, 'loading.primaryColor'),
    },
    createdAt,
    totals: { count: pickCount(totals.count, 'totals.count'), bytes: pickCount(totals.bytes, 'totals.bytes') },
    files,
  };

  const bytes = files.reduce((sum, file) => sum + file.size, 0);
  if (bytes > MAX_BUILD_BYTES) throw new PackageError('TOO_LARGE', String(bytes));
  if (manifest.totals.count !== files.length || manifest.totals.bytes !== bytes) throw invalid('totals');
  if (!files.some((file) => file.path === entry)) throw new PackageError('ENTRY_MISSING', entry);
  return manifest;
}
