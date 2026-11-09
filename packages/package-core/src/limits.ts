/**
 * 패키지 규칙 상수 — 패키지 포맷 규격 1장. 경로 · 개수 · 크기는 콘솔과 서버의 빌드 규칙과 같아야 한다(서버가 마지막에 다시 본다).
 * 브라우저에서도 돈다 — Node API 를 쓰지 않는다.
 */
export const MAX_BUILD_FILES = 2000;
export const MAX_BUILD_BYTES = 500 * 1024 * 1024;
export const MAX_PATH_LENGTH = 255;
/** 파일 2,000개 × 줄 하나 400바이트 남짓 — 넉넉히 잡아도 2MB 를 넘지 않는다. */
export const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;

export const MANIFEST_ENTRY = 'manifest.json';
export const WEB_PREFIX = 'web/';
/** 올리는 쪽이 빌드 폴더에 manifest 를 두는 이름 — 게임 파일이 쓸 수 없다(2장). */
export const RESERVED_FILE = 'sbp-manifest.json';
/** 패키징이 로딩 그림 · 로딩 HTML · 진단 콘솔을 복사해 넣는 폴더 — 게임 파일이 쓸 수 없다(3장). */
export const PACKAGING_DIR = 'sbp/';
export const DEFAULT_ENTRY = 'index.html';
export const PRODUCTION_ZONE_ORIGIN = 'https://game.superboxgo.com';
export const FORMAT_VERSION = 1;
export const INJECTION_MARK = '<!-- sbp:v1 -->';
export const DEFAULT_BACKGROUND_COLOR = '#0B0F19';
export const DEFAULT_PRIMARY_COLOR = '#1B64DA';

export const VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z._-]{0,31}$/;
export const COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

// `@` — Cocos Creator 3 의 서브 에셋 파일 이름(`uuid@b47c0@bb97f.jpg`). 실제 빌드에 들어 있어 빼면 Cocos 게임을 올릴 수 없다
const SAFE_PATH_CHARS = /^[A-Za-z0-9._\-/ ()@]+$/;

/** 빌드 안 상대 경로 — 상위 폴더 탈출 · 절대 경로 · 백슬래시 · 허용 밖 글자를 막는다. */
export function isSafeBuildPath(path: string): boolean {
  if (!path || path.length > MAX_PATH_LENGTH || !SAFE_PATH_CHARS.test(path)) return false;
  if (path.startsWith('/') || path.endsWith('/')) return false;
  return path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

/** 원본 빌드가 쓸 수 없는 경로 — 패키징 · 올리기가 쓰는 자리. */
export function isReservedBuildPath(path: string): boolean {
  return path === RESERVED_FILE || path.startsWith(PACKAGING_DIR);
}

/** 게임존 출처 — `https://host[:port]` 꼴만. 경로 · 쿼리가 붙으면 SDK 주소와 postMessage 대상이 틀어진다. */
export function isZoneOrigin(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 200) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.origin === value;
  } catch {
    return false;
  }
}

/** 로컬 시험용 출처인지 — 이런 패키지는 운영으로 올라가지 않는다(manifest `zoneOrigin` 칸). */
export function isLocalZoneOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost');
  } catch {
    return false;
  }
}
