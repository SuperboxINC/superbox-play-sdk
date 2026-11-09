/**
 * 빌드 규칙 — build.mjs 는 부르면 바로 빌드하므로 시험할 수 있게 규칙만 따로 둔다.
 */

/** Phaser 타입이 읽는 SDK 타입 — 안쪽 패키지 이름을 같은 저장소의 상대 경로로(packages/phaser/dist/types → packages/sdk/dist/types). 받아 쓰는 쪽에는 안쪽 패키지가 없다 */
export function publicPhaserTypes(text) {
  return text.replaceAll("'@superbox-play/sdk'", "'../../../sdk/dist/types/index.js'");
}
