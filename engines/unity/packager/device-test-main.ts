import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PackageError } from '../../../packages/package-core/src/browser.ts';
import { startDeviceTest } from './device-test.ts';
import type { UnityPackageRequest } from './package-build.ts';

/**
 * Unity 메뉴가 띄우는 기기 테스트 서버 — `node device-test.mjs <요청 JSON 파일>`. 준비되면 표준 출력에 JSON 한 줄을 쓰고, Unity 가 끄거나 Unity 가 끝날 때까지 돈다.
 * Unity 에 들어 있는 낡은 Node 에서도 돌아야 해서 최상위 await 를 쓰지 않는다.
 */
interface DeviceTestRequest extends UnityPackageRequest {
  readonly parentPid?: number;
}

const PARENT_CHECK_MS = 2000;

function answer(result: unknown): void {
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

/** Unity 가 끝나면 서버도 끝난다 — 스크립트를 다시 컴파일할 때는 Unity 가 살아 있어 서버가 이어진다 */
function exitWithParent(parentPid: number): void {
  setInterval(() => {
    try {
      process.kill(parentPid, 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') process.exit(0);
    }
  }, PARENT_CHECK_MS);
}

async function run(): Promise<void> {
  // 다시 컴파일하면 Unity 쪽 파이프가 닫힌다 — 그 뒤의 쓰기 실패로 서버가 죽지 않게
  process.stdout.on('error', () => undefined);
  process.stderr.on('error', () => undefined);
  try {
    const request = JSON.parse(await readFile(process.argv[2] ?? '', 'utf8')) as DeviceTestRequest;
    const here = path.dirname(fileURLToPath(import.meta.url));
    const started = await startDeviceTest(request, { sdkPaths: [path.join(here, 'v1.js')] });
    if (request.parentPid) exitWithParent(request.parentPid);
    answer(started.answer);
  } catch (error) {
    answer({ ok: false, code: error instanceof PackageError ? error.code : 'INTERNAL', message: error instanceof Error ? error.message : String(error) });
    process.exitCode = 1;
  }
}

void run();
