import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

/**
 * 콘솔 웹이 가져다 쓰는 쪽에 Node API 가 섞이지 않게 한다 — 섞이면 콘솔 빌드가 깨지거나 브라우저에서 터진다.
 */
const here = path.dirname(fileURLToPath(import.meta.url));

/** browser.ts 에서 닿는 파일 전부. */
const BROWSER_FILES = ['browser.ts', 'content-type.ts', 'encoding.ts', 'errors.ts', 'limits.ts', 'manifest.ts', 'reader.ts', 'zip-format.ts'];
const NODE_ONLY = /\bfrom\s+['"]node:|\brequire\(|\bBuffer\b|\bprocess\.|__dirname|import\.meta/;

describe('browser entry', () => {
  for (const file of BROWSER_FILES) {
    it(`${file} uses no Node API`, async () => {
      const text = await readFile(path.join(here, file), 'utf8');
      assert.equal(NODE_ONLY.test(text), false, file);
    });
  }

  it('bundles for the browser with no Node import, and the file list above is complete', async () => {
    const result = await build({
      entryPoints: [path.join(here, 'browser.ts')],
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'browser',
      metafile: true,
      logLevel: 'silent',
    });
    const inputs = Object.keys(result.metafile.inputs).map((input) => path.basename(input));
    assert.deepEqual([...inputs].sort(), [...BROWSER_FILES].sort());
    const code = result.outputFiles[0]?.text ?? '';
    assert.equal(/from\s*["']node:/.test(code), false);
  });
});
