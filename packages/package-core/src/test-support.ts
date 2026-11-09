import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { crc32 } from './crc32.ts';
import { SDK_POLICY_URL_ENV } from './node/sdk-policy-check.ts';

/** 버전 정책을 내주는 시험 서버 — 정책 주소를 이 서버로 돌리고, 돌려받은 함수가 서버를 닫고 주소를 되돌린다. */
export async function publishSdkPolicy(policy: Readonly<Record<string, unknown>>): Promise<() => Promise<void>> {
  const previous = process.env[SDK_POLICY_URL_ENV];
  const server = createServer((_request, response) => response.end(JSON.stringify({ schemaVersion: 1, deniedVersions: [], ...policy })));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  process.env[SDK_POLICY_URL_ENV] = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  return () =>
    new Promise<void>((resolve) => {
      if (previous === undefined) delete process.env[SDK_POLICY_URL_ENV];
      else process.env[SDK_POLICY_URL_ENV] = previous;
      server.close(() => resolve());
    });
}

/**
 * 시험 전용 — 거절 규칙을 시험하려고 일부러 틀린 ZIP 도 만들 수 있는 조립기. 빌드 진입에 들어가지 않는다.
 */
export interface RawEntry {
  readonly name: string;
  readonly data?: Uint8Array;
  readonly method?: number;
  readonly flags?: number;
  readonly unixMode?: number;
  readonly madeByHost?: number;
  /** 목록(중앙 디렉터리)에만 적는 크기 — 실제 내용과 다르게. */
  readonly centralSize?: number;
  /** 목록에만 적는 압축 크기. */
  readonly centralCompressedSize?: number;
  /** 항목 머리에만 적는 이름 — 목록과 다르게. */
  readonly localName?: string;
  /** 이 항목의 목록 오프셋을 다른 값으로. */
  readonly centralOffset?: number;
  readonly centralExtra?: Uint8Array;
}

export interface ZipOptions {
  readonly comment?: Uint8Array;
  readonly diskNumber?: number;
  readonly entriesOnDisk?: number;
  readonly eocdEntries?: number;
  readonly eocdCentralOffset?: number;
}

const encoder = new TextEncoder();

export function zipBytes(entries: readonly RawEntry[], options: ZipOptions = {}): Uint8Array {
  const parts: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const data = entry.data ?? new Uint8Array(0);
    const name = encoder.encode(entry.name);
    const localName = encoder.encode(entry.localName ?? entry.name);
    const checksum = crc32(data);
    const method = entry.method ?? 0;
    const flags = entry.flags ?? 1 << 11;

    const local = new Uint8Array(30 + localName.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 10, true);
    lv.setUint16(6, flags, true);
    lv.setUint16(8, method, true);
    lv.setUint32(14, checksum, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, localName.length, true);
    local.set(localName, 30);
    parts.push(local, data);

    const extra = entry.centralExtra ?? new Uint8Array(0);
    const central = new Uint8Array(46 + name.length + extra.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, ((entry.madeByHost ?? 3) << 8) | 10, true);
    cv.setUint16(6, 10, true);
    cv.setUint16(8, flags, true);
    cv.setUint16(10, method, true);
    cv.setUint32(16, checksum, true);
    cv.setUint32(20, entry.centralCompressedSize ?? entry.centralSize ?? data.length, true);
    cv.setUint32(24, entry.centralSize ?? data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint16(30, extra.length, true);
    cv.setUint32(38, ((entry.unixMode ?? 0o100644) << 16) >>> 0, true);
    cv.setUint32(42, entry.centralOffset ?? offset, true);
    central.set(name, 46);
    central.set(extra, 46 + name.length);
    centrals.push(central);

    offset += local.length + data.length;
  }
  const centralSize = centrals.reduce((sum, item) => sum + item.length, 0);
  const comment = options.comment ?? new Uint8Array(0);
  const eocd = new Uint8Array(22 + comment.length);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, options.diskNumber ?? 0, true);
  ev.setUint16(8, options.entriesOnDisk ?? options.eocdEntries ?? entries.length, true);
  ev.setUint16(10, options.eocdEntries ?? entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, options.eocdCentralOffset ?? offset, true);
  ev.setUint16(20, comment.length, true);
  eocd.set(comment, 22);

  const total = offset + centralSize + eocd.length;
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of [...parts, ...centrals, eocd]) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

export function sha256Hex(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

export const GAME_HTML = encoder.encode('<!doctype html><title>x</title>');
export const GAME_JS = encoder.encode('console.info("game");');

export function sampleManifest(overrides: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    format: 1,
    version: '1.0.0',
    entry: 'index.html',
    title: '시험 게임',
    orientation: 'auto',
    engine: { name: 'html5', version: null },
    tool: { name: 'superbox-play', version: '0.1.0' },
    zoneOrigin: 'https://game.superboxgo.com',
    loading: { mode: 'default', backgroundColor: '#0B0F19', primaryColor: '#1B64DA' },
    createdAt: '2026-11-01T12:00:00.000Z',
    totals: { count: 2, bytes: GAME_HTML.length + GAME_JS.length },
    files: [
      { path: 'game.js', size: GAME_JS.length, sha256: sha256Hex(GAME_JS), encoding: null },
      { path: 'index.html', size: GAME_HTML.length, sha256: sha256Hex(GAME_HTML), encoding: null },
    ],
    ...overrides,
  };
}

export function manifestEntry(manifest: unknown = sampleManifest()): RawEntry {
  return { name: 'manifest.json', data: encoder.encode(JSON.stringify(manifest)) };
}

export function gameEntries(): readonly RawEntry[] {
  return [
    { name: 'web/game.js', data: GAME_JS },
    { name: 'web/index.html', data: GAME_HTML },
  ];
}
