import { createHash } from 'node:crypto';
import { PackageError } from '../errors.ts';
import { readPackage, type OpenedPackage } from '../reader.ts';
import { openFileBlob, type FileBlob, type FileSlice } from './file-blob.ts';

/**
 * 패키지 파일 검사 — 읽는 쪽 거절 규칙에 더해 내용 SHA-256 까지 대조한다(`superbox-play inspect`).
 * 콘솔 브라우저는 500MB 를 다시 읽지 않고 저장소가 PUT 때 대조한다.
 */
const CHUNK_BYTES = 4 * 1024 * 1024;

async function hashRange(blob: FileBlob, start: number, size: number): Promise<string> {
  const hash = createHash('sha256');
  for (let offset = 0; offset < size; offset += CHUNK_BYTES) {
    const end = Math.min(size, offset + CHUNK_BYTES);
    hash.update(new Uint8Array(await blob.slice(start + offset, start + end).arrayBuffer()));
  }
  return hash.digest('hex');
}

/** 이미 연 패키지의 내용을 manifest 의 SHA-256 과 대조한다. */
export async function assertPackageHashes(blob: FileBlob, opened: OpenedPackage<FileSlice>): Promise<void> {
  for (const file of opened.files) {
    if ((await hashRange(blob, file.offset, file.size)) !== file.sha256) throw new PackageError('HASH_MISMATCH', file.path);
  }
}

export async function verifyPackageFile(path: string): Promise<OpenedPackage<FileSlice>> {
  const blob = await openFileBlob(path);
  try {
    const opened = await readPackage(blob);
    await assertPackageHashes(blob, opened);
    return opened;
  } finally {
    await blob.close();
  }
}
