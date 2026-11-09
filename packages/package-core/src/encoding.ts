import type { FileEncoding } from './manifest.ts';

/**
 * 파일 인코딩 판별 — package-format.md 2장. 서버는 이 값으로 Content-Encoding 을 서명한다.
 * 확장자만 보면 Unity 6 의 `.unityweb` 가 압축 머리 없이 나가 로더가 JS 로 풀어야 한다(느리다) — 그래서 파일 머리까지 본다.
 * 브라우저에서도 돈다.
 */
export const ENCODING_HEAD_BYTES = 64;

const UNITY_MARK = /UnityWeb Compressed Content \((brotli|gzip)\)/;

function isGzip(head: Uint8Array): boolean {
  return head[0] === 0x1f && head[1] === 0x8b;
}

function latin1(bytes: Uint8Array): string {
  let text = '';
  for (let i = 0; i < bytes.length; i += 1) text += String.fromCharCode(bytes[i] as number);
  return text;
}

export function detectEncoding(path: string, head: Uint8Array): FileEncoding {
  const lower = path.toLowerCase();
  if (lower.endsWith('.br')) return 'br';
  if (lower.endsWith('.gz')) return isGzip(head) ? 'gzip' : null;
  if (!lower.endsWith('.unityweb')) return null;
  const mark = UNITY_MARK.exec(latin1(head.subarray(0, ENCODING_HEAD_BYTES)));
  if (mark) return mark[1] === 'brotli' ? 'br' : 'gzip';
  return isGzip(head) ? 'gzip' : null;
}
