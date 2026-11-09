import path from 'node:path';
import { checkSdkPolicy } from '../../../../packages/package-core/src/index.ts';
import extensionPackage from '../package.json' with { type: 'json' };
import { readBuildOptions } from './builder.ts';
import { packageCocosBuild } from './package-build.ts';

/**
 * 빌드 훅 — 빌더가 `web-mobile` · `web-desktop` 빌드 끝에 부른다. 패키징이 실패하면 빌드 실패로 알린다(throwError):
 * 게임사가 낡은 .sbp 를 새것으로 알고 올리지 않게.
 */
export const throwError = true;

interface BuildTaskOptions {
  readonly platform: string;
  readonly packages?: Readonly<Record<string, unknown>>;
}

interface BuildResult {
  readonly dest: string;
}

declare const Editor: { readonly Project?: { readonly path?: string } } | undefined;

function projectDir(dest: string): string {
  const fromEditor = typeof Editor === 'undefined' ? undefined : Editor?.Project?.path;
  return fromEditor ?? path.resolve(dest, '../..');
}

export async function onAfterBuild(options: BuildTaskOptions, result: BuildResult): Promise<void> {
  const { enabled, zone } = readBuildOptions(options.packages);
  if (!enabled) return;
  const verdict = await checkSdkPolicy(extensionPackage.version);
  if (verdict.kind === 'blocked') throw new Error(verdict.message);
  if (verdict.kind === 'update-recommended') console.warn(`[superbox-play] ${verdict.message}`);
  const report = await packageCocosBuild({ dest: result.dest, projectDir: projectDir(result.dest), zoneOrigin: zone });
  console.info(`[superbox-play] ${report.outPath} (${report.manifest.totals.count}개 파일, ${report.packageBytes}B)`);
  for (const item of report.warnings) console.warn(`[superbox-play] ${item.code}: ${item.message}`);
}
