/**
 * 도구 버전 정책 — 공개 저장소의 sdk-policy.json. 최소 버전 미만과 금지 버전은 빌드를 막고, 권장 버전 미만은 알린다.
 * 읽을 수 없는 정책과 버전은 판단하지 않는다(막지 않는다).
 * 브라우저에서 도는 Phaser 플러그인의 같은 이름 파일은 글자까지 같은 사본이다 — 시험이 견준다.
 */
export declare const SDK_POLICY_URL = "https://raw.githubusercontent.com/SuperboxINC/superbox-play-sdk/main/sdk-policy.json";
export interface SdkPolicy {
    readonly minVersion: string;
    readonly recommendedVersion: string;
    readonly deniedVersions: readonly string[];
}
export type SdkPolicyVerdict = {
    readonly kind: 'ok';
} | {
    readonly kind: 'update-recommended';
    readonly message: string;
    readonly latestVersion: string;
} | {
    readonly kind: 'blocked';
    readonly message: string;
    readonly latestVersion: string;
};
export declare function parseSdkPolicy(value: unknown): SdkPolicy | null;
export declare function evaluateSdkPolicy(policy: SdkPolicy, version: string): SdkPolicyVerdict;
