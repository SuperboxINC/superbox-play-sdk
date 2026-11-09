import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import { main } from './cli.ts';
import { describeError, CliError, exitCodeOf } from './errors.ts';
import { formatBytes } from './report.ts';
import { PackageError } from '../../package-core/src/browser.ts';

let root = '';
let counter = 0;
const startDir = process.cwd();

before(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'sbp-cli-'));
});

after(async () => {
  process.chdir(startDir);
  await rm(root, { recursive: true, force: true });
});

beforeEach(async () => {
  counter += 1;
  const dir = path.join(root, `case-${counter}`);
  await mkdir(dir, { recursive: true });
  process.chdir(dir);
});

async function run(...argv: string[]): Promise<{ readonly code: number; readonly out: string; readonly err: string }> {
  let out = '';
  let err = '';
  const code = await main(argv, {
    out: (text) => {
      out += text;
    },
    err: (text) => {
      err += text;
    },
  });
  return { code, out, err };
}

async function writeBuild(folder = 'build'): Promise<string> {
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, 'index.html'), '<!doctype html><html><head><title>t</title></head><body><script src="game.js"></script></body></html>');
  await writeFile(path.join(folder, 'game.js'), 'console.info(1)');
  return folder;
}

describe('general', () => {
  it('prints help and version', async () => {
    const help = await run('--help');
    assert.equal(help.code, 0);
    for (const command of ['init', 'build', 'inspect', 'dev', 'deploy', '--engine', '--config', '--zone', '--out', '--keep-maps', '--game', '--channel', '--note', '--console', '--api-key', 'SUPERBOX_PLAY_API_KEY']) assert.ok(help.out.includes(command), command);
    assert.deepEqual(await run(), { code: 0, out: help.out, err: '' });
    assert.ok(/^\d+\.\d+\.\d+\n$/.test((await run('--version')).out));
  });

  it('exit code 2 and a code on bad usage', async () => {
    const unknown = await run('frobnicate');
    assert.equal(unknown.code, 2);
    assert.ok(unknown.err.startsWith('오류 [USAGE]'));
    assert.equal((await run('build', '--nope')).code, 2);
    assert.equal((await run('inspect')).code, 2);
  });
});

describe('init', () => {
  it('writes a config named after the folder and refuses to overwrite', async () => {
    assert.equal((await run('init')).code, 0);
    const config = JSON.parse(await readFile('superbox.config.json', 'utf8'));
    assert.equal(config.version, '1.0.0');
    assert.equal(config.title, path.basename(process.cwd()));
    assert.equal(config.runtime.watchdog, true);
    const again = await run('init');
    assert.equal(again.code, 3);
    assert.ok(again.err.includes('CONFIG_EXISTS'));
    assert.equal((await run('init', '--force')).code, 0);
  });

  it('the file it writes builds without warnings about itself', async () => {
    await run('init');
    await writeBuild();
    const result = await run('build', 'build');
    assert.equal(result.code, 0, result.err);
    assert.equal(result.out.includes('CONFIG_UNKNOWN_KEY'), false);
    assert.equal(result.out.includes('VERSION_DEFAULTED'), false);
  });
});

describe('build', () => {
  it('writes the package and reports totals, largest files and warnings', async () => {
    await writeBuild();
    const result = await run('build', 'build');
    assert.equal(result.code, 0, result.err);
    await readFile('build-1.0.0.sbp');
    assert.ok(result.out.includes('build-1.0.0.sbp'));
    assert.ok(result.out.includes('엔진     html5'));
    assert.ok(result.out.includes('파일     2개'));
    assert.ok(result.out.includes('큰 파일 2개'));
    assert.ok(result.out.includes('index.html'));
    assert.ok(result.out.includes('[VERSION_DEFAULTED]'));
    assert.ok(result.out.includes('[TITLE_MISSING]'));
  });

  it('defaults the folder to the current one and keeps the output out of it', async () => {
    await writeBuild('.');
    assert.equal((await run('build')).code, 0);
    const again = await run('build', '--out', 'x.sbp');
    assert.equal(again.code, 0, again.err);
    assert.equal(again.out.includes('.sbp  '), false);
  });

  it('honors --zone, --engine, --out, --keep-maps and --config', async () => {
    await writeBuild();
    await writeFile('build/game.js.map', '{}');
    await mkdir('conf', { recursive: true });
    await writeFile('conf/my.json', JSON.stringify({ version: '2.0.0', title: '설정 게임' }));
    const result = await run('build', 'build', '--zone', 'http://localhost:8200', '--engine', 'phaser', '--out', 'out/x.sbp', '--keep-maps', '--config', 'conf/my.json');
    assert.equal(result.code, 0, result.err);
    const inspect = await run('inspect', 'out/x.sbp');
    assert.equal(inspect.code, 0, inspect.err);
    assert.ok(inspect.out.includes('버전     2.0.0'));
    assert.ok(inspect.out.includes('이름     설정 게임'));
    assert.ok(inspect.out.includes('엔진     phaser'));
    assert.ok(inspect.out.includes('게임존   http://localhost:8200'));
    assert.ok(inspect.out.includes('game.js.map'));
  });

  it('finds the config in the current folder first, then in the build folder', async () => {
    await writeBuild();
    await writeFile('build/superbox.config.json', JSON.stringify({ title: '폴더 설정', version: '3.0.0' }));
    const inFolder = await run('build', 'build', '--out', 'a.sbp');
    assert.equal(inFolder.code, 0);
    assert.ok(inFolder.out.includes('폴더 설정'));
    assert.equal(inFolder.out.includes('superbox.config.json  '), false);
    await writeFile('superbox.config.json', JSON.stringify({ title: '현재 폴더 설정', version: '4.0.0' }));
    const inCwd = await run('build', 'build', '--out', 'b.sbp');
    assert.ok(inCwd.out.includes('현재 폴더 설정'));
  });

  it('surfaces config warnings', async () => {
    await writeBuild();
    await writeFile('superbox.config.json', JSON.stringify({ titel: '오타' }));
    const result = await run('build', 'build');
    assert.ok(result.out.includes('[CONFIG_UNKNOWN_KEY]'));
    assert.ok(result.out.includes('titel'));
  });

  it('exit codes by failure kind', async () => {
    const missing = await run('build', 'nope');
    assert.equal(missing.code, 4);
    assert.ok(missing.err.includes('[FOLDER_MISSING]'));

    await mkdir('empty', { recursive: true });
    const noEntry = await run('build', 'empty');
    assert.equal(noEntry.code, 4);
    assert.ok(noEntry.err.includes('[ENTRY_MISSING]'));

    await writeBuild();
    const engine = await run('build', 'build', '--engine', 'godot');
    assert.equal(engine.code, 2);
    assert.ok(engine.err.includes('[ENGINE_INVALID]'));

    const zone = await run('build', 'build', '--zone', 'http://evil.example');
    assert.equal(zone.code, 2);
    assert.ok(zone.err.includes('[ZONE_INVALID]'));

    const noConfig = await run('build', 'build', '--config', 'missing.json');
    assert.equal(noConfig.code, 3);
    assert.ok(noConfig.err.includes('[CONFIG_NOT_FOUND]'));

    await writeFile('bad.json', '{not json');
    const badJson = await run('build', 'build', '--config', 'bad.json');
    assert.equal(badJson.code, 3);
    assert.ok(badJson.err.includes('[CONFIG_INVALID]'));

    await writeFile('bad2.json', JSON.stringify({ orientation: 'sideways' }));
    const badField = await run('build', 'build', '--config', 'bad2.json');
    assert.equal(badField.code, 3);
    assert.ok(badField.err.includes('orientation'));

    await writeFile('build/한글.png', 'x');
    const badPath = await run('build', 'build');
    assert.equal(badPath.code, 1);
    assert.ok(badPath.err.includes('[PATH_UNSAFE]'));
  });
});

describe('inspect', () => {
  it('validates and summarizes', async () => {
    await writeBuild();
    await writeFile('superbox.config.json', JSON.stringify({ title: '검사 게임', version: '1.2.3', orientation: 'portrait', loading: { primaryColor: '#123456' } }));
    await run('build', 'build', '--out', 'x.sbp');
    const result = await run('inspect', 'x.sbp');
    assert.equal(result.code, 0, result.err);
    assert.ok(result.out.startsWith('검증 통과'));
    for (const text of ['1.2.3', '검사 게임', 'portrait', 'theme', '#123456', 'superbox-play', 'https://game.superboxgo.com', '2개']) assert.ok(result.out.includes(text), text);
  });

  it('fails on a missing, broken or tampered file', async () => {
    assert.equal((await run('inspect', 'none.sbp')).code, 4);
    await writeFile('junk.sbp', 'not a zip at all, not even close to one');
    const junk = await run('inspect', 'junk.sbp');
    assert.equal(junk.code, 1);
    assert.ok(junk.err.includes('[ZIP_INVALID]'));

    await writeBuild();
    await run('build', 'build', '--out', 'x.sbp');
    const bytes = await readFile('x.sbp');
    const at = bytes.indexOf('console.info(1)');
    bytes[at] = 0x58;
    await writeFile('tampered.sbp', bytes);
    const tampered = await run('inspect', 'tampered.sbp');
    assert.equal(tampered.code, 1);
    assert.ok(tampered.err.includes('[HASH_MISMATCH]'));
  });
});

describe('error table', () => {
  it('maps every kind to a code and exit status', () => {
    assert.equal(exitCodeOf(new CliError('PORT_IN_USE', '8300')), 5);
    assert.equal(exitCodeOf(new CliError('PORT_INVALID')), 2);
    assert.equal(exitCodeOf(new PackageError('NOT_STORED', 'x')), 1);
    assert.equal(exitCodeOf(new Error('surprise')), 70);
    assert.ok(describeError(new CliError('USAGE')).startsWith('오류 [USAGE] '));
    assert.ok(describeError(new PackageError('NOT_STORED', 'x')).includes('(x)'));
    assert.ok(describeError('plain').startsWith('오류 [INTERNAL] '));
  });
});

describe('formatBytes', () => {
  it('uses one unit', () => {
    assert.equal(formatBytes(12), '12B');
    assert.equal(formatBytes(2048), '2.0KB');
    assert.equal(formatBytes(5 * 1024 * 1024), '5.0MB');
  });
});
