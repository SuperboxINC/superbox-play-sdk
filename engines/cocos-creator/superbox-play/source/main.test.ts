import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_ZONE_ORIGIN, PACKAGE_NAME } from './builder.ts';
import { buildAndPackage, BUILD_BUSY, BUILD_PARAM_ERROR, BUILD_SUCCESS, type EditorApi, LOCAL_ZONE_ORIGIN } from './main.ts';

interface FakeBuilder {
  readonly ready?: boolean;
  readonly tasks?: readonly unknown[];
  readonly scenes?: readonly { readonly uuid: string; readonly url: string }[];
  readonly result?: number;
}

/** 에디터 대역 — 받은 메시지를 적어 두고, 실제 Creator 3.8.8 에서 본 답 모양을 돌려준다. */
function fakeEditor(builder: FakeBuilder = {}): { readonly editor: EditorApi; readonly sent: unknown[][]; readonly errors: string[] } {
  const sent: unknown[][] = [];
  const errors: string[] = [];
  const editor: EditorApi = {
    Message: {
      async request(pkg, message, ...args) {
        sent.push([pkg, message, ...args]);
        if (message === 'query-worker-ready') return builder.ready ?? true;
        if (message === 'query-tasks-info') return { list: builder.tasks ?? [], queue: {}, free: true };
        if (message === 'query-assets') return builder.scenes ?? [{ uuid: 'scene-main', url: 'db://assets/scene/Main.scene' }];
        if (message === 'check-and-complete-options') return { ...(args[0] as object), outputName: 'web-mobile', packages: { 'web-mobile': { orientation: 'auto' }, [PACKAGE_NAME]: { enabled: true, zone: DEFAULT_ZONE_ORIGIN } } };
        if (message === 'add-task') return builder.result ?? BUILD_SUCCESS;
        throw new Error(`no fake for ${message}`);
      },
      send(pkg, message, ...args) {
        sent.push([pkg, message, ...args]);
      },
    },
    Dialog: {
      async error(message) {
        errors.push(message);
      },
    },
  };
  return { editor, sent, errors };
}

function addedOptions(sent: readonly unknown[][]): Record<string, any> {
  const call = sent.find((item) => item[1] === 'add-task');
  assert.ok(call, 'no build was started');
  assert.equal(call[3], true, 'waits for the build to end');
  return call[2] as Record<string, any>;
}

describe('상단 메뉴 Build & Package', () => {
  it('처음에는 프로젝트의 첫 씬으로 Web Mobile 을 빌드하고 패키지를 켠다', async () => {
    const { editor, sent, errors } = fakeEditor();

    await buildAndPackage(editor);

    const options = addedOptions(sent);
    assert.equal(options.platform, 'web-mobile');
    assert.equal(options.startScene, 'scene-main');
    assert.deepEqual(options.packages[PACKAGE_NAME], { enabled: true, zone: DEFAULT_ZONE_ORIGIN });
    assert.deepEqual(errors, []);
  });

  it('처음 빌드의 빠진 설정은 빌더가 채운 값을 쓴다 — 다른 플랫폼 칸까지 있어야 빌드가 끝난다', async () => {
    const { editor, sent } = fakeEditor();

    await buildAndPackage(editor);

    const options = addedOptions(sent);
    assert.equal(options.outputName, 'web-mobile');
    assert.deepEqual(options.packages['web-mobile'], { orientation: 'auto' });
  });

  it('프로젝트 씬만 찾는다 — 엔진 내장 씬은 시작 씬이 될 수 없다', async () => {
    const { editor, sent } = fakeEditor();

    await buildAndPackage(editor);

    const query = sent.find((item) => item[1] === 'query-assets');
    assert.deepEqual(query?.[2], { ccType: 'cc.SceneAsset', pattern: 'db://assets/**' });
  });

  it('빌드 패널을 열어 진행 상황이 보이게 한다', async () => {
    const { editor, sent } = fakeEditor();

    await buildAndPackage(editor);

    assert.ok(sent.some((item) => item[0] === 'builder' && item[1] === 'open' && item[2] === 'default'));
  });

  it('지난 웹 빌드가 있으면 가장 최근 설정을 다시 쓰고, 로그 경로와 작업 번호는 넘기지 않는다', async () => {
    const older = { id: '100', type: 'build', state: 'success', options: { platform: 'web-desktop', startScene: 'old' } };
    const latest = {
      id: '200',
      type: 'build',
      state: 'success',
      options: { platform: 'web-mobile', startScene: 'custom', md5Cache: true, logDest: 'project://temp/a.log', id: '200', taskId: '200', packages: { other: { a: 1 } } },
    };
    const native = { id: '300', type: 'build', state: 'success', options: { platform: 'android', startScene: 'native' } };
    const { editor, sent } = fakeEditor({ tasks: [older, latest, native] });

    await buildAndPackage(editor);

    const options = addedOptions(sent);
    assert.equal(options.startScene, 'custom');
    assert.equal(options.md5Cache, true);
    assert.equal(options.logDest, undefined);
    assert.equal(options.id, undefined);
    assert.equal(options.taskId, undefined);
    assert.deepEqual(options.packages.other, { a: 1 });
    assert.ok(!sent.some((item) => item[1] === 'query-assets'));
  });

  it('지난 빌드에서 패키지를 껐거나 로컬 주소였어도 메뉴는 운영 게임존 패키지를 만든다', async () => {
    const task = { id: '1', type: 'build', state: 'success', options: { platform: 'web-mobile', startScene: 's', packages: { [PACKAGE_NAME]: { enabled: false, zone: LOCAL_ZONE_ORIGIN } } } };
    const { editor, sent } = fakeEditor({ tasks: [task] });

    await buildAndPackage(editor);

    assert.deepEqual(addedOptions(sent).packages[PACKAGE_NAME], { enabled: true, zone: DEFAULT_ZONE_ORIGIN });
  });

  it('실패한 지난 빌드의 설정은 다시 쓰지 않는다', async () => {
    const failed = { id: '9', type: 'build', state: 'failure', options: { platform: 'web-mobile', startScene: 'deleted' } };
    const { editor, sent } = fakeEditor({ tasks: [failed] });

    await buildAndPackage(editor);

    assert.equal(addedOptions(sent).startScene, 'scene-main');
  });

  it('로컬 게임존 메뉴는 로컬 주소로 묶는다', async () => {
    const { editor, sent } = fakeEditor();

    await buildAndPackage(editor, LOCAL_ZONE_ORIGIN);

    assert.equal(addedOptions(sent).packages[PACKAGE_NAME].zone, LOCAL_ZONE_ORIGIN);
  });

  it('씬이 없으면 빌드하지 않고 알린다', async () => {
    const { editor, sent, errors } = fakeEditor({ scenes: [] });

    await buildAndPackage(editor);

    assert.ok(!sent.some((item) => item[1] === 'add-task'));
    assert.match(errors[0] ?? '', /씬/);
  });

  it('빌더가 준비되지 않았으면 기다리지 않고 알린다', async () => {
    const { editor, sent, errors } = fakeEditor({ ready: false });

    await buildAndPackage(editor);

    assert.ok(!sent.some((item) => item[1] === 'add-task'));
    assert.match(errors[0] ?? '', /준비/);
  });

  for (const [result, pattern] of [
    [BUILD_BUSY, /진행 중/],
    [BUILD_PARAM_ERROR, /설정/],
    [34, /콘솔/],
  ] as const) {
    it(`빌드 결과 ${result} 는 까닭을 알린다`, async () => {
      const { editor, errors } = fakeEditor({ result });

      await buildAndPackage(editor);

      assert.match(errors[0] ?? '', pattern);
    });
  }

  it('예상하지 못한 오류도 대화상자로 알린다', async () => {
    const { editor, errors } = fakeEditor();
    const broken: EditorApi = {
      ...editor,
      Message: {
        ...editor.Message,
        async request() {
          throw new Error('boom');
        },
      },
    };

    await buildAndPackage(broken);

    assert.match(errors[0] ?? '', /boom/);
  });
});
