import { open, readFile } from 'node:fs/promises';
import { brotliDecompress, constants, gunzip } from 'node:zlib';
import { detectEncoding, ENCODING_HEAD_BYTES } from '../encoding.ts';
import type { BuildFileEntry } from './walk.ts';

/**
 * Unity 버전 찾기 — 값은 콘솔 표시에만 쓴다. 로더 · 프레임워크에는 버전이 없고 `.data` 앞부분에 있다(실제 빌드 6000.3.27f1 로 확인).
 * 앞 조각만 풀어 본다. 못 찾으면 null 이고 패키징은 그대로 간다.
 */
const DATA_FILE = /(^|\/)[^/]+\.data(\.(br|gz|unityweb))?$/;
const VERSION = /\b(?:20\d\d|[6-9]\d{3})\.\d+\.\d+[abfp]\d+\b/;
const HEAD_BYTES = 256 * 1024;

function decompressHead(bytes: Uint8Array, encoding: 'br' | 'gzip'): Promise<Buffer> {
  return new Promise((resolve) => {
    // 앞 조각만 넣으므로 끝이 없다는 오류가 정상이다 — 나온 만큼만 받는다
    const options = { finishFlush: encoding === 'br' ? constants.BROTLI_OPERATION_FLUSH : constants.Z_SYNC_FLUSH };
    const done = (error: Error | null, out: Buffer): void => resolve(error ? Buffer.alloc(0) : out);
    if (encoding === 'br') brotliDecompress(bytes, options, done);
    else gunzip(bytes, options, done);
  });
}

async function readHead(path: string): Promise<Uint8Array> {
  const handle = await open(path, 'r');
  try {
    const buffer = new Uint8Array(HEAD_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, HEAD_BYTES, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

async function versionFromBuildInfo(files: readonly BuildFileEntry[]): Promise<string | null> {
  const info = files.find((file) => file.path === '.ait-build-info.json');
  if (!info) return null;
  try {
    const parsed: unknown = JSON.parse(await readFile(info.absolute, 'utf8'));
    const version = (parsed as { unityVersion?: unknown }).unityVersion;
    return typeof version === 'string' && VERSION.test(version) ? version : null;
  } catch {
    return null;
  }
}

export async function readUnityVersion(files: readonly BuildFileEntry[]): Promise<string | null> {
  const fromInfo = await versionFromBuildInfo(files);
  if (fromInfo) return fromInfo;
  const data = files.find((file) => DATA_FILE.test(file.path));
  if (!data) return null;
  try {
    const head = await readHead(data.absolute);
    const encoding = detectEncoding(data.path, head.subarray(0, ENCODING_HEAD_BYTES));
    const text = encoding ? await decompressHead(head, encoding) : Buffer.from(head);
    return VERSION.exec(text.toString('latin1'))?.[0] ?? null;
  } catch {
    return null;
  }
}
