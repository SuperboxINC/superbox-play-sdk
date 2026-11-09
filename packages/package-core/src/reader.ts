import { PackageError } from './errors.ts';
import {
  isSafeBuildPath,
  MANIFEST_ENTRY,
  MAX_BUILD_BYTES,
  MAX_BUILD_FILES,
  MAX_MANIFEST_BYTES,
  MAX_PATH_LENGTH,
  RESERVED_FILE,
  WEB_PREFIX,
} from './limits.ts';
import { parseManifest, type ManifestFile, type PackageManifest } from './manifest.ts';
import {
  CENTRAL_HEADER_SIZE,
  EOCD_SIZE,
  findEocd,
  FLAG_DATA_DESCRIPTOR,
  FLAG_ENCRYPTED,
  LOCAL_HEADER_SIZE,
  MAX_COMMENT_SIZE,
  MODE_REGULAR,
  MODE_SYMLINK,
  MODE_TYPE_MASK,
  parseCentralDirectory,
  parseLocalHeader,
  UNIX_HOST,
  ZIP64_LOCATOR_SIGNATURE,
  ZIP64_LOCATOR_SIZE,
  type CentralEntry,
} from './zip-format.ts';

/**
 * .sbp 읽기 — 패키지 포맷 규격 1장의 거절 규칙. 콘솔 웹이 그대로 쓴다.
 * `Blob.slice` 만 쓰고 파일을 통째로 메모리에 올리지 않는다 — 500MB 를 풀지 않고 항목을 잘라 presigned PUT 으로 올린다.
 * CLI 는 같은 함수에 파일을 감싼 조각(node/file-blob)을 넘긴다. 브라우저에서도 돈다 — Node API 를 쓰지 않는다.
 */
export interface BlobSliceLike {
  arrayBuffer(): Promise<ArrayBuffer>;
}

/** `File` · `Blob` 이면 된다. slice 의 결과는 그대로 PUT 본문이 될 수 있다. */
export interface BlobLike<TSlice extends BlobSliceLike = BlobSliceLike> {
  readonly size: number;
  slice(start: number, end: number): TSlice;
}

export interface PackageFile<TSlice extends BlobSliceLike = BlobSliceLike> extends ManifestFile {
  /** 패키지 안에서 내용이 시작하는 위치. */
  readonly offset: number;
  /** 이 항목만 잘라 낸 조각 — 메모리에 올리지 않는다. */
  slice(): TSlice;
}

export interface OpenedPackage<TSlice extends BlobSliceLike = BlobSliceLike> {
  readonly manifest: PackageManifest;
  /** manifest.files 차례. */
  readonly files: readonly PackageFile<TSlice>[];
  /** manifest.json 원문 — 올리는 쪽이 빌드 폴더에 `sbp-manifest.json` 으로 함께 올린다(2장). */
  readonly manifestFile: { readonly path: typeof RESERVED_FILE; readonly size: number; slice(): TSlice };
}

/** 머리 · 목록이 차지할 수 있는 몫 — 합계 상한에 이만큼 더한 파일까지만 열어 본다. */
const MAX_OVERHEAD_PER_ENTRY = LOCAL_HEADER_SIZE + CENTRAL_HEADER_SIZE + MAX_PATH_LENGTH * 2;
const MAX_CENTRAL_BYTES = (MAX_BUILD_FILES + 1) * (CENTRAL_HEADER_SIZE + MAX_PATH_LENGTH + 64);
const MAX_PACKAGE_BYTES = MAX_BUILD_BYTES + MAX_MANIFEST_BYTES + (MAX_BUILD_FILES + 1) * MAX_OVERHEAD_PER_ENTRY + EOCD_SIZE;
/** 항목 머리를 한 번에 읽는 수 — 2,000개를 한꺼번에 열어도 브라우저가 버티게. */
const HEADER_READ_CONCURRENCY = 32;

async function readBytes(blob: BlobLike, start: number, end: number): Promise<Uint8Array> {
  return new Uint8Array(await blob.slice(start, end).arrayBuffer());
}

async function readCentralEntries(blob: BlobLike): Promise<{ readonly entries: readonly CentralEntry[]; readonly centralOffset: number }> {
  const size = blob.size;
  if (size < EOCD_SIZE) throw new PackageError('ZIP_INVALID');
  if (size > MAX_PACKAGE_BYTES) throw new PackageError('TOO_LARGE', String(size));
  const tailStart = Math.max(0, size - EOCD_SIZE - MAX_COMMENT_SIZE);
  const eocd = findEocd(await readBytes(blob, tailStart, size), tailStart);
  if (!eocd) throw new PackageError('ZIP_INVALID');

  // 값이 차서 0xFFFF · 0xFFFFFFFF 면 ZIP64 다. 분할은 디스크 번호로 드러난다
  if (eocd.entries === 0xffff || eocd.centralSize === 0xffffffff || eocd.centralOffset === 0xffffffff) {
    throw new PackageError('ZIP_UNSUPPORTED', 'ZIP64');
  }
  if (eocd.diskNumber !== 0 || eocd.centralDisk !== 0 || eocd.entriesOnDisk !== eocd.entries) {
    throw new PackageError('ZIP_UNSUPPORTED', 'split');
  }
  if (eocd.offset >= ZIP64_LOCATOR_SIZE) {
    const locator = await readBytes(blob, eocd.offset - ZIP64_LOCATOR_SIZE, eocd.offset);
    if (new DataView(locator.buffer).getUint32(0, true) === ZIP64_LOCATOR_SIGNATURE) throw new PackageError('ZIP_UNSUPPORTED', 'ZIP64');
  }
  if (eocd.entries === 0) throw new PackageError('FIRST_NOT_MANIFEST');
  if (eocd.entries > MAX_BUILD_FILES + 1) throw new PackageError('TOO_MANY_FILES', String(eocd.entries - 1));
  if (eocd.centralSize > MAX_CENTRAL_BYTES || eocd.centralOffset + eocd.centralSize !== eocd.offset) throw new PackageError('ZIP_INVALID');

  const entries = parseCentralDirectory(await readBytes(blob, eocd.centralOffset, eocd.offset), eocd.entries);
  if (!entries) throw new PackageError('ZIP_INVALID');
  return { entries, centralOffset: eocd.centralOffset };
}

/** 목록 칸만으로 거절할 수 있는 것 — 저장 방식 · 암호화 · 링크 · 경로. */
function assertEntryAllowed(entry: CentralEntry, index: number): void {
  if (entry.flags & FLAG_ENCRYPTED) throw new PackageError('ZIP_UNSUPPORTED', 'encrypted');
  if (entry.flags & FLAG_DATA_DESCRIPTOR) throw new PackageError('ZIP_UNSUPPORTED', 'data descriptor');
  if (entry.hasZip64Extra || entry.size === 0xffffffff || entry.compressedSize === 0xffffffff || entry.localOffset === 0xffffffff) {
    throw new PackageError('ZIP_UNSUPPORTED', 'ZIP64');
  }
  if (entry.method !== 0 || entry.compressedSize !== entry.size) throw new PackageError('NOT_STORED', entry.name);
  if (entry.madeByHost === UNIX_HOST) {
    const type = entry.unixMode & MODE_TYPE_MASK;
    if (type === MODE_SYMLINK) throw new PackageError('SYMLINK', entry.name);
    if (type !== 0 && type !== MODE_REGULAR) throw new PackageError('PATH_UNSAFE', entry.name);
  }
  if (index === 0) {
    if (entry.name !== MANIFEST_ENTRY || entry.localOffset !== 0) throw new PackageError('FIRST_NOT_MANIFEST', entry.name);
    return;
  }
  if (!entry.name.startsWith(WEB_PREFIX)) throw new PackageError('OUTSIDE_WEB', entry.name);
  const path = entry.name.slice(WEB_PREFIX.length);
  if (!isSafeBuildPath(path)) throw new PackageError('PATH_UNSAFE', entry.name);
  if (path === RESERVED_FILE) throw new PackageError('RESERVED_NAME', entry.name);
}

interface LocatedEntry {
  readonly entry: CentralEntry;
  readonly offset: number;
}

/** 항목 머리와 목록이 다르면 도구마다 다른 내용을 읽게 된다 — 대조하고 내용 위치를 얻는다. */
async function locateEntry(blob: BlobLike, entry: CentralEntry, limit: number): Promise<LocatedEntry> {
  const headerEnd = entry.localOffset + LOCAL_HEADER_SIZE + entry.nameLength;
  if (headerEnd > limit) throw new PackageError('ENTRY_CORRUPT', entry.name);
  const bytes = await readBytes(blob, entry.localOffset, headerEnd);
  const header = parseLocalHeader(bytes);
  if (!header) throw new PackageError('ENTRY_CORRUPT', entry.name);
  if (header.flags & FLAG_ENCRYPTED) throw new PackageError('ZIP_UNSUPPORTED', 'encrypted');
  if (header.flags & FLAG_DATA_DESCRIPTOR) throw new PackageError('ZIP_UNSUPPORTED', 'data descriptor');
  if (header.method !== 0) throw new PackageError('NOT_STORED', entry.name);
  if (header.size !== entry.size || header.compressedSize !== entry.size || header.crc32 !== entry.crc32 || header.nameLength !== entry.nameLength) {
    throw new PackageError('ENTRY_CORRUPT', entry.name);
  }
  const name = new TextDecoder().decode(bytes.subarray(LOCAL_HEADER_SIZE));
  if (name !== entry.name) throw new PackageError('ENTRY_CORRUPT', entry.name);
  return { entry, offset: headerEnd + header.extraLength };
}

async function locateAll(blob: BlobLike, entries: readonly CentralEntry[], limit: number): Promise<readonly LocatedEntry[]> {
  const located: LocatedEntry[] = [];
  for (let i = 0; i < entries.length; i += HEADER_READ_CONCURRENCY) {
    const chunk = entries.slice(i, i + HEADER_READ_CONCURRENCY);
    located.push(...(await Promise.all(chunk.map((entry) => locateEntry(blob, entry, limit)))));
  }
  return located;
}

/** 항목끼리 겹치면 작은 파일이 큰 내용을 여러 번 가리킬 수 있다(ZIP 폭탄 꼴). 첫 항목이 맨 앞인 것도 여기서 본다. */
function assertNoOverlap(located: readonly LocatedEntry[], limit: number): void {
  const ordered = [...located].sort((a, b) => a.entry.localOffset - b.entry.localOffset);
  let cursor = 0;
  for (const { entry, offset } of ordered) {
    if (entry.localOffset < cursor || offset + entry.size > limit) throw new PackageError('ENTRY_CORRUPT', entry.name);
    cursor = offset + entry.size;
  }
}

async function readManifest(blob: BlobLike, located: LocatedEntry): Promise<PackageManifest> {
  if (located.entry.size > MAX_MANIFEST_BYTES) throw new PackageError('MANIFEST_INVALID', 'size');
  const bytes = await readBytes(blob, located.offset, located.offset + located.entry.size);
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new PackageError('MANIFEST_INVALID', 'JSON');
  }
  return parseManifest(raw);
}

/** manifest 의 파일 목록과 ZIP 항목은 하나도 빠짐없이 같아야 한다 — 올리는 파일은 manifest 가 말한 것뿐이다. */
function assertMatches(manifest: PackageManifest, webEntries: ReadonlyMap<string, LocatedEntry>): void {
  if (manifest.files.length !== webEntries.size) throw new PackageError('MANIFEST_MISMATCH', 'count');
  for (const file of manifest.files) {
    const located = webEntries.get(file.path);
    if (!located) throw new PackageError('MANIFEST_MISMATCH', file.path);
    if (located.entry.size !== file.size) throw new PackageError('MANIFEST_MISMATCH', file.path);
  }
}

/** 패키지를 열어 거절 규칙을 모두 본다 — 내용 해시는 보지 않는다(서버가 PUT 때 대조, CLI 는 node/verify). */
export async function readPackage<TSlice extends BlobSliceLike>(blob: BlobLike<TSlice>): Promise<OpenedPackage<TSlice>> {
  const { entries, centralOffset } = await readCentralEntries(blob);
  entries.forEach(assertEntryAllowed);

  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.name)) throw new PackageError('DUPLICATE_PATH', entry.name);
    seen.add(entry.name);
  }

  const bytes = entries.slice(1).reduce((sum, entry) => sum + entry.size, 0);
  if (bytes > MAX_BUILD_BYTES) throw new PackageError('TOO_LARGE', String(bytes));
  if (entries.length - 1 > MAX_BUILD_FILES) throw new PackageError('TOO_MANY_FILES', String(entries.length - 1));

  const located = await locateAll(blob, entries, centralOffset);
  assertNoOverlap(located, centralOffset);

  const manifestEntry = located[0] as LocatedEntry;
  const manifest = await readManifest(blob, manifestEntry);
  const webEntries = new Map(located.slice(1).map((item) => [item.entry.name.slice(WEB_PREFIX.length), item] as const));
  assertMatches(manifest, webEntries);

  const files = manifest.files.map((file) => {
    const { offset } = webEntries.get(file.path) as LocatedEntry;
    return { ...file, offset, slice: (): TSlice => blob.slice(offset, offset + file.size) };
  });
  return {
    manifest,
    files,
    manifestFile: {
      path: RESERVED_FILE,
      size: manifestEntry.entry.size,
      slice: () => blob.slice(manifestEntry.offset, manifestEntry.offset + manifestEntry.entry.size),
    },
  };
}
