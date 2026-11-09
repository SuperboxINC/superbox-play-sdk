/**
 * ZIP 머리 꼴 — 저장 방식(method 0)만 쓰는 .sbp 에 필요한 만큼. 쓰기와 읽기가 같은 상수를 쓴다.
 * 브라우저에서도 돈다 — Uint8Array · DataView 만 쓴다.
 */
export const LOCAL_SIGNATURE = 0x04034b50;
export const CENTRAL_SIGNATURE = 0x02014b50;
export const EOCD_SIGNATURE = 0x06054b50;
export const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;

export const LOCAL_HEADER_SIZE = 30;
export const CENTRAL_HEADER_SIZE = 46;
export const EOCD_SIZE = 22;
export const ZIP64_LOCATOR_SIZE = 20;
/** EOCD 뒤 주석 최대 길이 — 읽을 때 뒤에서 이만큼 찾아본다. */
export const MAX_COMMENT_SIZE = 0xffff;

export const FLAG_ENCRYPTED = 1 << 0;
export const FLAG_DATA_DESCRIPTOR = 1 << 3;
export const FLAG_UTF8 = 1 << 11;

const VERSION_STORED = 10;
/** 만든 곳 = Unix(3) — 외부 속성 위 16비트가 파일 모드라 심볼릭 링크를 가려낼 수 있다. */
const MADE_BY_UNIX = (3 << 8) | VERSION_STORED;
const REGULAR_FILE_MODE = 0o100644;

export const UNIX_HOST = 3;
export const MODE_TYPE_MASK = 0o170000;
export const MODE_REGULAR = 0o100000;
export const MODE_SYMLINK = 0o120000;

const ZIP64_EXTRA_ID = 0x0001;

export interface ZipEntryHeader {
  readonly name: Uint8Array;
  readonly crc32: number;
  readonly size: number;
  readonly dosTime: number;
  readonly dosDate: number;
}

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

export function encodeLocalHeader(entry: ZipEntryHeader): Uint8Array {
  const out = new Uint8Array(LOCAL_HEADER_SIZE + entry.name.length);
  const v = view(out);
  v.setUint32(0, LOCAL_SIGNATURE, true);
  v.setUint16(4, VERSION_STORED, true);
  v.setUint16(6, FLAG_UTF8, true);
  v.setUint16(8, 0, true);
  v.setUint16(10, entry.dosTime, true);
  v.setUint16(12, entry.dosDate, true);
  v.setUint32(14, entry.crc32, true);
  v.setUint32(18, entry.size, true);
  v.setUint32(22, entry.size, true);
  v.setUint16(26, entry.name.length, true);
  v.setUint16(28, 0, true);
  out.set(entry.name, LOCAL_HEADER_SIZE);
  return out;
}

export function encodeCentralHeader(entry: ZipEntryHeader, localOffset: number): Uint8Array {
  const out = new Uint8Array(CENTRAL_HEADER_SIZE + entry.name.length);
  const v = view(out);
  v.setUint32(0, CENTRAL_SIGNATURE, true);
  v.setUint16(4, MADE_BY_UNIX, true);
  v.setUint16(6, VERSION_STORED, true);
  v.setUint16(8, FLAG_UTF8, true);
  v.setUint16(10, 0, true);
  v.setUint16(12, entry.dosTime, true);
  v.setUint16(14, entry.dosDate, true);
  v.setUint32(16, entry.crc32, true);
  v.setUint32(20, entry.size, true);
  v.setUint32(24, entry.size, true);
  v.setUint16(28, entry.name.length, true);
  v.setUint16(30, 0, true);
  v.setUint16(32, 0, true);
  v.setUint16(34, 0, true);
  v.setUint16(36, 0, true);
  v.setUint32(38, (REGULAR_FILE_MODE << 16) >>> 0, true);
  v.setUint32(42, localOffset, true);
  out.set(entry.name, CENTRAL_HEADER_SIZE);
  return out;
}

export function encodeEocd(entryCount: number, centralSize: number, centralOffset: number): Uint8Array {
  const out = new Uint8Array(EOCD_SIZE);
  const v = view(out);
  v.setUint32(0, EOCD_SIGNATURE, true);
  v.setUint16(4, 0, true);
  v.setUint16(6, 0, true);
  v.setUint16(8, entryCount, true);
  v.setUint16(10, entryCount, true);
  v.setUint32(12, centralSize, true);
  v.setUint32(16, centralOffset, true);
  v.setUint16(20, 0, true);
  return out;
}

/** 패키지 시각을 ZIP 의 DOS 날짜 · 시각으로 — 1980 앞은 1980 으로. */
export function toDosDateTime(date: Date): { readonly dosTime: number; readonly dosDate: number } {
  const year = Math.max(date.getUTCFullYear(), 1980);
  return {
    dosDate: ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate(),
    dosTime: (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | (date.getUTCSeconds() >> 1),
  };
}

export interface EocdRecord {
  readonly offset: number;
  readonly diskNumber: number;
  readonly centralDisk: number;
  readonly entriesOnDisk: number;
  readonly entries: number;
  readonly centralSize: number;
  readonly centralOffset: number;
}

/**
 * 파일 끝 조각에서 EOCD 를 찾는다 — 주석 길이가 파일 끝과 딱 맞는 것만 믿는다(주석 안에 시그니처를 숨겨 다른 목록을 읽게 하는 것을 막는다).
 * `tailOffset` = 조각이 파일에서 시작하는 위치.
 */
export function findEocd(tail: Uint8Array, tailOffset: number): EocdRecord | null {
  const v = view(tail);
  for (let i = tail.length - EOCD_SIZE; i >= 0; i -= 1) {
    if (v.getUint32(i, true) !== EOCD_SIGNATURE) continue;
    const commentLength = v.getUint16(i + 20, true);
    if (i + EOCD_SIZE + commentLength !== tail.length) continue;
    return {
      offset: tailOffset + i,
      diskNumber: v.getUint16(i + 4, true),
      centralDisk: v.getUint16(i + 6, true),
      entriesOnDisk: v.getUint16(i + 8, true),
      entries: v.getUint16(i + 10, true),
      centralSize: v.getUint32(i + 12, true),
      centralOffset: v.getUint32(i + 16, true),
    };
  }
  return null;
}

export interface CentralEntry {
  readonly name: string;
  readonly flags: number;
  readonly method: number;
  readonly crc32: number;
  readonly compressedSize: number;
  readonly size: number;
  readonly madeByHost: number;
  readonly unixMode: number;
  readonly localOffset: number;
  readonly hasZip64Extra: boolean;
  readonly nameLength: number;
}

function hasZip64Extra(bytes: Uint8Array, start: number, length: number): boolean {
  const v = view(bytes);
  let at = start;
  const end = start + length;
  while (at + 4 <= end) {
    const id = v.getUint16(at, true);
    const size = v.getUint16(at + 2, true);
    if (id === ZIP64_EXTRA_ID) return true;
    at += 4 + size;
  }
  return false;
}

/** 중앙 디렉터리 전체 → 항목들. 모양이 틀리면 null. 이름 글자가 UTF-8 이 아니면 null. */
export function parseCentralDirectory(bytes: Uint8Array, expected: number): readonly CentralEntry[] | null {
  const v = view(bytes);
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const entries: CentralEntry[] = [];
  let at = 0;
  for (let n = 0; n < expected; n += 1) {
    if (at + CENTRAL_HEADER_SIZE > bytes.length || v.getUint32(at, true) !== CENTRAL_SIGNATURE) return null;
    const nameLength = v.getUint16(at + 28, true);
    const extraLength = v.getUint16(at + 30, true);
    const commentLength = v.getUint16(at + 32, true);
    const next = at + CENTRAL_HEADER_SIZE + nameLength + extraLength + commentLength;
    if (next > bytes.length) return null;
    let name: string;
    try {
      name = decoder.decode(bytes.subarray(at + CENTRAL_HEADER_SIZE, at + CENTRAL_HEADER_SIZE + nameLength));
    } catch {
      return null;
    }
    entries.push({
      name,
      flags: v.getUint16(at + 8, true),
      method: v.getUint16(at + 10, true),
      crc32: v.getUint32(at + 16, true),
      compressedSize: v.getUint32(at + 20, true),
      size: v.getUint32(at + 24, true),
      madeByHost: v.getUint16(at + 4, true) >>> 8,
      unixMode: v.getUint32(at + 38, true) >>> 16,
      localOffset: v.getUint32(at + 42, true),
      hasZip64Extra: hasZip64Extra(bytes, at + CENTRAL_HEADER_SIZE + nameLength, extraLength),
      nameLength,
    });
    at = next;
  }
  return at === bytes.length ? entries : null;
}

export interface LocalHeader {
  readonly flags: number;
  readonly method: number;
  readonly crc32: number;
  readonly compressedSize: number;
  readonly size: number;
  readonly nameLength: number;
  readonly extraLength: number;
}

export function parseLocalHeader(bytes: Uint8Array): LocalHeader | null {
  if (bytes.length < LOCAL_HEADER_SIZE) return null;
  const v = view(bytes);
  if (v.getUint32(0, true) !== LOCAL_SIGNATURE) return null;
  return {
    flags: v.getUint16(6, true),
    method: v.getUint16(8, true),
    crc32: v.getUint32(14, true),
    compressedSize: v.getUint32(18, true),
    size: v.getUint32(22, true),
    nameLength: v.getUint16(26, true),
    extraLength: v.getUint16(28, true),
  };
}
