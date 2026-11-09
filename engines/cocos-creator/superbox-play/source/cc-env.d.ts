/** tsc 전용 — 실제 빌드에서는 Creator 가 `cc/env` 를 만든다(@cocos/creator-types 에는 없다). */
declare module 'cc/env' {
  export const EDITOR: boolean;
}
