import { stat } from 'node:fs/promises';
import path from 'node:path';
import { VERSION_PATTERN, type PackageWarning } from '../../../packages/package-core/src/browser.ts';
import { checkSdkPolicy, CONFIG_FILE, createPackage, loadConfigFile, type PackageReport, type SuperboxConfig } from '../../../packages/package-core/src/index.ts';
import unityPackage from '../superbox-play/package.json' with { type: 'json' };

/**
 * Unity 빌드 폴더 → `.sbp`. 패키징 규칙은 CLI 와 같은 package-core 다 — Unity 패키지 안에 한 파일로 묶여 들어가 에디터 메뉴가 Node 로 실행한다.
 * 설정 파일은 프로젝트 루트의 superbox.config.json 이고, 없는 칸은 Player Settings 의 버전 · 이름으로 채운다.
 * 출력은 빌드 폴더 옆이다(`Build/SuperboxPlay/WebGL-1.0.0.sbp`) — 폴더 안에 두면 다음 패키징에 섞인다.
 */
export interface UnityPackageRequest {
  readonly folder: string;
  readonly projectDir: string;
  /** Player Settings 값 — 비어 있으면 없는 것으로 본다(C# JsonUtility 는 빈 문자열로 쓴다). */
  readonly version?: string;
  readonly title?: string;
  readonly zoneOrigin?: string;
  readonly now?: Date;
}

const DEFAULT_VERSION = '1.0.0';
const MAX_TITLE_LENGTH = 100;

function withPlayerSettings(config: SuperboxConfig, request: UnityPackageRequest): SuperboxConfig {
  // 쓸 수 없는 버전은 넣지 않는다 — 패키징이 기본 버전으로 만들고 VERSION_DEFAULTED 로 알린다
  const version = config.version ?? (request.version && VERSION_PATTERN.test(request.version) ? request.version : undefined);
  const playerTitle = request.title && request.title.length <= MAX_TITLE_LENGTH ? request.title : undefined;
  const title = config.title ?? playerTitle;
  return { ...config, ...(version === undefined ? {} : { version }), ...(title === undefined ? {} : { title }), engine: 'unity' };
}

/** 메뉴가 오래 걸리는 빌드 전에 묻는 도구 버전 판정 — 막을지와 알릴 말 */
export async function unityPolicyAnswer(): Promise<{ readonly ok: true; readonly blocked: boolean; readonly message: string; readonly latestVersion: string }> {
  const verdict = await checkSdkPolicy(unityPackage.version);
  if (verdict.kind === 'ok') return { ok: true, blocked: false, message: '', latestVersion: '' };
  return { ok: true, blocked: verdict.kind === 'blocked', message: verdict.message, latestVersion: verdict.latestVersion };
}

/** 프로젝트의 설정 파일 + Player Settings — 패키징과 기기 테스트가 같은 값을 쓴다 */
export async function loadUnityConfig(request: UnityPackageRequest): Promise<{ readonly config: SuperboxConfig; readonly warnings: readonly PackageWarning[] }> {
  const configPath = path.join(request.projectDir, CONFIG_FILE);
  const hasConfig = await stat(configPath).then(() => true, () => false);
  const loaded = hasConfig ? await loadConfigFile(configPath) : { config: {}, warnings: [] };
  return { config: withPlayerSettings(loaded.config, request), warnings: loaded.warnings };
}

export async function packageUnityBuild(request: UnityPackageRequest): Promise<PackageReport> {
  const loaded = await loadUnityConfig(request);
  const { config } = loaded;
  const report = await createPackage({
    folder: request.folder,
    out: `${path.resolve(request.folder)}-${config.version ?? DEFAULT_VERSION}.sbp`,
    config,
    configDir: request.projectDir,
    engine: 'unity',
    ...(request.zoneOrigin ? { zoneOrigin: request.zoneOrigin } : {}),
    ...(request.now === undefined ? {} : { now: request.now }),
    tool: { name: 'superbox-play', version: unityPackage.version },
  });
  return { ...report, warnings: [...loaded.warnings, ...report.warnings] };
}
