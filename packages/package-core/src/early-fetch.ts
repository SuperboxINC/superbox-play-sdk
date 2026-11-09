import type { EngineName } from './manifest.ts';

/**
 * 초기 다운로드 목록 — package-format.md 5장 「목록만 엔진별」. 입구 파싱이 시작될 때 fetch 해 두었다가
 * 로더의 같은 요청에 그 응답을 준다. 그래서 **로더가 fetch 로 받는 파일만** 넣어야 한다 — XHR · <script> 로 받는 파일은
 * 응답을 건네줄 수 없어 두 번 받는다. 그 이유로 Phaser(XHR) · 일반 HTML5(무엇을 쓸지 모른다)는 비어 있다.
 */
const UNITY_TARGET = /(^|\/)[^/]+\.(data|wasm)(\.(br|gz|unityweb))?$/;
const COCOS_TARGET = /^cocos-js\/assets\/[^/]+\.wasm$/;
/** Cocos 의 작은 wasm 은 앞서 받아도 얻는 것이 없다. */
const COCOS_MIN_BYTES = 100 * 1024;

function basename(path: string): string {
  return path.split('/').pop() ?? path;
}

/** 입구 문서가 그 이름을 그대로 쓰는지 — 쿼리가 붙거나 다른 경로면 로더 요청과 주소가 달라 두 번 받는다. */
function referencedAsIs(html: string, path: string): boolean {
  const name = basename(path);
  return ['"', "'", '`'].some((quote) => html.includes(name + quote));
}

/**
 * Unity `framework.js` 는 넣지 않는다 — 로더가 `<script>` 로 받아 두 번 받게 되고, 초기화 경합(ASM_CONSTS)을 부른다.
 * symbols 도 오류 때만 쓰는 파일이라 넣지 않는다.
 */
export function earlyFetchList(
  engine: EngineName,
  files: readonly { readonly path: string; readonly size: number }[],
  entryHtml: string,
): readonly string[] {
  if (engine === 'unity') return files.filter((file) => UNITY_TARGET.test(file.path) && referencedAsIs(entryHtml, file.path)).map((file) => file.path);
  if (engine === 'cocos') return files.filter((file) => COCOS_TARGET.test(file.path) && file.size >= COCOS_MIN_BYTES).map((file) => file.path);
  return [];
}
