/**
 * 게임센터 출처 가족 — 게임 문서가 믿는 부모 출처(게임 채널 규격 1장 「게임센터 출처 가족」).
 *
 * 게임을 품는 게임센터 페이지는 채널마다 출처가 다르다 — `https://{주소 이름}.superboxgo.com`, 로컬 `http://{주소 이름}.localhost:8200`.
 * 게임 문서가 아는 것은 Play SDK 를 내려 준 게임존 출처(zoneOrigin — 운영 `https://game.superboxgo.com`) 하나라서, 그 출처와 같을 때만
 * 믿으면 채널 주소에서 연 게임이 연결되지 않는다. 그래서 zoneOrigin 의 가족을 믿는다.
 *  - 같은 scheme · 같은 port 이고, 호스트가 zoneOrigin 호스트와 같거나 `{이름 하나}.{바탕}` 이다. 바탕 = zoneOrigin 호스트에서 첫 이름을
 *    뗀 것(이름이 셋 이상일 때 — game.superboxgo.com → superboxgo.com), zoneOrigin 호스트가 `localhost` 면 `localhost`.
 *  - 이름은 영문 소문자 · 숫자 · 하이픈. 채널 주소 이름으로 못 쓰는 예약 이름(`RESERVED_ZONE_NAMES` — 회사 호스트 · API · 메일)은 뺀다 —
 *    콘솔 · 어드민 실행 탭 iframe 에 신호를 보내지 않고, 나중에 그런 호스트가 사용자 파일을 내주어도 게임센터로 믿지 않는다.
 *  - IP 호스트 · 이름이 둘인 호스트는 정확히 같을 때만(이름 둘에서 하나를 떼면 공개 접미사가 남는다).
 *
 * 부트 런타임과 Play SDK 가 이 파일과 시험(zone-family.test.ts)을 똑같이 하나씩 둔다 — 배포가 따로라 서로 가져오지 않는다.
 */

/** 채널 주소 이름으로 못 쓰는 예약 이름 — 서버의 예약 목록과 같다. `game` 은 데모 채널(https://game.superboxgo.com)이라 없다. */
export const RESERVED_ZONE_NAMES: readonly string[] = [
  'www',
  'api',
  'cdn',
  'console',
  'games',
  'static',
  'admin',
  'assets',
  'play',
  'sdk',
  'test',
  'developers',
  'docs',
  'mail',
  'play-api',
  'console-api',
  'admin-api',
];
const ZONE_NAME = /^[a-z0-9-]+$/;
const IPV4_HOST = /^[\d.]+$/;

/** `origin` 이 `zoneOrigin` 의 게임센터 출처 가족인가. `origin` 은 직렬화된 출처(`https://host[:port]`)여야 한다 — `null` · 경로가 붙은 값은 아니다. */
export function isZoneFamilyOrigin(origin: string, zoneOrigin: string): boolean {
  let url: URL;
  let zone: URL;
  try {
    url = new URL(origin);
    zone = new URL(zoneOrigin);
  } catch {
    return false;
  }
  if (url.origin !== origin || url.protocol !== zone.protocol || url.port !== zone.port) return false;
  const host = url.hostname;
  const zoneHost = zone.hostname;
  if (host === zoneHost) return true;
  const labels = zoneHost.split('.');
  const base = zoneHost === 'localhost' ? zoneHost : labels.length > 2 && !IPV4_HOST.test(zoneHost) ? labels.slice(1).join('.') : '';
  if (!base || !host.endsWith(`.${base}`)) return false;
  const name = host.slice(0, -base.length - 1);
  return ZONE_NAME.test(name) && !RESERVED_ZONE_NAMES.includes(name);
}

/**
 * 게임 문서가 신호(`sbx.hello` · `sbx.loading`)를 보낼 targetOrigin — 바로 위 창(`location.ancestorOrigins[0]`)이 가족이면 그 출처,
 * 아니면 null(보내지 않는다). `ancestorOrigins` 가 없는 브라우저(Firefox)는 위 창 출처를 알 수 없어 `'*'` — 그때 신호는 `signalForTarget` 을
 * 거쳐 SDK 버전 · 로딩 단계 · 진행률 · 걸린 시간 · 오류 코드만 남는다. 받는 쪽(connect · appInfo)은 언제나 가족 출처만 받는다.
 * 최상위 창인지는 부르는 쪽이 먼저 본다.
 */
export function zoneSignalTarget(ancestorOrigins: { readonly [index: number]: string } | undefined, zoneOrigin: string): string | null {
  if (!ancestorOrigins) return '*';
  const nearest = ancestorOrigins[0];
  return nearest !== undefined && isZoneFamilyOrigin(nearest, zoneOrigin) ? nearest : null;
}

/**
 * 그 targetOrigin 으로 보낼 신호 — `'*'`(위 창 출처를 모른다)면 오류 문구 `message` 를 뺀다. 게임 오류 글이라 내부 주소 · 스택 일부가 들어갈
 * 수 있어 제3자 부모에게 보이면 안 된다(게임존은 오류 신호의 코드만 읽는다). 아는 출처로 보낼 때와 문구가 없는 신호는 그대로 돌려준다.
 */
export function signalForTarget(signal: Readonly<Record<string, unknown>>, targetOrigin: string): Readonly<Record<string, unknown>> {
  if (targetOrigin !== '*' || !('message' in signal)) return signal;
  return Object.fromEntries(Object.entries(signal).filter(([key]) => key !== 'message'));
}
