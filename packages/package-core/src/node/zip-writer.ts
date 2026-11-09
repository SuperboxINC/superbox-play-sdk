import { createReadStream } from 'node:fs';
import { open, type FileHandle } from 'node:fs/promises';
import { PackageError } from '../errors.ts';
import { encodeCentralHeader, encodeEocd, encodeLocalHeader, type ZipEntryHeader } from '../zip-format.ts';

/**
 * 저장 방식 ZIP 쓰기 — 해시와 크기는 앞서 구해 두었으므로 머리를 먼저 쓰고 내용을 흘려 넣는다.
 * 데이터 서술자를 쓰지 않는다: 읽는 쪽이 항목 머리만 보고 내용 위치와 크기를 알아야 한다(콘솔이 File.slice 로 자른다).
 */
export type ZipEntrySource =
  | { readonly kind: 'bytes'; readonly bytes: Uint8Array }
  | { readonly kind: 'file'; readonly path: string };

export interface ZipEntryInput {
  readonly name: string;
  readonly size: number;
  readonly crc32: number;
  readonly source: ZipEntrySource;
}

const encoder = new TextEncoder();

async function writeAll(handle: FileHandle, bytes: Uint8Array): Promise<void> {
  let written = 0;
  while (written < bytes.length) {
    const result = await handle.write(bytes, written, bytes.length - written);
    written += result.bytesWritten;
  }
}

async function writeSource(handle: FileHandle, entry: ZipEntryInput): Promise<void> {
  if (entry.source.kind === 'bytes') {
    await writeAll(handle, entry.source.bytes);
    return;
  }
  let written = 0;
  for await (const chunk of createReadStream(entry.source.path)) {
    const bytes = chunk as Uint8Array;
    written += bytes.length;
    await writeAll(handle, bytes);
  }
  if (written !== entry.size) throw new PackageError('FILE_CHANGED', entry.name);
}

/** 쓴 전체 바이트 수를 돌려준다. */
export async function writeStoredZip(outPath: string, entries: readonly ZipEntryInput[], times: { readonly dosTime: number; readonly dosDate: number }): Promise<number> {
  const handle = await open(outPath, 'w');
  try {
    const centrals: Uint8Array[] = [];
    let offset = 0;
    for (const entry of entries) {
      const header: ZipEntryHeader = { name: encoder.encode(entry.name), crc32: entry.crc32, size: entry.size, ...times };
      const local = encodeLocalHeader(header);
      await writeAll(handle, local);
      await writeSource(handle, entry);
      centrals.push(encodeCentralHeader(header, offset));
      offset += local.length + entry.size;
    }
    const centralOffset = offset;
    let centralSize = 0;
    for (const central of centrals) {
      await writeAll(handle, central);
      centralSize += central.length;
    }
    await writeAll(handle, encodeEocd(entries.length, centralSize, centralOffset));
    return centralOffset + centralSize + 22;
  } finally {
    await handle.close();
  }
}
