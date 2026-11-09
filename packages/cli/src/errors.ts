import { PackageError, type PackageErrorCode } from '../../package-core/src/browser.ts';

/**
 * CLI 오류 코드 · 문구 · 종료 코드 — 이 표 하나다. 패키지 규칙 오류(PackageError)는 package-core 의 문구를 그대로 쓴다.
 * API 코드(deploy)는 서버가 준 코드 이름 그대로 표에 둔다 — 문서 · 로그에서 같은 이름으로 찾게. 콘솔 화면과 같은 코드는 web console api-error 의
 * 문구와 같은 뜻 · 같은 낱말로 쓰고, 화면을 가리키는 말만 CLI 에 맞게 바꾼다. 표에 없는 코드는 상태로 고른 코드에 받은 코드를 붙여 보인다(cliErrorFromApi).
 *
 * 종료 코드
 *   0  성공
 *   1  패키지를 만들거나 읽지 못했다(규칙 위반 · 내용 불일치 · 손상)
 *   2  사용법 — 명령 · 옵션이 틀렸다
 *   3  설정 — superbox.config.json 이 틀렸거나 있어서는 안 된다
 *   4  입력 없음 — 폴더 · 파일을 찾지 못했다
 *   5  dev 서버를 띄우지 못했다
 *   6  API 키 — 없거나 끊겼거나 만료됐거나 권한이 없다
 *   7  서버가 거절했다 — 게임 · 채널 · 버전 · 패키지 칸을 고치거나 검수 · 출시 조건을 채워야 한다
 *   8  잠시 뒤 다시 — 호출 한도 · 서버 장애 · 네트워크
 *   70 예상하지 못한 내부 오류
 */
export const EXIT_OK = 0;
const EXIT_FAILED = 1;
const EXIT_USAGE = 2;
const EXIT_CONFIG = 3;
const EXIT_INPUT = 4;
const EXIT_SERVER = 5;
const EXIT_AUTH = 6;
const EXIT_REJECTED = 7;
const EXIT_LATER = 8;
const EXIT_INTERNAL = 70;
const MAX_DETAIL_LENGTH = 200;

const CLI_ERRORS = {
  USAGE: { message: '명령이나 옵션이 틀렸어요. superbox-play --help로 사용법을 확인해 주세요.', exit: EXIT_USAGE },
  SDK_VERSION_BLOCKED: { message: '도구를 업데이트해야 해요.', exit: EXIT_FAILED },
  CONFIG_EXISTS: { message: '설정 파일이 이미 있어요. 덮어쓰려면 --force를 붙여 주세요.', exit: EXIT_CONFIG },
  CONFIG_NOT_FOUND: { message: '--config로 지정한 설정 파일을 찾을 수 없어요.', exit: EXIT_CONFIG },
  FILE_NOT_FOUND: { message: '파일을 찾을 수 없어요.', exit: EXIT_INPUT },
  PORT_IN_USE: { message: '포트를 쓸 수 없어요. --port로 다른 번호를 지정해 주세요.', exit: EXIT_SERVER },
  PORT_INVALID: { message: '포트는 1~65535 사이의 숫자여야 해요.', exit: EXIT_USAGE },
  SDK_MISSING: { message: 'Play SDK 사본을 찾을 수 없어요. 도구를 다시 빌드하거나 --zone을 지정해 주세요.', exit: EXIT_SERVER },
  // ── deploy — 입력
  API_KEY_MISSING: { message: 'API 키가 없어요. 콘솔 ‘연동’에서 만든 키를 환경 변수 SUPERBOX_PLAY_API_KEY에 넣어 주세요.', exit: EXIT_AUTH },
  CONSOLE_ORIGIN_INVALID: { message: '콘솔 주소가 틀렸어요. https://호스트 형식이어야 하고, http는 localhost만 쓸 수 있어요.', exit: EXIT_USAGE },
  // ── deploy — API 키(권한은 발급한 뒤 바꿀 수 없다 — 새로 발급한다)
  CONSOLE_API_KEY_INVALID: { message: 'API 키를 쓸 수 없어요. 틀렸거나 폐기된 키예요. 콘솔 ‘연동’에서 새로 발급해 주세요.', exit: EXIT_AUTH },
  CONSOLE_API_KEY_EXPIRED: { message: 'API 키가 만료됐어요. 콘솔 ‘연동’에서 새로 만들어 주세요.', exit: EXIT_AUTH },
  CONSOLE_API_KEY_SCOPE: { message: '이 API 키에는 이 작업을 할 권한이 없어요. 콘솔 ‘연동’에서 필요한 권한으로 키를 새로 발급해 주세요.', exit: EXIT_AUTH },
  // ── deploy — 서버 거절(게임 · 채널 · 운영 종료)
  PLAY_GAME_NOT_FOUND: { message: '게임을 찾을 수 없어요. 게임 ID와 API 키의 조직을 확인해 주세요.', exit: EXIT_REJECTED },
  PLAY_BUILD_NOT_FOUND: { message: '빌드를 찾을 수 없어요.', exit: EXIT_REJECTED },
  CONSOLE_CHANNEL_NOT_ALLOWED: { message: '입점 허가를 받지 않은 채널이라 빌드를 올리거나 출시할 수 없어요. 채널 키와 조직의 입점 허가를 확인해 주세요.', exit: EXIT_REJECTED },
  CONSOLE_CHANNEL_PAUSED: { message: '슈퍼박스가 이 채널에서 게임을 차단해 지금은 올리거나 출시할 수 없어요. 콘솔에서 사유를 확인해 주세요.', exit: EXIT_REJECTED },
  CONSOLE_GAME_CLOSING: { message: '운영 종료 예정인 게임이라 이 작업을 할 수 없어요. 종료 신청을 취소하면 다시 할 수 있어요.', exit: EXIT_REJECTED },
  CONSOLE_GAME_CLOSED: { message: '운영이 끝난 게임이라 더 변경할 수 없어요.', exit: EXIT_REJECTED },
  // ── deploy — 서버 거절(버전 · 패키지 · 파일)
  PLAY_BUILD_VERSION_TAKEN: { message: '이 채널에 같은 버전이 이미 있어요. 올리다 끝나지 않은 빌드일 수도 있어요. version을 올려 패키지를 다시 만들어 주세요.', exit: EXIT_REJECTED },
  PLAY_BUILD_PACKAGE_INVALID: { message: '서버가 패키지 정보를 받지 않았어요. 도구를 업데이트하고 패키지를 다시 만들어 주세요.', exit: EXIT_REJECTED },
  PLAY_BUILD_PACKAGE_ZONE_NOT_ALLOWED: { message: '이 게임존 주소로 만든 패키지는 여기에 올릴 수 없어요. build --zone을 맞춰 패키지를 다시 만들어 주세요.', exit: EXIT_REJECTED },
  PLAY_BUILD_PATH_RESERVED: { message: '서버가 쓰는 이름의 파일이 있어요.', exit: EXIT_REJECTED },
  PLAY_BUILD_PATH_INVALID: { message: '서버가 받지 않는 파일 경로가 있어요.', exit: EXIT_REJECTED },
  PLAY_BUILD_ENTRY_MISSING: { message: '시작 파일이 올라가지 않았어요.', exit: EXIT_REJECTED },
  PLAY_BUILD_TOO_LARGE: { message: '서버의 빌드 크기 한도를 넘었어요.', exit: EXIT_REJECTED },
  PLAY_BUILD_UPLOAD_INCOMPLETE: { message: '올라간 파일이 선언보다 적어요. version을 올려 다시 올려 주세요.', exit: EXIT_REJECTED },
  PLAY_BUILD_UPLOAD_EXCESS: { message: '올라간 파일이 선언보다 많아요. version을 올려 다시 올려 주세요.', exit: EXIT_REJECTED },
  // ── 그 밖의 거절
  API_REJECTED: { message: '서버가 요청을 받지 않았어요.', exit: EXIT_REJECTED },
  UPLOAD_REJECTED: { message: '저장소가 파일을 받지 않았어요. 업로드 주소가 만료됐을 수 있어요. version을 올려 다시 올려 주세요.', exit: EXIT_REJECTED },
  // ── deploy — 패키지
  PACKAGE_CORRUPT: { message: '패키지가 손상됐어요. 패키지를 다시 만들어 올려 주세요.', exit: EXIT_FAILED },
  SERVER_RESPONSE_INVALID: { message: '서버 응답을 읽지 못했어요. 도구를 업데이트해 주세요.', exit: EXIT_FAILED },
  // ── deploy — 잠시 뒤(키마다 분당 한도 · 빌드 만들기는 발급 한도도)
  CONSOLE_API_KEY_RATE_LIMITED: { message: '이 API 키로 너무 자주 호출했어요. 잠시 뒤 다시 실행해 주세요.', exit: EXIT_LATER },
  CONSOLE_ISSUE_RATE_LIMITED: { message: '빌드를 너무 자주 만들었어요. 잠시 뒤 다시 실행해 주세요.', exit: EXIT_LATER },
  SERVER_UNAVAILABLE: { message: '서버에 연결하지 못했어요. 잠시 뒤 다시 실행해 주세요.', exit: EXIT_LATER },
  UPLOAD_FAILED: { message: '파일을 올리지 못했어요. 네트워크를 확인하고 version을 올려 다시 올려 주세요.', exit: EXIT_LATER },
} as const;

export type CliErrorCode = keyof typeof CLI_ERRORS;

export class CliError extends Error {
  readonly code: CliErrorCode;
  readonly detail: string | undefined;

  constructor(code: CliErrorCode, detail?: string) {
    super(detail ? `${CLI_ERRORS[code].message} (${detail})` : CLI_ERRORS[code].message);
    this.name = 'CliError';
    this.code = code;
    this.detail = detail;
  }
}

function isKnownCode(code: unknown): code is CliErrorCode {
  return typeof code === 'string' && Object.hasOwn(CLI_ERRORS, code);
}

/** 상태만으로 고르는 코드 — 서버가 모르는 코드를 보내거나 프록시가 답했을 때. */
function codeOfStatus(status: number): CliErrorCode {
  if (status === 401) return 'CONSOLE_API_KEY_INVALID';
  if (status === 403) return 'CONSOLE_API_KEY_SCOPE';
  if (status === 429) return 'CONSOLE_API_KEY_RATE_LIMITED';
  if (status >= 500) return 'SERVER_UNAVAILABLE';
  return 'API_REJECTED';
}

/** CLI 문구가 고칠 방법까지 말하는 코드 — 서버 message(안쪽 문구)는 덧붙이지 않고 칸 이름만 싣는다. */
const FIELD_ONLY_CODES: ReadonlySet<unknown> = new Set(['PLAY_BUILD_PACKAGE_ZONE_NOT_ALLOWED']);

/** 서버 message 는 흔히 `칸 — 까닭` 꼴이다 — 칸 이름을 두 번 보이지 않게 앞을 뗀다. */
function reasonOf(body: Readonly<Record<string, unknown>>): unknown {
  if (FIELD_ONLY_CODES.has(body.code)) return undefined;
  const prefix = `${String(body.field)} — `;
  return typeof body.message === 'string' && body.message.startsWith(prefix) ? body.message.slice(prefix.length) : body.message;
}

/** API 오류 본문 `{ code, message, field }` → CLI 오류. 칸 이름을 뒤에 붙인다. */
export function cliErrorFromApi(status: number, body: Readonly<Record<string, unknown>>): CliError {
  const rawCode = body.code;
  const parts = [body.field, reasonOf(body)].filter((part): part is string => typeof part === 'string' && part.length > 0).map((part) => part.slice(0, MAX_DETAIL_LENGTH));
  if (isKnownCode(rawCode)) return new CliError(rawCode, parts.join(' — ') || undefined);
  // 서버가 새 코드를 보냈거나 프록시가 답했다 — 받은 것을 그대로 보여 준다
  const received = typeof rawCode === 'string' ? `${status} ${rawCode.slice(0, MAX_DETAIL_LENGTH)}` : String(status);
  return new CliError(codeOfStatus(status), [received, ...parts].join(' — '));
}

const PACKAGE_EXIT: Partial<Record<PackageErrorCode, number>> = {
  CONFIG_INVALID: EXIT_CONFIG,
  ENGINE_INVALID: EXIT_USAGE,
  ZONE_INVALID: EXIT_USAGE,
  FOLDER_MISSING: EXIT_INPUT,
  ENTRY_MISSING: EXIT_INPUT,
  LOADING_ASSET_MISSING: EXIT_INPUT,
};

export function exitCodeOf(error: unknown): number {
  if (error instanceof CliError) return CLI_ERRORS[error.code].exit;
  if (error instanceof PackageError) return PACKAGE_EXIT[error.code] ?? EXIT_FAILED;
  return EXIT_INTERNAL;
}

export function describeError(error: unknown): string {
  if (error instanceof CliError || error instanceof PackageError) return `오류 [${error.code}] ${error.message}`;
  return `오류 [INTERNAL] ${error instanceof Error ? error.message : String(error)}`;
}
