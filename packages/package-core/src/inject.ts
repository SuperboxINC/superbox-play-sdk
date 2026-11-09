import { PackageError, type PackageWarning } from './errors.ts';
import { attrValue, scanTags, type HtmlTag } from './html-scan.ts';
import { INJECTION_MARK, PACKAGING_DIR } from './limits.ts';
import type { EngineName, LoadingMode } from './manifest.ts';
import { warning } from './warnings.ts';

/**
 * 입구 주입 — package-format.md 4장. 원본을 파싱해 다시 쓰지 않고 정한 자리에 끼워 넣는다(게임 문서를 망가뜨리지 않게).
 * 게임 값이 문서로 들어가는 곳은 셋이다 — JSON(스크립트 안) · 글자(HTML) · 색(스타일). 모두 여기서 이스케이프하거나 형식을 본다.
 */
export const SDK_PATH = '/sdk/play/v1.js';
export const DEBUG_CONSOLE_PATH = `${PACKAGING_DIR}debug-console.js`;
export const DEFAULT_VIEWPORT = 'width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no';

/** 부트 스크립트가 읽는 설정 — `window.SBPlayBoot.config`. */
export interface BootConfig {
  readonly zoneOrigin: string;
  readonly engine: EngineName;
  readonly mode: LoadingMode;
  readonly title: string | null;
  readonly iconUrl: string | null;
  readonly primaryColor: string;
  readonly backgroundColor: string;
  readonly tips: readonly string[];
  readonly earlyFetch: readonly string[];
  readonly maxDevicePixelRatio: number | 'auto';
  readonly watchdog: boolean;
}

/** 부트 런타임이 빌드되어 문자열로 들어온 것(packages/runtime). */
export interface RuntimeAssets {
  readonly bootJs: string;
  readonly loadingTemplate: string;
}

export interface InjectInput {
  readonly html: string;
  readonly boot: BootConfig;
  /** loading.html 전체 — custom 일 때만. */
  readonly customLoadingHtml: string | null;
  readonly debugConsole: boolean;
  readonly runtime: RuntimeAssets;
}

export interface InjectOutput {
  readonly html: string;
  readonly warnings: readonly PackageWarning[];
}

interface Edit {
  readonly at: number;
  readonly remove: number;
  readonly text: string;
}

const HTML_ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] as string);
}

/**
 * `<script>` 안에 넣을 JSON — 값에 `</script>` · `<!--` 가 있으면 문서가 끊긴다. U+2028 · U+2029 는 옛 JS 엔진에서 문자열을 끊는다.
 * `<` 를 모두 이스케이프하면 앞의 둘이 막힌다.
 */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .split(LINE_SEPARATOR)
    .join('\\u2028')
    .split(PARAGRAPH_SEPARATOR)
    .join('\\u2029');
}

/** 빌드된 스크립트를 그대로 인라인해도 되는지 — 문서를 끊는 글자가 없어야 한다. */
export function isInlineSafe(script: string): boolean {
  return !/<\/script|<!--/i.test(script);
}

function hexToGlow(color: string): string {
  const value = Number.parseInt(color.slice(1), 16);
  return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},.24)`;
}

function firstGrapheme(text: string): string {
  return Array.from(text.trim())[0] ?? '';
}

/** 기본 · 테마 로딩 화면. 값은 모두 이스케이프하고 색은 설정 검증(#RRGGBB)을 지난 것만 온다. */
export function renderLoadingHtml(template: string, boot: BootConfig): string {
  const vars = `--sbp-bg:${boot.backgroundColor};--sbp-primary:${boot.primaryColor};--sbp-glow:${hexToGlow(boot.primaryColor)}`;
  const icon = boot.iconUrl ? `<img src="${escapeHtml(boot.iconUrl)}" alt="">` : '';
  const letter = firstGrapheme(boot.title ?? '');
  const values: Readonly<Record<string, string>> = {
    '%%MODE%%': boot.mode,
    '%%VARS%%': vars,
    '%%LETTER%%': escapeHtml(letter),
    '%%ICON%%': icon,
    '%%ICONATTR%%': icon || letter ? '' : ' hidden',
    '%%TITLE%%': escapeHtml(boot.title ?? ''),
    '%%TIP%%': escapeHtml(boot.tips[0] ?? ''),
  };
  return template.replace(/%%[A-Z]+%%/g, (token) => values[token] ?? '');
}

function renderCustomLoading(customHtml: string, boot: BootConfig): string {
  const style = `position:fixed;top:0;right:0;bottom:0;left:0;z-index:2147483000;background:${boot.backgroundColor};transition:opacity .3s`;
  return `<div id="sbp-loading" data-mode="custom" style="${style}">${customHtml}</div>`;
}

function renderBootScript(boot: BootConfig, bootJs: string): string {
  return `<script>window.SBPlayBoot={config:${jsonForScript(boot)}};${bootJs}</script>`;
}

function assertUtf8(tags: readonly HtmlTag[]): void {
  for (const tag of tags) {
    if (tag.name !== 'meta' || tag.closing) continue;
    const charset = attrValue(tag, 'charset') ?? /charset=([^;\s]+)/i.exec(attrValue(tag, 'content') ?? '')?.[1];
    if (charset && !/^utf-?8$/i.test(charset)) throw new PackageError('ENTRY_NOT_UTF8', charset);
  }
}

function viewportEdit(tags: readonly HtmlTag[]): { readonly meta: string; readonly warnings: readonly PackageWarning[] } {
  const viewport = tags.find((tag) => tag.name === 'meta' && !tag.closing && attrValue(tag, 'name')?.toLowerCase() === 'viewport');
  if (!viewport) return { meta: `<meta name="viewport" content="${DEFAULT_VIEWPORT}">`, warnings: [] };
  const content = (attrValue(viewport, 'content') ?? '').toLowerCase().replace(/\s/g, '');
  const complete = content.includes('viewport-fit=cover') && content.includes('user-scalable=no');
  return { meta: '', warnings: complete ? [] : [warning('VIEWPORT_KEPT', content)] };
}

/** `<head>` 맨 앞 — 엔진 로더 · 게임 코드보다 먼저 돌아야 한다. head 가 없거나 스크립트가 더 앞이면 그 앞에 넣는다. */
function headInsertAt(html: string, tags: readonly HtmlTag[]): number {
  const firstScript = tags.find((tag) => tag.name === 'script' && !tag.closing && !tag.inert);
  const head = tags.find((tag) => tag.name === 'head' && !tag.closing);
  const limit = firstScript ? firstScript.start : html.length;
  if (head && head.end <= limit) return head.end;
  const root = tags.find((tag) => tag.name === 'html' && !tag.closing);
  if (root && root.end <= limit) return root.end;
  const firstTag = tags[0];
  return firstTag ? Math.min(firstTag.start, limit) : 0;
}

const HEAD_ONLY = new Set(['html', 'head', 'meta', 'title', 'link', 'style', 'script', 'base', 'noscript', 'template']);

/** `<body>` 맨 앞. 태그가 없으면 몸이 시작하는 자리 — 파서가 그 자리에서 body 를 연다. */
function bodyInsertAt(html: string, tags: readonly HtmlTag[]): number {
  const body = tags.find((tag) => tag.name === 'body' && !tag.closing);
  if (body) return body.end;
  const headClose = tags.find((tag) => tag.name === 'head' && tag.closing);
  if (headClose) return headClose.end;
  const firstBodyTag = tags.find((tag) => !tag.closing && !tag.inert && !HEAD_ONLY.has(tag.name));
  return firstBodyTag ? firstBodyTag.start : html.length;
}

function isSdkScript(tag: HtmlTag): boolean {
  if (tag.name !== 'script' || tag.closing) return false;
  return /(^|\/)sdk\/play\/v1\.js([?#]|$)/.test(attrValue(tag, 'src') ?? '');
}

/** 이미 v1.js 태그가 있으면 출처만 맞춰 그 자리를 쓴다. 없으면 첫 `<script>` 앞. */
function sdkEdit(html: string, tags: readonly HtmlTag[], zoneOrigin: string): { readonly edit: Edit; readonly warnings: readonly PackageWarning[] } {
  const sdkUrl = `${zoneOrigin}${SDK_PATH}`;
  const existing = tags.find((tag) => isSdkScript(tag) && !tag.inert);
  if (existing) {
    const src = existing.attrs.find((attr) => attr.name === 'src');
    if (src && src.valueStart >= 0) {
      const late = existing.attrs.some((attr) => attr.name === 'async' || attr.name === 'defer');
      return {
        edit: { at: src.valueStart, remove: src.valueEnd - src.valueStart, text: escapeHtml(sdkUrl) },
        warnings: late ? [warning('SDK_TAG_DEFERRED')] : [],
      };
    }
  }
  const tag = `<script src="${escapeHtml(sdkUrl)}"></script>`;
  const firstScript = tags.find((candidate) => candidate.name === 'script' && !candidate.closing && !candidate.inert);
  if (firstScript) return { edit: { at: firstScript.start, remove: 0, text: tag }, warnings: [] };
  const bodyClose = tags.find((candidate) => candidate.name === 'body' && candidate.closing);
  return { edit: { at: bodyClose ? bodyClose.start : html.length, remove: 0, text: tag }, warnings: [] };
}

function applyEdits(html: string, edits: readonly Edit[]): string {
  // 같은 자리면 넣은 차례를 지킨다 — 부트가 언제나 먼저다
  const ordered = edits.map((edit, index) => ({ edit, index })).sort((a, b) => a.edit.at - b.edit.at || a.index - b.index);
  let out = '';
  let cursor = 0;
  for (const { edit } of ordered) {
    out += html.slice(cursor, edit.at) + edit.text;
    cursor = edit.at + edit.remove;
  }
  return out + html.slice(cursor);
}

export function injectEntry(input: InjectInput): InjectOutput {
  const { html, boot, runtime } = input;
  if (html.includes(INJECTION_MARK)) throw new PackageError('ALREADY_INJECTED');
  if (!isInlineSafe(runtime.bootJs)) throw new PackageError('RUNTIME_MISSING', 'boot script is not inline safe');

  const tags = scanTags(html);
  assertUtf8(tags);

  const viewport = viewportEdit(tags);
  const sdk = sdkEdit(html, tags, boot.zoneOrigin);
  // <meta charset> 는 문서 앞 1024바이트 안에 있어야 한다 — 부트가 원본의 것을 뒤로 밀어내므로 앞에 하나 더 둔다
  const debugTag = input.debugConsole ? `<script src="${DEBUG_CONSOLE_PATH}"></script>` : '';
  const head = `${INJECTION_MARK}<meta charset="utf-8">${viewport.meta}${renderBootScript(boot, runtime.bootJs)}${debugTag}`;
  const loading = input.customLoadingHtml === null ? renderLoadingHtml(runtime.loadingTemplate, boot) : renderCustomLoading(input.customLoadingHtml, boot);
  const body = `${loading}<script>try{SBPlayBoot.shell()}catch(e){}</script>`;

  return {
    html: applyEdits(html, [
      { at: headInsertAt(html, tags), remove: 0, text: head },
      { at: bodyInsertAt(html, tags), remove: 0, text: body },
      sdk.edit,
    ]),
    warnings: [...viewport.warnings, ...sdk.warnings],
  };
}
