import type { FileEncoding } from './manifest.ts';

/**
 * 경로 → Content-Type — api `catalog.rules.ts` 의 표와 같다. 인코딩이 있으면 그 앞 확장자로 정한다
 * (`x.wasm.unityweb` → application/wasm — instantiateStreaming 이 형식을 본다). 브라우저에서도 돈다.
 */
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  js: 'application/javascript',
  mjs: 'application/javascript',
  css: 'text/css',
  json: 'application/json',
  wasm: 'application/wasm',
  data: 'application/octet-stream',
  unityweb: 'application/octet-stream',
  bin: 'application/octet-stream',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  mp4: 'video/mp4',
  webm: 'video/webm',
  txt: 'text/plain; charset=utf-8',
  xml: 'application/xml',
  ttf: 'font/ttf',
  otf: 'font/otf',
  woff: 'font/woff',
  woff2: 'font/woff2',
};

const DEFAULT_TYPE = 'application/octet-stream';

export function contentTypeFor(path: string, encoding: FileEncoding): string {
  const parts = (path.toLowerCase().split('/').pop() ?? '').split('.');
  const last = parts.length > 1 ? parts[parts.length - 1] : '';
  const extension = (encoding ? parts[parts.length - 2] : last) ?? '';
  // `x.constructor` 같은 확장자가 Object 의 이름을 집지 않게
  return Object.hasOwn(CONTENT_TYPES, extension) ? (CONTENT_TYPES[extension] as string) : DEFAULT_TYPE;
}
