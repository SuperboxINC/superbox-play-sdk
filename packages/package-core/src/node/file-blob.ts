import { open, type FileHandle } from 'node:fs/promises';
import type { BlobLike, BlobSliceLike } from '../reader.ts';

/**
 * 파일을 `Blob.slice` 처럼 읽는다 — 콘솔 브라우저의 reader 를 CLI 가 그대로 쓰려고.
 * `fs.openAsBlob` 은 Cocos Creator 의 Electron Node 에서 실험 기능이라 쓰지 않는다.
 */
export interface FileSlice extends BlobSliceLike {
  readonly start: number;
  readonly end: number;
}

export interface FileBlob extends BlobLike<FileSlice> {
  close(): Promise<void>;
}

async function readRange(handle: FileHandle, start: number, end: number): Promise<ArrayBuffer> {
  const buffer = new Uint8Array(Math.max(0, end - start));
  let read = 0;
  while (read < buffer.length) {
    const { bytesRead } = await handle.read(buffer, read, buffer.length - read, start + read);
    if (bytesRead === 0) break;
    read += bytesRead;
  }
  return buffer.buffer.slice(0, read) as ArrayBuffer;
}

export async function openFileBlob(path: string): Promise<FileBlob> {
  const handle = await open(path, 'r');
  const { size } = await handle.stat();
  return {
    size,
    slice: (start, end) => ({ start, end, arrayBuffer: () => readRange(handle, start, Math.min(end, size)) }),
    close: () => handle.close(),
  };
}
