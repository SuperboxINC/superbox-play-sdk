import type { PackageWarning } from './errors.ts';

/**
 * 패키징 경고 — 패키지는 만들어지지만 게임사가 알아야 하는 것. 문구는 한 곳에 둔다(오류 문구와 같은 해요체).
 */
const MESSAGES = {
  VERSION_DEFAULTED: '설정에 version이 없어서 1.0.0으로 넣었어요. 콘솔에서 올릴 때 바꿀 수 있어요.',
  TITLE_MISSING: '설정에 title이 없어서 게임존이 이름을 알려 줄 때까지 로딩 화면의 이름이 비어 있어요.',
  VIEWPORT_KEPT: '시작 파일의 viewport를 그대로 뒀어요. 핀치 줌과 노치 영역을 막으려면 viewport-fit=cover, user-scalable=no를 넣어 주세요.',
  LOADING_HTML_DOCUMENT: 'loading.html은 조각이어야 해요. <html>, <head>, <body> 태그를 빼 주세요.',
  SDK_TAG_DEFERRED: 'Play SDK 태그에 async나 defer가 있어요. 게임 코드가 SBPlay를 먼저 부르면 실패할 수 있어요.',
  SYMBOLS_INCLUDED: 'Unity 심볼 파일이 들어 있어요. 운영에는 필요하지 않으니 Debug Symbols를 끄면 패키지가 작아져요.',
  UNCOMPRESSED_LARGE: '압축되지 않은 큰 파일이 있어요. 엔진 빌드 설정에서 Brotli나 Gzip을 켜면 로딩이 빨라져요.',
  LOCAL_ZONE: '로컬 게임존 주소로 만들었어요. 이 패키지는 운영에 올릴 수 없어요.',
  DEBUG_CONSOLE_ON: '진단 콘솔이 켜져 있어요. 운영에 낼 패키지에서는 꺼 주세요.',
  CONFIG_UNKNOWN_KEY: '설정 파일에 모르는 항목이 있어서 무시했어요.',
  OTHER_PLATFORM_TEMPLATE: '다른 플랫폼 전용 템플릿이 입혀져 있어요. 로딩 화면이 두 개가 되고 그 플랫폼의 브리지가 없어 멈출 수 있으니, 기본 템플릿이나 자체 템플릿으로 다시 빌드해 주세요.',
} as const;

export type PackageWarningCode = keyof typeof MESSAGES;

export function warning(code: PackageWarningCode, detail?: string): PackageWarning {
  return { code, message: detail ? `${MESSAGES[code]} (${detail})` : MESSAGES[code] };
}
