/**
 * Cocos Creator 빌더 확장 진입 — `contributions.builder` 가 이 파일을 읽는다(공식 문서 custom-build-plugin).
 * 메인 · 렌더러 프로세스가 같이 읽으므로 무거운 모듈을 부르지 않는다. 패키징은 hooks 에 있다.
 */
export const PACKAGE_NAME = 'superbox-play';
export const DEFAULT_ZONE_ORIGIN = 'https://game.superboxgo.com';

export interface SuperboxBuildOptions {
  readonly enabled: boolean;
  readonly zone: string;
}

const LOCAL_HTTP = /^http:\/\/(localhost|127\.0\.0\.1|[^/]+\.localhost)(:\d+)?$/;
const HTTPS_ORIGIN = /^https:\/\/[^/\s]+$/;

export function isAcceptableZone(value: unknown): boolean {
  return typeof value === 'string' && (HTTPS_ORIGIN.test(value) || LOCAL_HTTP.test(value));
}

/** 빌드 패널 · `--build configPath` 의 `packages["superbox-play"]` → 값. 칸이 없으면 기본값이다(명령줄 빌드는 패널 값이 없다). */
export function readBuildOptions(packages: Readonly<Record<string, unknown>> | undefined): SuperboxBuildOptions {
  const raw = (packages?.[PACKAGE_NAME] ?? {}) as { readonly enabled?: unknown; readonly zone?: unknown };
  return {
    enabled: raw.enabled !== false,
    zone: typeof raw.zone === 'string' && raw.zone ? raw.zone : DEFAULT_ZONE_ORIGIN,
  };
}

const OPTIONS = {
  enabled: {
    label: '슈퍼박스 플레이 패키지 만들기',
    description: '빌드가 끝나면 build 폴더 옆에 .sbp를 만들어요.',
    default: true,
    render: { ui: 'ui-checkbox' },
  },
  zone: {
    label: '게임존 주소',
    description: '기본은 운영 게임존이에요. 로컬에서 테스트하려면 http://localhost:8200을 넣어 주세요.',
    default: DEFAULT_ZONE_ORIGIN,
    render: { ui: 'ui-input', attributes: { placeholder: DEFAULT_ZONE_ORIGIN } },
    verifyRules: ['superboxZone'],
  },
};

const VERIFY_RULES = {
  superboxZone: {
    message: 'https://호스트 형식이어야 해요. http는 localhost만 쓸 수 있어요.',
    func: (value: unknown): boolean => isAcceptableZone(value),
  },
};

const PLATFORM_CONFIG = { hooks: './hooks', options: OPTIONS, verifyRuleMap: VERIFY_RULES };

/** 패키지는 웹 빌드만 받는다. `'*'` 를 쓰면 네이티브 빌드에도 칸이 생긴다. */
export const configs = {
  'web-mobile': PLATFORM_CONFIG,
  'web-desktop': PLATFORM_CONFIG,
};
