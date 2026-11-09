/**
 * 도구 버전 정책 — 공개 저장소의 sdk-policy.json. 최소 버전 미만과 금지 버전은 빌드를 막고, 권장 버전 미만은 알린다.
 * 읽을 수 없는 정책과 버전은 판단하지 않는다(막지 않는다).
 * 브라우저에서 도는 Phaser 플러그인의 같은 이름 파일은 글자까지 같은 사본이다 — 시험이 견준다.
 */
export const SDK_POLICY_URL = 'https://raw.githubusercontent.com/SuperboxINC/superbox-play-sdk/main/sdk-policy.json';

export interface SdkPolicy {
  readonly minVersion: string;
  readonly recommendedVersion: string;
  readonly deniedVersions: readonly string[];
}

export type SdkPolicyVerdict =
  | { readonly kind: 'ok' }
  | { readonly kind: 'update-recommended'; readonly message: string; readonly latestVersion: string }
  | { readonly kind: 'blocked'; readonly message: string; readonly latestVersion: string };

const SCHEMA_VERSION = 1;
const VERSION = /^(\d+)\.(\d+)\.(\d+)$/;

function isVersion(value: unknown): value is string {
  return typeof value === 'string' && VERSION.test(value);
}

function isText(value: unknown): value is string {
  return typeof value === 'string';
}

function isLower(version: string, than: string): boolean {
  const parts = version.split('.').map(Number);
  const others = than.split('.').map(Number);
  for (let index = 0; index < parts.length; index += 1) {
    const difference = (parts[index] ?? 0) - (others[index] ?? 0);
    if (difference !== 0) return difference < 0;
  }
  return false;
}

export function parseSdkPolicy(value: unknown): SdkPolicy | null {
  if (typeof value !== 'object' || value === null) return null;
  const { schemaVersion, minVersion, recommendedVersion, deniedVersions } = value as Readonly<Record<string, unknown>>;
  if (schemaVersion !== SCHEMA_VERSION || !isVersion(minVersion) || !isVersion(recommendedVersion)) return null;
  // 금지 목록의 한 줄이 틀렸다고 최소 버전까지 버리면, 막으려고 올린 정책이 막지 못한다
  return { minVersion, recommendedVersion, deniedVersions: Array.isArray(deniedVersions) ? deniedVersions.filter(isText) : [] };
}

export function evaluateSdkPolicy(policy: SdkPolicy, version: string): SdkPolicyVerdict {
  const latestVersion = policy.recommendedVersion;
  if (policy.deniedVersions.includes(version)) return { kind: 'blocked', latestVersion, message: `이 도구 버전(${version})은 문제가 있어 쓸 수 없어요. 최신 버전으로 업데이트해 주세요.` };
  if (!isVersion(version)) return { kind: 'ok' };
  if (isLower(version, policy.minVersion)) return { kind: 'blocked', latestVersion, message: `이 도구 버전(${version})은 지원이 끝났어요. ${policy.minVersion} 이상으로 업데이트해 주세요.` };
  if (isLower(version, latestVersion)) return { kind: 'update-recommended', latestVersion, message: `새 버전이 나왔어요. 업데이트를 권해요. (지금 ${version} · 최신 ${latestVersion})` };
  return { kind: 'ok' };
}
