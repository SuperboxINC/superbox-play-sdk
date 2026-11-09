import { parseArgs, type ParseArgsConfig } from 'node:util';
import packageJson from '../package.json' with { type: 'json' };
import { runBuild, runDeploy, runDev, runInit, runInspect } from './commands.ts';
import { API_KEY_ENV, apiKeysIn } from './deploy.ts';
import { CliError, EXIT_OK, exitCodeOf, describeError } from './errors.ts';

/**
 * `superbox-play` — 게임 빌드 폴더를 패키지 `.sbp` 로 감싸는 도구. 포맷은 개발자 센터의 패키지 문서.
 * 출력은 stdout, 오류는 stderr. 종료 코드는 errors.ts 표 하나.
 */
export const HELP = `superbox-play ${packageJson.version} — 슈퍼박스 플레이 게임 패키지 도구

사용법
  superbox-play init                    설정 파일 superbox.config.json을 만들어요
  superbox-play build [폴더] [옵션]      빌드 폴더를 .sbp로 묶어요
  superbox-play inspect <파일>           패키지를 검증하고 내용을 요약해요
  superbox-play dev [폴더] [옵션]        패키징한 시작 파일로 빌드를 로컬에서 실행해요
  superbox-play deploy <파일> [옵션]     패키지를 콘솔에 올려요 (검수 요청과 출시는 콘솔에서)

build 옵션
  --engine <이름>     unity · cocos · phaser · html5 (기본: 파일 구조로 판단해요)
  --config <경로>     설정 파일 (기본: 현재 폴더, 그다음 빌드 폴더의 superbox.config.json)
  --zone <주소>       게임존 주소 (기본: https://game.superboxgo.com)
  --out <경로>        출력 파일 (기본: 현재 폴더의 <폴더>-<버전>.sbp)
  --keep-maps         *.map 파일도 패키지에 넣어요

dev 옵션
  --port <번호>       포트 (기본: 8300부터 빈 포트)
  --host <주소>       받을 주소 (기본: 127.0.0.1)
  --lan               같은 Wi-Fi의 휴대폰에서 열 수 있게 띄우고 QR 코드를 보여 줘요
  --zone <주소>       게임존 주소 (기본: dev 서버 자신 — 인터넷 없이 시뮬레이션으로 돌아요)
  --config · --engine · --keep-maps  build와 같아요

deploy 옵션
  --game <게임 ID>    콘솔의 게임 ID (필수)
  --channel <키>      채널 키 (필수)
  --note <메모>       빌드 메모
  --console <주소>    콘솔 주소 (기본: https://console.superboxgo.com)
  --api-key <키>      콘솔 API 키 — 명령 기록에 남으니 환경 변수 ${API_KEY_ENV} 를 쓰는 걸 권해요

AI 도구(MCP)는 CLI 없이 콘솔에 연결해요 — https://console.superboxgo.com/mcp 를 등록하고 콘솔 계정으로 로그인해 주세요

공통
  --help · --version
`;

const OPTIONS = {
  engine: { type: 'string' },
  config: { type: 'string' },
  zone: { type: 'string' },
  out: { type: 'string' },
  'keep-maps': { type: 'boolean' },
  port: { type: 'string' },
  host: { type: 'string' },
  lan: { type: 'boolean' },
  force: { type: 'boolean' },
  game: { type: 'string' },
  channel: { type: 'string' },
  note: { type: 'string' },
  console: { type: 'string' },
  'api-key': { type: 'string' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
} satisfies NonNullable<ParseArgsConfig['options']>;

function parse(argv: readonly string[]) {
  try {
    return parseArgs({ args: [...argv], options: OPTIONS, allowPositionals: true });
  } catch (error) {
    throw new CliError('USAGE', error instanceof Error ? error.message : String(error));
  }
}

export interface CliIO {
  out(text: string): void;
  err(text: string): void;
}

/** API 키가 어떤 출력에도 남지 않게 한다 — 서버가 오류 문구에 되돌려 보내도. */
function hidingSecrets(io: CliIO, secrets: readonly string[]): CliIO {
  const hide = (text: string): string => secrets.reduce((result, secret) => result.split(secret).join('***'), text);
  return { out: (text) => io.out(hide(text)), err: (text) => io.err(hide(text)) };
}

/** 시험이 프로세스를 띄우지 않고 부른다. dev 는 끌 때까지 끝나지 않는다. */
export async function main(argv: readonly string[], rawIo: CliIO): Promise<number> {
  const io = hidingSecrets(rawIo, apiKeysIn(argv, process.env[API_KEY_ENV]));
  try {
    const { values, positionals } = parse(argv);
    if (values.version) {
      io.out(`${packageJson.version}\n`);
      return EXIT_OK;
    }
    const [command, ...rest] = positionals;
    if (values.help || !command) {
      io.out(HELP);
      return EXIT_OK;
    }
    switch (command) {
      case 'init':
        await runInit({ force: values.force ?? false }, io);
        return EXIT_OK;
      case 'build':
        await runBuild({ folder: rest[0] ?? '.', values, tool: { name: 'superbox-play', version: packageJson.version } }, io);
        return EXIT_OK;
      case 'inspect': {
        const file = rest[0];
        if (!file) throw new CliError('USAGE', 'inspect <파일>');
        await runInspect(file, io);
        return EXIT_OK;
      }
      case 'dev':
        await runDev({ folder: rest[0], values, toolVersion: packageJson.version }, io);
        return EXIT_OK;
      case 'deploy':
        await runDeploy({ file: rest[0], values, envKey: process.env[API_KEY_ENV], toolVersion: packageJson.version }, io);
        return EXIT_OK;
      default:
        throw new CliError('USAGE', command);
    }
  } catch (error) {
    io.err(`${describeError(error)}\n`);
    return exitCodeOf(error);
  }
}

const isEntry = process.argv[1] !== undefined && /(?:^|[/\\])(?:cli\.(?:js|ts)|superbox-play)$/.test(process.argv[1]);
if (isEntry) {
  const code = await main(process.argv.slice(2), {
    out: (text) => process.stdout.write(text),
    err: (text) => process.stderr.write(text),
  });
  process.exitCode = code;
}
