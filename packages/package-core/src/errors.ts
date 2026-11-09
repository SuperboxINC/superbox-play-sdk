/**
 * 패키지 오류 코드와 문구 — 읽기(콘솔 · CLI) · 만들기(CLI · Cocos 확장)가 이 한 곳을 쓴다.
 * 문구는 콘솔 화면에 그대로 나갈 수 있게 해요체 한 문장이다(콘솔 · CLI 문구와 같은 말투). 브라우저에서도 돈다.
 */
const MESSAGES = {
  // ── 읽기 — ZIP
  ZIP_INVALID: 'ZIP 형식이 아니거나 파일 끝이 잘렸어요.',
  ZIP_UNSUPPORTED: 'ZIP64, 분할, 암호화, 데이터 서술자를 쓴 파일은 받지 않아요.',
  NOT_STORED: '압축된 항목이 있어요. .sbp의 모든 항목은 압축하지 않고 저장해야 해요.',
  FIRST_NOT_MANIFEST: '첫 항목이 manifest.json이 아니에요.',
  OUTSIDE_WEB: 'web/ 밖에 있는 항목이 있어요.',
  SYMLINK: '심볼릭 링크는 받지 않아요.',
  ENTRY_CORRUPT: 'ZIP 항목의 헤더가 목록과 맞지 않거나 항목끼리 겹쳐요.',
  // ── 읽기 · 만들기 공통 — 빌드 규칙
  PATH_UNSAFE: '경로에 쓸 수 없는 글자가 있거나 폴더 밖을 가리켜요.',
  RESERVED_NAME: '패키징에 쓰는 이름이에요. sbp-manifest.json과 sbp/는 게임 파일 이름으로 쓸 수 없어요.',
  DUPLICATE_PATH: '같은 경로의 항목이 두 개 있어요.',
  TOO_MANY_FILES: '파일이 너무 많아요. 2,000개까지 올릴 수 있어요.',
  TOO_LARGE: '전체 크기가 너무 커요. 500MB까지 올릴 수 있어요.',
  ENTRY_MISSING: '시작 파일이 없어요.',
  // ── 읽기 — manifest
  MANIFEST_INVALID: 'manifest.json의 항목이 형식에 맞지 않아요.',
  FORMAT_UNSUPPORTED: '이 도구가 모르는 패키지 형식이에요. 도구를 최신 버전으로 업데이트해 주세요.',
  MANIFEST_MISMATCH: 'manifest와 항목의 경로나 크기가 달라요.',
  HASH_MISMATCH: '파일 내용이 manifest의 SHA-256과 달라요.',
  // ── 만들기
  FOLDER_MISSING: '빌드 폴더를 찾을 수 없어요.',
  CONFIG_INVALID: 'superbox.config.json의 항목이 형식에 맞지 않아요.',
  ALREADY_INJECTED: '이미 패키징된 시작 파일이에요. 엔진에서 다시 빌드한 폴더를 넣어 주세요.',
  ENTRY_NOT_UTF8: '시작 파일은 UTF-8이어야 해요.',
  TEMPLATE_UNRESOLVED: '치환되지 않은 빌드 템플릿이에요. 다른 플랫폼 전용 템플릿 대신 기본 템플릿이나 자체 템플릿으로 다시 빌드해 주세요.',
  LOADING_ASSET_MISSING: '로딩 화면 파일을 찾을 수 없어요.',
  LOADING_ASSET_INVALID: '로딩 그림은 PNG, JPG, WebP, SVG만 쓸 수 있어요.',
  ZONE_INVALID: '게임존 주소가 올바르지 않아요. https://호스트 형식이어야 하고, http는 localhost만 쓸 수 있어요.',
  ENGINE_INVALID: '엔진 이름은 unity, cocos, phaser, html5 중 하나여야 해요.',
  FILE_CHANGED: '패키징하는 중에 파일이 바뀌었어요. 다시 실행해 주세요.',
  RUNTIME_MISSING: '패키지에 부트 런타임이 없어요. 도구를 다시 빌드해 주세요.',
} as const;

export type PackageErrorCode = keyof typeof MESSAGES;

export function packageErrorMessage(code: PackageErrorCode): string {
  return MESSAGES[code];
}

/** 패키지를 거절하거나 만들지 못했다. `detail` 은 문제가 된 칸이나 경로이고 문구와 따로 보인다. */
export class PackageError extends Error {
  readonly code: PackageErrorCode;
  readonly detail: string | undefined;

  constructor(code: PackageErrorCode, detail?: string) {
    super(detail ? `${MESSAGES[code]} (${detail})` : MESSAGES[code]);
    this.name = 'PackageError';
    this.code = code;
    this.detail = detail;
  }
}

export interface PackageWarning {
  readonly code: string;
  readonly message: string;
}
