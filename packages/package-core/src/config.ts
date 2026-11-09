import { PackageError, type PackageWarning } from './errors.ts';
import { COLOR_PATTERN, VERSION_PATTERN } from './limits.ts';
import { ENGINE_NAMES, isSafeTitle, ORIENTATIONS, type EngineName, type LoadingMode, type Orientation } from './manifest.ts';
import { warning } from './warnings.ts';

/**
 * 설정 파일 `superbox.config.json` — package-format.md 3장. 모든 칸이 선택이다.
 * 틀린 값은 조용히 넘기지 않고 멈춘다(운영 빌드에 틀린 색이 들어가지 않게). 모르는 칸은 오타일 수 있어 경고만 낸다.
 */
export const CONFIG_FILE = 'superbox.config.json';

export interface SuperboxLoadingConfig {
  readonly backgroundColor?: string;
  readonly primaryColor?: string;
  readonly image?: string;
  readonly tips?: readonly string[];
  readonly html?: string;
}

export interface SuperboxRuntimeConfig {
  readonly earlyFetch?: boolean;
  readonly maxDevicePixelRatio?: number | 'auto';
  readonly watchdog?: boolean;
  readonly debugConsole?: boolean;
}

export interface SuperboxConfig {
  readonly version?: string;
  readonly title?: string;
  readonly orientation?: Orientation;
  readonly engine?: EngineName;
  readonly loading?: SuperboxLoadingConfig;
  readonly runtime?: SuperboxRuntimeConfig;
}

export interface ParsedConfig {
  readonly config: SuperboxConfig;
  readonly warnings: readonly PackageWarning[];
}

const MAX_TITLE_LENGTH = 100;
const MAX_TIPS = 10;
const MAX_TIP_LENGTH = 80;
const MAX_PATH_LENGTH = 255;
const MIN_PIXEL_RATIO = 0.5;
const MAX_PIXEL_RATIO = 4;

const TOP_KEYS = ['version', 'title', 'orientation', 'engine', 'loading', 'runtime'];
const LOADING_KEYS = ['backgroundColor', 'primaryColor', 'image', 'tips', 'html'];
const RUNTIME_KEYS = ['earlyFetch', 'maxDevicePixelRatio', 'watchdog', 'debugConsole'];

function invalid(field: string): PackageError {
  return new PackageError('CONFIG_INVALID', field);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unknownKeys(value: Record<string, unknown>, known: readonly string[], prefix: string): readonly PackageWarning[] {
  return Object.keys(value)
    .filter((key) => !known.includes(key) && !key.startsWith('$'))
    .map((key) => warning('CONFIG_UNKNOWN_KEY', `${prefix}${key}`));
}

function optionalString(value: unknown, field: string, maxLength: number): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) throw invalid(field);
  return value;
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') throw invalid(field);
  return value;
}

function optionalEnum<T extends string>(values: readonly T[], value: unknown, field: string): T | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !(values as readonly string[]).includes(value)) throw invalid(field);
  return value as T;
}

function optionalColor(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !COLOR_PATTERN.test(value)) throw invalid(field);
  return value;
}

function parseTips(value: unknown): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > MAX_TIPS) throw invalid('loading.tips');
  return value.map((tip, index) => {
    if (typeof tip !== 'string' || !tip.trim() || tip.length > MAX_TIP_LENGTH) throw invalid(`loading.tips[${index}]`);
    return tip;
  });
}

function parsePixelRatio(value: unknown): number | 'auto' | undefined {
  if (value === undefined || value === 'auto') return value;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < MIN_PIXEL_RATIO || value > MAX_PIXEL_RATIO) {
    throw invalid('runtime.maxDevicePixelRatio');
  }
  return value;
}

function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

export function parseConfig(raw: unknown): ParsedConfig {
  if (!isRecord(raw)) throw invalid('(root)');
  const loading = raw.loading;
  const runtime = raw.runtime;
  if (loading !== undefined && !isRecord(loading)) throw invalid('loading');
  if (runtime !== undefined && !isRecord(runtime)) throw invalid('runtime');

  const version = optionalString(raw.version, 'version', 32);
  if (version !== undefined && !VERSION_PATTERN.test(version)) throw invalid('version');

  const title = optionalString(raw.title, 'title', MAX_TITLE_LENGTH);
  if (title !== undefined && !isSafeTitle(title)) throw invalid('title');

  const config: SuperboxConfig = withoutUndefined({
    version,
    title,
    orientation: optionalEnum(ORIENTATIONS, raw.orientation, 'orientation'),
    engine: optionalEnum(ENGINE_NAMES, raw.engine, 'engine'),
    loading: loading
      ? withoutUndefined({
          backgroundColor: optionalColor(loading.backgroundColor, 'loading.backgroundColor'),
          primaryColor: optionalColor(loading.primaryColor, 'loading.primaryColor'),
          image: optionalString(loading.image, 'loading.image', MAX_PATH_LENGTH),
          tips: parseTips(loading.tips),
          html: optionalString(loading.html, 'loading.html', MAX_PATH_LENGTH),
        })
      : undefined,
    runtime: runtime
      ? withoutUndefined({
          earlyFetch: optionalBoolean(runtime.earlyFetch, 'runtime.earlyFetch'),
          maxDevicePixelRatio: parsePixelRatio(runtime.maxDevicePixelRatio),
          watchdog: optionalBoolean(runtime.watchdog, 'runtime.watchdog'),
          debugConsole: optionalBoolean(runtime.debugConsole, 'runtime.debugConsole'),
        })
      : undefined,
  });

  return {
    config,
    warnings: [
      ...unknownKeys(raw, TOP_KEYS, ''),
      ...(loading ? unknownKeys(loading, LOADING_KEYS, 'loading.') : []),
      ...(runtime ? unknownKeys(runtime, RUNTIME_KEYS, 'runtime.') : []),
    ],
  };
}

/** `html` 이 있으면 custom, 색 · 그림 · 팁 중 하나라도 있으면 theme, 없으면 default(3장). */
export function loadingModeOf(config: SuperboxConfig): LoadingMode {
  const loading = config.loading;
  if (loading?.html) return 'custom';
  if (loading?.backgroundColor || loading?.primaryColor || loading?.image || loading?.tips?.length) return 'theme';
  return 'default';
}

/** `superbox-play init` 이 쓰는 처음 값. */
export function initialConfig(title: string): SuperboxConfig {
  return {
    version: '1.0.0',
    title,
    orientation: 'auto',
    loading: { tips: [] },
    runtime: { earlyFetch: true, maxDevicePixelRatio: 'auto', watchdog: true, debugConsole: false },
  };
}
