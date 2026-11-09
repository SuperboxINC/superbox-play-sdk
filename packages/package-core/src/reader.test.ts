import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PackageError, type PackageErrorCode } from './errors.ts';
import { readPackage } from './reader.ts';
import { GAME_HTML, GAME_JS, gameEntries, manifestEntry, sampleManifest, zipBytes, type RawEntry, type ZipOptions } from './test-support.ts';

function blobOf(bytes: Uint8Array): Blob {
  return new Blob([bytes as BlobPart]);
}

async function rejectsWith(bytes: Uint8Array, code: PackageErrorCode): Promise<void> {
  await assert.rejects(readPackage(blobOf(bytes)), (error: unknown) => {
    assert.ok(error instanceof PackageError, String(error));
    assert.equal(error.code, code);
    return true;
  });
}

function withEntries(entries: readonly RawEntry[], options?: ZipOptions): Uint8Array {
  return zipBytes([manifestEntry(), ...entries], options);
}

describe('readPackage accepts a well-formed package', () => {
  it('reads the manifest and slices each file without touching the rest', async () => {
    const opened = await readPackage(blobOf(withEntries(gameEntries())));
    assert.equal(opened.manifest.title, '시험 게임');
    assert.deepEqual(opened.files.map((file) => file.path), ['game.js', 'index.html']);
    const game = opened.files.find((file) => file.path === 'game.js');
    assert.deepEqual(new Uint8Array(await (game?.slice() as Blob).arrayBuffer()), GAME_JS);
    const html = opened.files.find((file) => file.path === 'index.html');
    assert.deepEqual(new Uint8Array(await (html?.slice() as Blob).arrayBuffer()), GAME_HTML);
    assert.equal(opened.manifestFile.path, 'sbp-manifest.json');
    const manifestText = await (opened.manifestFile.slice() as Blob).text();
    assert.equal(JSON.parse(manifestText).version, '1.0.0');
  });

  it('never reads the whole file — Blob.slice only, small windows', async () => {
    const big = new Uint8Array(4 * 1024 * 1024);
    const manifest = sampleManifest({
      totals: { count: 1, bytes: big.length },
      files: [{ path: 'index.html', size: big.length, sha256: 'a'.repeat(64), encoding: null }],
    });
    const bytes = zipBytes([manifestEntry(manifest), { name: 'web/index.html', data: big }]);
    const blob = blobOf(bytes);
    const reads: number[] = [];
    const spy = {
      size: blob.size,
      slice(start: number, end: number) {
        const part = blob.slice(start, end);
        return {
          arrayBuffer() {
            reads.push(end - start);
            return part.arrayBuffer();
          },
        };
      },
    };
    const opened = await readPackage(spy);
    assert.equal(opened.files[0]?.size, big.length);
    assert.ok(Math.max(...reads) < big.length / 4, `가장 큰 읽기 ${Math.max(...reads)}`);
  });

  it('ignores manifest fields it does not know (format is major — 9장)', async () => {
    const manifest = sampleManifest({ somethingNew: { a: 1 } });
    const opened = await readPackage(blobOf(zipBytes([manifestEntry(manifest), ...gameEntries()])));
    assert.equal(opened.manifest.format, 1);
    assert.equal('somethingNew' in opened.manifest, false);
  });
});

describe('readPackage refuses', () => {
  it('a file that is not ZIP or was truncated', async () => {
    await rejectsWith(new TextEncoder().encode('hello'), 'ZIP_INVALID');
    await rejectsWith(new Uint8Array(40), 'ZIP_INVALID');
    const whole = withEntries(gameEntries());
    await rejectsWith(whole.subarray(0, whole.length - 8), 'ZIP_INVALID');
  });

  it('a first entry other than manifest.json', async () => {
    await rejectsWith(zipBytes([...gameEntries(), manifestEntry()]), 'FIRST_NOT_MANIFEST');
    await rejectsWith(zipBytes([]), 'FIRST_NOT_MANIFEST');
  });

  it('a manifest.json that is first in the list but not first in the file', async () => {
    const entries = [...gameEntries(), manifestEntry()];
    const bytes = zipBytes(entries);
    // 목록 차례만 manifest 를 앞으로 — 항목 머리는 파일 뒤쪽에 있다
    const reordered = zipBytes([{ ...manifestEntry(), centralOffset: 10 }, ...gameEntries()]);
    assert.ok(bytes.length > 0);
    await rejectsWith(reordered, 'FIRST_NOT_MANIFEST');
  });

  it('an entry that is not stored', async () => {
    await rejectsWith(withEntries([{ name: 'web/index.html', data: GAME_HTML, method: 8 }, gameEntries()[0] as RawEntry]), 'NOT_STORED');
  });

  it('compressed size different from size', async () => {
    await rejectsWith(withEntries([{ name: 'web/index.html', data: GAME_HTML, centralCompressedSize: 1 }, gameEntries()[0] as RawEntry]), 'NOT_STORED');
  });

  it('entries outside web/', async () => {
    await rejectsWith(withEntries([...gameEntries(), { name: 'other/x.txt', data: GAME_JS }]), 'OUTSIDE_WEB');
    await rejectsWith(withEntries([...gameEntries(), { name: 'x.txt', data: GAME_JS }]), 'OUTSIDE_WEB');
  });

  it('paths that escape or break the build path rule', async () => {
    await rejectsWith(withEntries([...gameEntries(), { name: 'web/../evil.txt', data: GAME_JS }]), 'PATH_UNSAFE');
    await rejectsWith(withEntries([...gameEntries(), { name: 'web/a/../../evil.txt', data: GAME_JS }]), 'PATH_UNSAFE');
    await rejectsWith(withEntries([...gameEntries(), { name: 'web//evil.txt', data: GAME_JS }]), 'PATH_UNSAFE');
    await rejectsWith(withEntries([...gameEntries(), { name: 'web/한글.txt', data: GAME_JS }]), 'PATH_UNSAFE');
    await rejectsWith(withEntries([...gameEntries(), { name: 'web/a\\b.txt', data: GAME_JS }]), 'PATH_UNSAFE');
    await rejectsWith(withEntries([...gameEntries(), { name: `web/${'a'.repeat(256)}`, data: GAME_JS }]), 'PATH_UNSAFE');
    await rejectsWith(withEntries([...gameEntries(), { name: 'web/dir/', data: new Uint8Array(0) }]), 'PATH_UNSAFE');
  });

  it('the name reserved for the uploaded manifest', async () => {
    await rejectsWith(withEntries([...gameEntries(), { name: 'web/sbp-manifest.json', data: GAME_JS }]), 'RESERVED_NAME');
  });

  it('symbolic links and other non-regular entries', async () => {
    await rejectsWith(withEntries([...gameEntries(), { name: 'web/link', data: GAME_JS, unixMode: 0o120777 }]), 'SYMLINK');
    await rejectsWith(withEntries([...gameEntries(), { name: 'web/dir', data: GAME_JS, unixMode: 0o040755 }]), 'PATH_UNSAFE');
  });

  it('encryption, data descriptors and ZIP64', async () => {
    await rejectsWith(withEntries([{ name: 'web/index.html', data: GAME_HTML, flags: (1 << 11) | 1 }, gameEntries()[0] as RawEntry]), 'ZIP_UNSUPPORTED');
    await rejectsWith(withEntries([{ name: 'web/index.html', data: GAME_HTML, flags: (1 << 11) | (1 << 3) }, gameEntries()[0] as RawEntry]), 'ZIP_UNSUPPORTED');
    await rejectsWith(withEntries([{ name: 'web/index.html', data: GAME_HTML, centralSize: 0xffffffff }, gameEntries()[0] as RawEntry]), 'ZIP_UNSUPPORTED');
    const zip64Extra = new Uint8Array([0x01, 0x00, 0x00, 0x00]);
    await rejectsWith(withEntries([{ name: 'web/index.html', data: GAME_HTML, centralExtra: zip64Extra }, gameEntries()[0] as RawEntry]), 'ZIP_UNSUPPORTED');
    await rejectsWith(withEntries(gameEntries(), { eocdEntries: 0xffff, entriesOnDisk: 0xffff }), 'ZIP_UNSUPPORTED');
  });

  it('split archives', async () => {
    await rejectsWith(withEntries(gameEntries(), { diskNumber: 1 }), 'ZIP_UNSUPPORTED');
    await rejectsWith(withEntries(gameEntries(), { entriesOnDisk: 1 }), 'ZIP_UNSUPPORTED');
  });

  it('a comment that hides another end record — refused, not misread', async () => {
    const fake = new Uint8Array(22);
    new DataView(fake.buffer).setUint32(0, 0x06054b50, true);
    await rejectsWith(withEntries(gameEntries(), { comment: fake }), 'FIRST_NOT_MANIFEST');
    // 평범한 주석은 끝 자리가 맞으면 읽는다
    const opened = await readPackage(blobOf(withEntries(gameEntries(), { comment: new TextEncoder().encode('note') })));
    assert.equal(opened.files.length, 2);
  });

  it('duplicate entries', async () => {
    await rejectsWith(withEntries([...gameEntries(), { name: 'web/index.html', data: GAME_HTML }]), 'DUPLICATE_PATH');
  });

  it('a local header that disagrees with the central directory', async () => {
    await rejectsWith(withEntries([{ name: 'web/index.html', data: GAME_HTML, localName: 'web/indez.html' }, gameEntries()[0] as RawEntry]), 'ENTRY_CORRUPT');
    await rejectsWith(withEntries([{ name: 'web/index.html', data: GAME_HTML, centralSize: GAME_HTML.length + 1, centralCompressedSize: GAME_HTML.length + 1 }, gameEntries()[0] as RawEntry]), 'ENTRY_CORRUPT');
  });

  it('entries that overlap', async () => {
    const entries: readonly RawEntry[] = [
      manifestEntry(),
      { name: 'web/game.js', data: GAME_JS },
      // 앞 항목과 같은 자리를 가리킨다 — 작은 파일이 큰 내용을 여러 번 가리키는 꼴
      { name: 'web/index.html', data: GAME_HTML, centralOffset: 0 },
    ];
    await rejectsWith(zipBytes(entries), 'ENTRY_CORRUPT');
  });

  it('a manifest that is not JSON or breaks the schema', async () => {
    await rejectsWith(zipBytes([{ name: 'manifest.json', data: new TextEncoder().encode('{nope') }, ...gameEntries()]), 'MANIFEST_INVALID');
    await rejectsWith(zipBytes([manifestEntry(sampleManifest({ orientation: 'sideways' })), ...gameEntries()]), 'MANIFEST_INVALID');
    await rejectsWith(zipBytes([manifestEntry(sampleManifest({ format: 2 })), ...gameEntries()]), 'FORMAT_UNSUPPORTED');
  });

  it('a manifest whose files do not match the entries', async () => {
    // manifest 에 없는 항목
    await rejectsWith(withEntries([...gameEntries(), { name: 'web/extra.js', data: GAME_JS }]), 'MANIFEST_MISMATCH');
    // 항목이 빠졌다
    await rejectsWith(withEntries([gameEntries()[0] as RawEntry]), 'MANIFEST_MISMATCH');
    // 크기가 다르다
    await rejectsWith(withEntries([{ name: 'web/game.js', data: new Uint8Array(GAME_JS.length + 3) }, gameEntries()[1] as RawEntry]), 'MANIFEST_MISMATCH');
    // 이름이 다르다
    await rejectsWith(withEntries([{ name: 'web/gamf.js', data: GAME_JS }, gameEntries()[1] as RawEntry]), 'MANIFEST_MISMATCH');
  });

  it('a total above the limit, before reading any entry', async () => {
    const huge: RawEntry = { name: 'web/huge.bin', data: new Uint8Array(4), centralSize: 501 * 1024 * 1024, centralCompressedSize: 501 * 1024 * 1024 };
    await rejectsWith(withEntries([...gameEntries(), huge]), 'TOO_LARGE');
  });

  it('more files than the limit', async () => {
    const many: RawEntry[] = [];
    for (let index = 0; index <= 2000; index += 1) many.push({ name: `web/f${index}.txt`, data: new Uint8Array(0) });
    await rejectsWith(withEntries(many), 'TOO_MANY_FILES');
  });

  it('a blob far larger than any valid package', async () => {
    await rejectsWith(new Uint8Array(0), 'ZIP_INVALID');
    const blob = { size: 900 * 1024 * 1024, slice: () => ({ arrayBuffer: async () => new ArrayBuffer(0) }) };
    await assert.rejects(readPackage(blob), (error: unknown) => error instanceof PackageError && error.code === 'TOO_LARGE');
  });
});
