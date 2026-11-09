import extensionPackage from '../package.json' with { type: 'json' };
import { DEFAULT_ZONE_ORIGIN, PACKAGE_NAME } from './builder.ts';
import { notifyUpdate, type UpdateNoticeEditor } from './update-notice.ts';

/**
 * 확장의 메인 프로세스 — 상단 메뉴 Superbox Play > Build & Package.
 * 웹 빌드 작업을 시작할 뿐이고 .sbp 는 빌드 끝에 hooks 가 만든다. 그래서 빌드 패널로 빌드해도, 메뉴로 빌드해도 패키지가 같다.
 * 성공한 지난 웹 빌드가 있으면 그 설정을 다시 쓴다 — 빌드 패널에서 고른 값을 메뉴가 잃지 않게. 패키지를 만들지와 게임존 주소만 메뉴가 정한다.
 */
export const LOCAL_ZONE_ORIGIN = 'http://localhost:8200';
export const BUILD_PARAM_ERROR = 32;
export const BUILD_SUCCESS = 36;
export const BUILD_BUSY = 37;

const WEB_PLATFORMS: readonly string[] = ['web-mobile', 'web-desktop'];
const DEFAULT_PLATFORM = 'web-mobile';
const DIALOG_TITLE = 'Superbox Play';

interface BuildOptions {
  readonly platform?: string;
  readonly packages?: Readonly<Record<string, unknown>>;
  readonly [key: string]: unknown;
}

interface BuildTask {
  readonly id?: string;
  readonly type?: string;
  readonly state?: string;
  readonly options?: BuildOptions;
}

/** 이 파일이 쓰는 에디터 API 만 — 시험이 대역을 넣는다. `add-task` 는 빌드 패널이 쓰는 메시지이고 문서에 없어 Creator 3.8.8 에서 확인했다. */
export interface EditorApi {
  readonly Message: {
    request(pkg: string, message: string, ...args: unknown[]): Promise<unknown>;
    send(pkg: string, message: string, ...args: unknown[]): void;
  };
  readonly Dialog: {
    error(message: string, options?: { readonly title?: string }): Promise<unknown>;
  };
}

declare const Editor: EditorApi & UpdateNoticeEditor & { readonly Project: { readonly path: string } };

/** 에디터 창이 다 뜬 뒤에 묻는다 — 뜨는 중에 띄우면 창 뒤로 숨는다 */
const UPDATE_NOTICE_DELAY_MS = 5000;

async function lastWebBuildOptions(editor: EditorApi): Promise<BuildOptions | null> {
  const info = (await editor.Message.request('builder', 'query-tasks-info')) as { readonly list?: readonly BuildTask[] };
  const webTasks = (info.list ?? []).filter((task) => task.type === 'build' && task.state === 'success' && WEB_PLATFORMS.includes(task.options?.platform ?? ''));
  const latest = webTasks.reduce<BuildTask | null>((found, task) => (found && Number(found.id) >= Number(task.id) ? found : task), null);
  if (!latest?.options) return null;
  // 이 값들은 작업마다 빌더가 새로 정한다
  const { logDest: _logDest, id: _id, taskId: _taskId, ...options } = latest.options;
  return options;
}

async function firstBuildOptions(editor: EditorApi): Promise<BuildOptions | null> {
  // 엔진 내장 씬(db://internal)은 시작 씬이 될 수 없다
  const scenes = (await editor.Message.request('asset-db', 'query-assets', { ccType: 'cc.SceneAsset', pattern: 'db://assets/**' })) as readonly { readonly uuid: string }[];
  const startScene = scenes[0]?.uuid;
  if (startScene === undefined) return null;
  // 빠진 칸은 빌더가 채운다 — packages 를 일부만 넘기면 Creator 3.8.8 의 빌드가 끝나지 않는다
  return (await editor.Message.request('builder', 'check-and-complete-options', { platform: DEFAULT_PLATFORM, startScene })) as BuildOptions;
}

function messageOf(result: unknown): string | null {
  switch (result) {
    case BUILD_SUCCESS:
      return null;
    case BUILD_BUSY:
      return '이미 진행 중인 빌드가 있어요. 끝난 뒤 다시 눌러 주세요.';
    case BUILD_PARAM_ERROR:
      return '빌드 설정이 올바르지 않아요. 빌드 패널에서 설정을 확인해 주세요.';
    default:
      return '빌드가 끝나지 않았어요. 콘솔의 오류를 확인해 주세요.';
  }
}

async function run(editor: EditorApi, zone: string): Promise<string | null> {
  if (!(await editor.Message.request('builder', 'query-worker-ready'))) return '빌더를 준비하고 있어요. 잠시 뒤 다시 눌러 주세요.';
  const base = (await lastWebBuildOptions(editor)) ?? (await firstBuildOptions(editor));
  if (base === null) return '빌드할 씬이 없어요. 씬을 저장한 뒤 다시 눌러 주세요.';
  const options: BuildOptions = { ...base, packages: { ...base.packages, [PACKAGE_NAME]: { enabled: true, zone } } };
  editor.Message.send('builder', 'open', 'default');
  return messageOf(await editor.Message.request('builder', 'add-task', options, true));
}

/** 웹 빌드를 시작하고 끝까지 기다린다. 실패는 대화상자로 알린다 — 메뉴를 누른 사람은 콘솔을 보고 있지 않을 수 있다. */
export async function buildAndPackage(editor: EditorApi, zone: string = DEFAULT_ZONE_ORIGIN): Promise<void> {
  const problem = await run(editor, zone).catch((error: unknown) => (error instanceof Error ? error.message : String(error)));
  if (problem !== null) await editor.Dialog.error(problem, { title: DIALOG_TITLE });
}

export const methods = {
  buildAndPackage: (): Promise<void> => buildAndPackage(Editor),
  buildAndPackageForLocalZone: (): Promise<void> => buildAndPackage(Editor, LOCAL_ZONE_ORIGIN),
};

let updateNoticeTimer: ReturnType<typeof setTimeout> | undefined;

export function load(): void {
  updateNoticeTimer = setTimeout(() => void notifyUpdate({ editor: Editor, projectDir: Editor.Project.path, version: extensionPackage.version }), UPDATE_NOTICE_DELAY_MS);
}

export function unload(): void {
  clearTimeout(updateNoticeTimer);
}
