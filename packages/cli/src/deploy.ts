import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { isLocalZoneOrigin, isZoneOrigin, readPackage, RESERVED_FILE, type OpenedPackage, type PackageFile, type PackageManifest } from '../../package-core/src/browser.ts';
import { assertPackageHashes, openFileBlob, type FileSlice } from '../../package-core/src/index.ts';
import { CliError, cliErrorFromApi } from './errors.ts';
import { NetworkError, sendRequest } from './http-client.ts';
import { formatBytes } from './report.ts';

/**
 * `superbox-play deploy` — 패키지를 콘솔 API 키로 올린다. 콘솔의 빌드 만들기와 같은 요청 · 응답이다.
 * 빌드 만들기 → 파일마다 presigned PUT → complete 까지만 한다. 검수 요청 · 출시는 사람이 콘솔에서 한다.
 *
 * API 키는 Authorization 머리로 콘솔에만 간다 — 저장소 PUT 에는 싣지 않고, 어떤 출력에도 찍지 않는다(cli.ts 가 출력 전체를 한 번 더 가린다).
 */
export const DEFAULT_CONSOLE_ORIGIN = 'https://console.superboxgo.com';
export const API_KEY_ENV = 'SUPERBOX_PLAY_API_KEY';
export const API_KEY_FLAG = '--api-key';

const UPLOAD_CONCURRENCY = 4;
const ATTEMPTS = 3;
const RETRY_DELAYS_MS = [500, 2000] as const;
const API_IDLE_TIMEOUT_MS = 60_000;
const UPLOAD_IDLE_TIMEOUT_MS = 120_000;
const PROGRESS_STEP = 0.1;
const CONTENT_TYPE_JSON = 'application/json';
/** 저장소가 본문과 체크섬이 다를 때 내는 코드 — S3 호환 저장소. */
const CHECKSUM_ERROR = /BadDigest|ChecksumMismatch|InvalidDigest|InvalidChecksum|XAmzContentSHA256Mismatch/;
const STORAGE_ERROR_CODE = /<Code>([A-Za-z0-9.]{1,64})<\/Code>/;
const STATUS_PRECONDITION_FAILED = 412;
/** 머리에 실을 수 있는 글자 — 복사하다 끼어든 공백 · 한글을 서버에 묻기 전에 막는다. */
const HEADER_TOKEN = /^[\x21-\x7E]+$/;
/** 응답 머리 중 우리가 정하는 칸 — 키는 저장소로 보내지 않고, 길이는 서명값이라 파일 크기로 싣는다. */
const OWN_UPLOAD_HEADERS = new Set(['authorization', 'content-length']);

export interface DeployOptions {
  readonly file: string;
  readonly game: string;
  readonly channel: string;
  readonly note?: string | undefined;
  readonly consoleOrigin: string;
  readonly apiKey: string;
  out(text: string): void;
  /** 시험이 기다림을 줄인다. */
  sleep?(ms: number): Promise<void>;
}

export interface DeployResult {
  readonly buildKey: string;
  readonly version: string;
  readonly fileCount: number;
  readonly totalBytes: number;
  readonly consoleUrl: string;
}

interface UploadInstruction {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
}

interface UploadJob {
  readonly path: string;
  readonly size: number;
  readonly instruction: UploadInstruction;
  readonly body: Uint8Array | (() => Readable);
}

type Sleep = (ms: number) => Promise<void>;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 키를 보내도 되는 출처인지 — http 는 로컬만. 평문으로 키가 나가지 않게 한다. */
export function assertConsoleOrigin(origin: string): void {
  if (!isZoneOrigin(origin) || (origin.startsWith('http:') && !isLocalZoneOrigin(origin))) throw new CliError('CONSOLE_ORIGIN_INVALID', origin);
}

/** 옵션이 환경 변수보다 앞선다. */
export function resolveApiKey(option: string | undefined, envValue: string | undefined): string {
  const key = (option ?? envValue ?? '').trim();
  if (!key) throw new CliError('API_KEY_MISSING');
  if (!HEADER_TOKEN.test(key)) throw new CliError('CONSOLE_API_KEY_INVALID');
  return key;
}

/** 출력에서 가릴 값 — 옵션을 파싱하기 전에 argv 에서 찾는다. 옵션이 틀려 파싱이 실패해도 가려야 한다. */
export function apiKeysIn(argv: readonly string[], envValue: string | undefined): readonly string[] {
  const fromArgs = argv.flatMap((arg, index) => {
    if (arg === API_KEY_FLAG) return [argv[index + 1] ?? ''];
    return arg.startsWith(`${API_KEY_FLAG}=`) ? [arg.slice(API_KEY_FLAG.length + 1)] : [];
  });
  return [...fromArgs, envValue ?? ''].map((key) => key.trim()).filter((key) => key.length > 0);
}

/** 서버 요약은 manifest 의 아는 칸만 — 파일 목록은 sbp-manifest.json 으로 따로 올라간다. */
function packageSummary(manifest: PackageManifest): Readonly<Record<string, unknown>> {
  return {
    format: manifest.format,
    engine: manifest.engine,
    tool: manifest.tool,
    zoneOrigin: manifest.zoneOrigin,
    orientation: manifest.orientation,
    title: manifest.title,
    loading: manifest.loading,
    createdAt: manifest.createdAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

function readInstructions(raw: unknown): ReadonlyMap<string, UploadInstruction> {
  if (!Array.isArray(raw)) throw new CliError('SERVER_RESPONSE_INVALID', 'uploads');
  const instructions = new Map<string, UploadInstruction>();
  for (const item of raw as readonly unknown[]) {
    if (!isRecord(item) || typeof item.path !== 'string' || typeof item.url !== 'string' || !isHttpUrl(item.url) || !isRecord(item.headers)) {
      throw new CliError('SERVER_RESPONSE_INVALID', 'uploads[]');
    }
    const headers = Object.entries(item.headers).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && !OWN_UPLOAD_HEADERS.has(entry[0].toLowerCase()));
    instructions.set(item.path, { url: item.url, headers: Object.fromEntries(headers) });
  }
  return instructions;
}

function fileBody(file: string, entry: PackageFile<FileSlice>): Uint8Array | (() => Readable) {
  // 빈 파일은 createReadStream 의 end 로 나타낼 수 없다
  if (entry.size === 0) return new Uint8Array(0);
  return () => createReadStream(file, { start: entry.offset, end: entry.offset + entry.size - 1 });
}

async function callApi(options: DeployOptions, path: string, body?: unknown): Promise<unknown> {
  const response = await sendRequest({
    method: 'POST',
    url: `${options.consoleOrigin}${path}`,
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      Accept: CONTENT_TYPE_JSON,
      ...(body === undefined ? {} : { 'Content-Type': CONTENT_TYPE_JSON }),
    },
    ...(body === undefined ? {} : { body: new TextEncoder().encode(JSON.stringify(body)) }),
    idleTimeoutMs: API_IDLE_TIMEOUT_MS,
  });
  const parsed = parseJson(response.text);
  if (response.status >= 200 && response.status < 300) return parsed;
  throw cliErrorFromApi(response.status, isRecord(parsed) ? parsed : {});
}

function rejectionOf(job: UploadJob, status: number, text: string): CliError {
  if (CHECKSUM_ERROR.test(text)) return new CliError('PACKAGE_CORRUPT', job.path);
  const storageCode = STORAGE_ERROR_CODE.exec(text)?.[1];
  return new CliError('UPLOAD_REJECTED', `${job.path} — ${status}${storageCode ? ` ${storageCode}` : ''}`);
}

/** 한 번 보낸다 — 끝났으면 true, 다시 보낼 만하면 false, 거절이면 던진다. */
async function tryPut(job: UploadJob, attempt: number): Promise<boolean> {
  let status: number;
  let text: string;
  try {
    ({ status, text } = await sendRequest({
      method: 'PUT',
      url: job.instruction.url,
      headers: { ...job.instruction.headers, 'Content-Length': String(job.size) },
      body: job.body,
      idleTimeoutMs: UPLOAD_IDLE_TIMEOUT_MS,
    }));
  } catch (error) {
    if (error instanceof NetworkError) return false;
    throw error;
  }
  if (status >= 200 && status < 300) return true;
  // 앞 시도가 실제로는 들어갔는데 응답만 잃었다 — 키마다 한 번만 쓰는 PUT 이라 다른 쓰기는 없다. 내용은 체크섬이, 개수는 complete 가 본다
  if (status === STATUS_PRECONDITION_FAILED && attempt > 1) return true;
  if (status >= 500) return false;
  throw rejectionOf(job, status, text);
}

/** 5xx · 네트워크만 다시, 4xx 는 바로 실패. */
async function putFile(job: UploadJob, sleep: Sleep): Promise<void> {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    if (await tryPut(job, attempt)) return;
    if (attempt < ATTEMPTS) await sleep(RETRY_DELAYS_MS[attempt - 1] ?? 0);
  }
  throw new CliError('UPLOAD_FAILED', job.path);
}

/** 동시 4개. 하나가 끝내 실패하면 새 파일을 시작하지 않는다. */
async function uploadAll(jobs: readonly UploadJob[], out: (text: string) => void, sleep: Sleep): Promise<void> {
  const total = jobs.reduce((sum, job) => sum + job.size, 0);
  let next = 0;
  let doneBytes = 0;
  let reported = 0;
  let stopped = false;
  const worker = async (): Promise<void> => {
    for (let job = jobs[next]; job && !stopped; job = jobs[next]) {
      next += 1;
      try {
        await putFile(job, sleep);
      } catch (error) {
        stopped = true;
        throw error;
      }
      doneBytes += job.size;
      const fraction = total > 0 ? doneBytes / total : 1;
      if (fraction - reported >= PROGRESS_STEP) {
        reported = fraction;
        out(`  ${Math.round(fraction * 100)}% · ${formatBytes(doneBytes)} / ${formatBytes(total)}\n`);
      }
    }
  };
  const settled = await Promise.allSettled(Array.from({ length: UPLOAD_CONCURRENCY }, () => worker()));
  const failed = settled.find((result): result is PromiseRejectedResult => result.status === 'rejected');
  if (failed) throw failed.reason;
}

/** 다시 불러도 같은 호출이라 일시 장애는 다시 부른다. 그 밖의 거절은 올리기가 어긋났다는 뜻이라 그대로 알린다. */
async function completeBuild(options: DeployOptions, path: string, sleep: Sleep): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await callApi(options, path);
      return;
    } catch (error) {
      const unavailable = error instanceof NetworkError ? new CliError('SERVER_UNAVAILABLE') : error;
      if (!(unavailable instanceof CliError) || unavailable.code !== 'SERVER_UNAVAILABLE' || attempt >= ATTEMPTS) throw unavailable;
      await sleep(RETRY_DELAYS_MS[attempt - 1] ?? 0);
    }
  }
}

/** 다시 부르지 않는다 — 앞 호출이 들어갔다면 같은 버전이 겹쳐 409 가 되고, 두 번째 빌드 행만 남는다. */
async function createBuild(options: DeployOptions, opened: OpenedPackage<FileSlice>, manifestRow: Readonly<Record<string, unknown>>, gamePath: string): Promise<unknown> {
  const { manifest } = opened;
  try {
    return await callApi(options, `${gamePath}/builds`, {
      partnerKey: options.channel,
      version: manifest.version,
      entryPath: manifest.entry,
      ...(options.note === undefined ? {} : { note: options.note }),
      package: packageSummary(manifest),
      files: [...manifest.files.map((file) => ({ path: file.path, size: file.size, sha256: file.sha256, encoding: file.encoding })), manifestRow],
    });
  } catch (error) {
    if (error instanceof NetworkError) throw new CliError('SERVER_UNAVAILABLE');
    throw error;
  }
}

export async function deployPackage(options: DeployOptions): Promise<DeployResult> {
  const sleep = options.sleep ?? defaultSleep;
  const blob = await openFileBlob(options.file);
  try {
    const opened = await readPackage(blob);
    // 올리기 전에 내용을 대조한다 — 어차피 저장소가 거절할 파일로 빌드 행을 남기지 않는다
    await assertPackageHashes(blob, opened);
    const { manifest } = opened;
    const manifestBytes = new Uint8Array(await opened.manifestFile.slice().arrayBuffer());
    const manifestRow = { path: RESERVED_FILE, size: manifestBytes.length, sha256: createHash('sha256').update(manifestBytes).digest('hex'), encoding: null };
    const totalBytes = manifest.totals.bytes + manifestBytes.length;
    const fileCount = manifest.totals.count + 1;
    const gamePath = `/api/v1/console/ci/games/${encodeURIComponent(options.game)}`;

    options.out(`빌드 만드는 중 ${options.game} · ${options.channel} · ${manifest.version}\n`);
    const created = await createBuild(options, opened, manifestRow, gamePath);
    if (!isRecord(created) || !isRecord(created.build) || typeof created.build.buildKey !== 'string') throw new CliError('SERVER_RESPONSE_INVALID', 'build');
    const { buildKey } = created.build;
    const instructions = readInstructions(created.uploads);

    const jobFor = (path: string, size: number, body: UploadJob['body']): UploadJob => {
      const instruction = instructions.get(path);
      if (!instruction) throw new CliError('SERVER_RESPONSE_INVALID', path);
      return { path, size, instruction, body };
    };
    const jobs = [...opened.files.map((entry) => jobFor(entry.path, entry.size, fileBody(options.file, entry))), jobFor(RESERVED_FILE, manifestBytes.length, manifestBytes)];

    options.out(`파일 올리는 중 ${fileCount}개 · ${formatBytes(totalBytes)}\n`);
    try {
      await uploadAll(jobs, options.out, sleep);
      await completeBuild(options, `${gamePath}/builds/${encodeURIComponent(buildKey)}/complete`, sleep);
    } catch (error) {
      // 같은 채널 · 같은 버전은 끝나지 않은 빌드여도 다시 만들 수 없다
      options.out(`빌드 ${buildKey}는 완료되지 않았어요. 다시 올리려면 version을 올리고 패키지를 다시 만들어 주세요.\n`);
      throw error;
    }

    const query = new URLSearchParams({ channel: options.channel, id: buildKey });
    return {
      buildKey,
      version: manifest.version,
      fileCount,
      totalBytes,
      consoleUrl: `${options.consoleOrigin}/games/${encodeURIComponent(options.game)}/release?${query.toString()}`,
    };
  } finally {
    await blob.close();
  }
}
