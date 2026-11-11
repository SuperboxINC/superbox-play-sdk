/**
 * 부트 런타임 묶기 — src/boot.ts · src/debug-console.ts · 기본 로딩 화면을 최소화해 package-core 의 생성 파일로 넣는다.
 * 게임 문서 맨 앞에 인라인으로 들어가므로 크기가 곧 첫 화면 시간이다 — 예산을 넘으면 빌드를 멈춘다.
 * 대상은 Play SDK(web/scripts/build-play-sdk.mjs)와 같다 — 대형 앱 WebView 최소선.
 */
import { build, transform } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const TARGET = ['es2020', 'safari14.1', 'chrome80'];
const OUTPUT = path.join(here, '../package-core/src/runtime-assets.generated.ts');

// 13 → 14KB — Unity 기기 저장 자리 고정(unity.ts stableDocumentUrl)이 +0.5KB, 새 버전마다 진행 · 게스트 계정이 지워지던 것을 막는 값이다
export const BOOT_BUDGET_BYTES = 14 * 1024;
export const LOADING_BUDGET_BYTES = 3 * 1024;

async function bundle(entry) {
  const result = await build({
    absWorkingDir: here,
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: TARGET,
    minify: true,
    charset: 'ascii',
    legalComments: 'none',
    logLevel: 'silent',
  });
  return result.outputFiles[0].text.trim();
}

async function loadingTemplate() {
  const css = await readFile(path.join(here, 'src/loading.css'), 'utf8');
  const html = await readFile(path.join(here, 'src/loading.html'), 'utf8');
  const minified = await transform(css, { loader: 'css', minify: true, target: TARGET, logLevel: 'silent' });
  return html
    .replace(/\n\s*/g, '')
    .replace('%%CSS%%', minified.code.trim());
}

export async function buildRuntime() {
  const bootJs = await bundle('src/boot.ts');
  const debugConsoleJs = await bundle('src/debug-console.ts');
  const template = await loadingTemplate();

  if (/<\/script|<!--/i.test(bootJs)) throw new Error('부트 스크립트에 문서를 끊는 글자가 있다');
  const bootBytes = Buffer.byteLength(bootJs);
  const loadingBytes = Buffer.byteLength(template);
  if (bootBytes > BOOT_BUDGET_BYTES) throw new Error(`부트 스크립트 ${bootBytes}B — 예산 ${BOOT_BUDGET_BYTES}B 를 넘었다`);
  if (loadingBytes > LOADING_BUDGET_BYTES) throw new Error(`기본 로딩 화면 ${loadingBytes}B — 예산 ${LOADING_BUDGET_BYTES}B 를 넘었다`);

  await writeFile(
    OUTPUT,
    [
      '// 생성 파일 — packages/runtime/build.mjs 가 쓴다. 고치지 말고 packages/runtime/src 를 고친다.',
      `export const BOOT_JS = ${JSON.stringify(bootJs)};`,
      `export const LOADING_TEMPLATE = ${JSON.stringify(template)};`,
      `export const DEBUG_CONSOLE_JS = ${JSON.stringify(debugConsoleJs)};`,
      `export const RUNTIME_SIZES = { bootBytes: ${bootBytes}, loadingBytes: ${loadingBytes}, bootBudget: ${BOOT_BUDGET_BYTES}, loadingBudget: ${LOADING_BUDGET_BYTES} } as const;`,
      '',
    ].join('\n'),
  );
  return { bootBytes, loadingBytes };
}
