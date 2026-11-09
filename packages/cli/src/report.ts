import type { ManifestFile, PackageManifest, PackageWarning } from '../../package-core/src/browser.ts';

/**
 * CLI 보고 글 — build · inspect 가 같은 꼴로 찍는다. 값은 받은 그대로 글자로만 쓴다.
 */
const KB = 1024;
const MB = 1024 * 1024;

export function formatBytes(bytes: number): string {
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)}MB`;
  if (bytes >= KB) return `${(bytes / KB).toFixed(1)}KB`;
  return `${bytes}B`;
}

function largestLines(files: readonly ManifestFile[]): readonly string[] {
  return files.map((file) => `  ${formatBytes(file.size).padStart(8)}  ${(file.encoding ?? '-').padEnd(4)}  ${file.path}`);
}

export function manifestSummary(manifest: PackageManifest, packageBytes: number): readonly string[] {
  return [
    `버전     ${manifest.version}`,
    `이름     ${manifest.title ?? '(없음)'}`,
    `엔진     ${manifest.engine.name}${manifest.engine.version ? ` ${manifest.engine.version}` : ''}`,
    `방향     ${manifest.orientation}`,
    `게임존   ${manifest.zoneOrigin}`,
    `로딩     ${manifest.loading.mode} · 바탕 ${manifest.loading.backgroundColor} · 강조 ${manifest.loading.primaryColor}`,
    `도구     ${manifest.tool.name} ${manifest.tool.version}`,
    `만든 때  ${manifest.createdAt}`,
    `파일     ${manifest.totals.count}개 · 합계 ${formatBytes(manifest.totals.bytes)} · 패키지 ${formatBytes(packageBytes)}`,
  ];
}

export function formatBuildReport(input: {
  readonly outPath: string;
  readonly manifest: PackageManifest;
  readonly packageBytes: number;
  readonly largest: readonly ManifestFile[];
  readonly warnings: readonly PackageWarning[];
}): string {
  const lines = [
    `패키지   ${input.outPath}`,
    ...manifestSummary(input.manifest, input.packageBytes),
    '',
    `큰 파일 ${input.largest.length}개`,
    ...largestLines(input.largest),
  ];
  if (input.warnings.length > 0) {
    lines.push('', `경고 ${input.warnings.length}개`, ...input.warnings.map((item) => `  [${item.code}] ${item.message}`));
  }
  return `${lines.join('\n')}\n`;
}

export function formatDeployReport(input: {
  readonly buildKey: string;
  readonly version: string;
  readonly channel: string;
  readonly fileCount: number;
  readonly totalBytes: number;
  readonly consoleUrl: string;
}): string {
  return `${[
    '올렸어요.',
    `빌드     ${input.buildKey}`,
    `버전     ${input.version}`,
    `채널     ${input.channel}`,
    `파일     ${input.fileCount}개 · ${formatBytes(input.totalBytes)}`,
    '',
    '검수 요청과 출시는 콘솔에서 해 주세요.',
    input.consoleUrl,
  ].join('\n')}\n`;
}

export function formatInspectReport(input: {
  readonly file: string;
  readonly manifest: PackageManifest;
  readonly packageBytes: number;
}): string {
  const largest = [...input.manifest.files].sort((a, b) => b.size - a.size).slice(0, 10);
  return `${[
    `검증 통과 ${input.file}`,
    ...manifestSummary(input.manifest, input.packageBytes),
    '',
    `큰 파일 ${largest.length}개`,
    ...largestLines(largest),
  ].join('\n')}\n`;
}
