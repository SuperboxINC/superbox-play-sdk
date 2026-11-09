import { readFile } from 'node:fs/promises';
import { PackageError } from '../../../packages/package-core/src/browser.ts';
import { packageUnityBuild, type UnityPackageRequest } from './package-build.ts';

/**
 * Unity 메뉴가 실행하는 입구 — `node package-build.mjs <요청 JSON 파일>`. 인자로 넘기지 않는 까닭은 Windows 명령줄이 한글 게임 이름을 깨뜨리기 때문이다.
 * 표준 출력에 결과 JSON 한 줄만 쓴다. 실패도 같은 모양이고 종료 코드만 다르다.
 * Unity 에 들어 있는 낡은 Node 에서도 돌아야 해서 최상위 await 를 쓰지 않는다.
 */
function answer(result: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

async function run(): Promise<void> {
  try {
    const request = JSON.parse(await readFile(process.argv[2] ?? '', 'utf8')) as UnityPackageRequest;
    const report = await packageUnityBuild(request);
    answer({ ok: true, outPath: report.outPath, files: report.manifest.totals.count, bytes: report.packageBytes, warnings: report.warnings });
  } catch (error) {
    answer({ ok: false, code: error instanceof PackageError ? error.code : 'INTERNAL', message: error instanceof Error ? error.message : String(error) });
    process.exitCode = 1;
  }
}

void run();
