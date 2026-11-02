/**
 * 샘플 자원 만들기 — 로딩이 눈에 보이려면 내려받을 것이 있어야 하는데 저장소에 큰 이진 파일을 넣지 않는다.
 * 그래서 빌드 때 그린다: 잔잔한 노이즈가 섞인 그라디언트 PNG(압축하지 않아 크기가 예측된다).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { crc32, deflateSync, constants } from 'node:zlib';

const PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), data.length + 8);
  return out;
}

export function makePng(width, height, seed) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // 8비트
  header[9] = 2; // RGB
  const raw = Buffer.alloc((width * 3 + 1) * height);
  let state = seed * 2654435761 + 1;
  const hueA = [40 + (seed * 37) % 160, 60 + (seed * 53) % 120, 120 + (seed * 19) % 120];
  const hueB = [20 + (seed * 11) % 80, 30 + (seed * 29) % 90, 60 + (seed * 43) % 140];
  let at = 0;
  for (let y = 0; y < height; y += 1) {
    raw[at] = 0;
    at += 1;
    for (let x = 0; x < width; x += 1) {
      state = (state * 1664525 + 1013904223) >>> 0;
      const noise = (state >>> 28) - 8;
      const t = (x / width + y / height) / 2;
      for (let c = 0; c < 3; c += 1) {
        raw[at] = Math.max(0, Math.min(255, Math.round(hueA[c] + (hueB[c] - hueA[c]) * t + noise)));
        at += 1;
      }
    }
  }
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: constants.Z_NO_COMPRESSION })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** `<dir>/tile-00.png` … 를 만든다. 이미 있으면 다시 그리지 않는다. */
export async function writeTiles(dir, { count, width = 480, height = 270 }) {
  await mkdir(dir, { recursive: true });
  const names = [];
  for (let index = 0; index < count; index += 1) {
    const name = `tile-${String(index).padStart(2, '0')}.png`;
    names.push(name);
    await writeFile(path.join(dir, name), makePng(width, height, index + 1), { flag: 'wx' }).catch((error) => {
      if (error.code !== 'EEXIST') throw error;
    });
  }
  return names;
}
