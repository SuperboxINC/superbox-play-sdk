/**
 * CRC-32(IEEE) — ZIP 항목 머리에 쓴다. Cocos Creator 의 Electron Node 와 브라우저에서도 같이 돌아야 해서 표로 직접 센다.
 * 500MB 도 1초 남짓이다(패키징은 어차피 파일을 한 번 다 읽는다).
 */
const TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export const CRC32_INITIAL = 0xffffffff;

/** 조각마다 부른다 — 시작은 CRC32_INITIAL, 끝은 crc32Finish. */
export function crc32Update(state: number, bytes: Uint8Array): number {
  let crc = state;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = (TABLE[(crc ^ (bytes[i] as number)) & 0xff] as number) ^ (crc >>> 8);
  }
  return crc >>> 0;
}

export function crc32Finish(state: number): number {
  return (state ^ 0xffffffff) >>> 0;
}

export function crc32(bytes: Uint8Array): number {
  return crc32Finish(crc32Update(CRC32_INITIAL, bytes));
}
