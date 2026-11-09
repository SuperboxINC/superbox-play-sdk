import type { EngineName } from './manifest.ts';

/**
 * 엔진 판별 — 빌드 폴더의 파일 구조와 입구 문서로 unity · cocos · phaser · html5 를 가른다.
 * 값은 콘솔 표시와 부트 어댑터 선택에 쓴다. 틀리게 맞혀도 게임은 돈다 — `--engine` · 설정 `engine` 이 언제나 이긴다.
 */
export interface EngineGuess {
  readonly name: EngineName;
  readonly version: string | null;
}

export interface EngineProbe {
  readonly files: readonly { readonly path: string; readonly size: number }[];
  readonly entryHtml: string;
  /** 텍스트 파일의 앞부분을 읽는다(없으면 null). */
  readText(path: string, maxBytes: number): Promise<string | null>;
  /** Unity 데이터 파일에서 버전을 찾는다 — 압축을 풀어야 해서 Node 쪽에 둔다. */
  readUnityVersion?(): Promise<string | null>;
}

const UNITY_LOADER = /(^|\/)[^/]+\.loader\.js$/;
const UNITY_FRAMEWORK = /(^|\/)[^/]+\.framework\.js(\.(br|gz|unityweb))?$/;
const COCOS_ENGINE = /^cocos-js\/(cc|_virtual_cc)[-.\w]*\.js$/;
const COCOS_SETTINGS = /^src\/settings(\.[0-9a-f]+)?\.json$/;
const COCOS2_ENGINE = /^cocos2d-js(-min)?(\.[0-9a-f]+)?\.js$/;
const PHASER_FILE = /(^|\/)phaser([-.][\w.-]*)?\.js$/i;
const PHASER_VERSION = /VERSION:\s*["'](\d+\.\d+\.\d+[^"']*)["']\s*,\s*LOG_VERSION/;

const MAX_SCANNED_SCRIPTS = 6;
const MAX_SCRIPT_BYTES = 32 * 1024 * 1024;
const MAX_SETTINGS_BYTES = 256 * 1024;

export function isUnityBuild(probe: Pick<EngineProbe, 'files' | 'entryHtml'>): boolean {
  const hasLoader = probe.files.some((file) => UNITY_LOADER.test(file.path));
  if (!hasLoader) return false;
  return probe.entryHtml.includes('createUnityInstance') || probe.files.some((file) => UNITY_FRAMEWORK.test(file.path));
}

export function isCocosBuild(probe: Pick<EngineProbe, 'files'>): boolean {
  return probe.files.some((file) => COCOS_ENGINE.test(file.path) || COCOS2_ENGINE.test(file.path));
}

async function cocosVersion(probe: EngineProbe): Promise<string | null> {
  const settings = probe.files.find((file) => COCOS_SETTINGS.test(file.path));
  if (!settings) return null;
  const text = await probe.readText(settings.path, MAX_SETTINGS_BYTES);
  return text ? (/"CocosEngine"\s*:\s*"([^"]{1,64})"/.exec(text)?.[1] ?? null) : null;
}

/** Phaser 는 번들에 묶이면 파일 이름이 남지 않는다 — 큰 스크립트부터 버전 표식을 찾는다. */
async function phaserVersion(probe: EngineProbe): Promise<{ readonly found: boolean; readonly version: string | null }> {
  const scripts = probe.files
    .filter((file) => /\.m?js$/i.test(file.path) && file.size <= MAX_SCRIPT_BYTES)
    .sort((a, b) => b.size - a.size)
    .slice(0, MAX_SCANNED_SCRIPTS);
  const named = scripts.find((file) => PHASER_FILE.test(file.path));
  for (const script of named ? [named, ...scripts.filter((file) => file !== named)] : scripts) {
    const text = await probe.readText(script.path, MAX_SCRIPT_BYTES);
    if (!text) continue;
    const version = PHASER_VERSION.exec(text)?.[1];
    if (version) return { found: true, version: version.slice(0, 64) };
  }
  return { found: Boolean(named), version: null };
}

export async function detectEngine(probe: EngineProbe): Promise<EngineGuess> {
  if (isUnityBuild(probe)) return { name: 'unity', version: (await probe.readUnityVersion?.()) ?? null };
  if (isCocosBuild(probe)) return { name: 'cocos', version: await cocosVersion(probe) };
  const phaser = await phaserVersion(probe);
  if (phaser.found) return { name: 'phaser', version: phaser.version };
  return { name: 'html5', version: null };
}
