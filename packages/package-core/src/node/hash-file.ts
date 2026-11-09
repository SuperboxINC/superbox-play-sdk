import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { CRC32_INITIAL, crc32Finish, crc32Update } from '../crc32.ts';
import { ENCODING_HEAD_BYTES } from '../encoding.ts';

/**
 * 파일 한 번 읽어 SHA-256 · CRC-32 · 머리를 얻는다. 500MB 를 메모리에 올리지 않는다.
 */
export interface FileDigest {
  readonly size: number;
  readonly sha256: string;
  readonly crc32: number;
  readonly head: Uint8Array;
}

export function digestBytes(bytes: Uint8Array): FileDigest {
  return {
    size: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    crc32: crc32Finish(crc32Update(CRC32_INITIAL, bytes)),
    head: bytes.subarray(0, ENCODING_HEAD_BYTES),
  };
}

export async function digestFile(path: string): Promise<FileDigest> {
  const hash = createHash('sha256');
  let crc = CRC32_INITIAL;
  let size = 0;
  let head = new Uint8Array(0);
  for await (const chunk of createReadStream(path)) {
    const bytes = chunk as Uint8Array;
    hash.update(bytes);
    crc = crc32Update(crc, bytes);
    if (head.length < ENCODING_HEAD_BYTES) {
      const next = new Uint8Array(Math.min(ENCODING_HEAD_BYTES, head.length + bytes.length));
      next.set(head);
      next.set(bytes.subarray(0, next.length - head.length), head.length);
      head = next;
    }
    size += bytes.length;
  }
  return { size, sha256: hash.digest('hex'), crc32: crc32Finish(crc), head };
}
