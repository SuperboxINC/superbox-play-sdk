import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import path from 'node:path';
import { describe, it } from 'node:test';
import { GAME_CHANNEL_EVENTS, GAME_CHANNEL_METHODS, PLAY_ERROR_CODES, SBPLAY_WRAPPERS } from '../packages/sdk/src/protocol.ts';
import { guidOf, UNITY_PACKAGE_NAME, UNITY_PACKAGE_ROOT, unityAssets } from './unity-meta.mjs';

/**
 * Unity 패키지를 Unity 없이 볼 수 있는 것 — .meta 가 빠지면 git 으로 받은 게임에서 그 파일이 조용히 사라지고, 프로토콜과 어긋나면 게임존에서야 드러난다.
 * C# 동작 시험은 패키지의 Tests/Editor(Unity Test Runner).
 */
const read = (relative) => readFile(path.join(UNITY_PACKAGE_ROOT, relative), 'utf8');

async function runtimeSource() {
  const sources = [];
  for (const { relative, isDirectory } of await unityAssets()) {
    if (!isDirectory && relative.startsWith('Runtime/') && relative.endsWith('.cs')) sources.push(await read(relative));
  }
  return sources.join('\n');
}

const pascal = (name) => `${name[0].toUpperCase()}${name.slice(1)}`;

describe('Unity package assets', () => {
  it('bundles the packager where the menu runs it, with no import left to resolve', async () => {
    const menu = await read('Editor/BuildAndPackage.cs');
    assert.match(menu, /"Editor", "Packager~", "package-build\.mjs"/);
    const bundle = await read('Editor/Packager~/package-build.mjs');
    const imports = [...bundle.matchAll(/^import .* from "([^"]+)";$/gm)].map((match) => match[1]);
    assert.ok(imports.length > 0);
    assert.deepEqual(imports.filter((name) => !builtinModules.includes(name.replace(/^node:/, ''))), []);
  });

  it('has a .meta for every file and folder', async () => {
    const missing = [];
    for (const { relative } of await unityAssets()) {
      await read(`${relative}.meta`).catch(() => missing.push(relative));
    }
    assert.deepEqual(missing, []);
  });

  it('has no .meta left without its file', async () => {
    const assets = new Set((await unityAssets()).map((asset) => asset.relative));
    const walk = async (dir, prefix) => {
      const entries = await readdir(dir, { withFileTypes: true });
      const nested = await Promise.all(
        entries.filter((entry) => !entry.name.endsWith('~')).map(async (entry) => {
          const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
          return entry.isDirectory() ? walk(path.join(dir, entry.name), relative) : [relative];
        }),
      );
      return nested.flat();
    };
    const orphans = (await walk(UNITY_PACKAGE_ROOT, '')).filter((file) => file.endsWith('.meta') && !assets.has(file.slice(0, -'.meta'.length)));
    assert.deepEqual(orphans, []);
  });

  it('gives every asset the GUID of its path, so re-running changes nothing and none collide', async () => {
    const seen = new Set();
    for (const { relative } of await unityAssets()) {
      const guid = /^guid: ([0-9a-f]{32})$/m.exec(await read(`${relative}.meta`))?.[1];
      assert.equal(guid, guidOf(relative), relative);
      assert.ok(!seen.has(guid), relative);
      seen.add(guid);
    }
  });
});

describe('Unity package manifest', () => {
  it('is named and versioned with the tools', async () => {
    const [manifest, tools] = await Promise.all([read('package.json').then(JSON.parse), readFile(new URL('../package.json', import.meta.url), 'utf8').then(JSON.parse)]);
    assert.equal(manifest.name, UNITY_PACKAGE_NAME);
    assert.equal(manifest.version, tools.version);
    assert.ok((await read('Runtime/SuperboxPlay.cs')).includes(`SdkVersion = "${manifest.version}"`));
  });

  it('points at a sample that exists', async () => {
    const manifest = JSON.parse(await read('package.json'));
    for (const sample of manifest.samples) await read(`${sample.path}/QuickStart.cs`);
  });
});

describe('Unity package follows the protocol', () => {
  it('names every method, event and error code', async () => {
    const source = await runtimeSource();
    for (const method of GAME_CHANNEL_METHODS) assert.ok(source.includes(`= "${method}"`), method);
    for (const event of GAME_CHANNEL_EVENTS) assert.ok(source.includes(`= "${event}"`), event);
    for (const code of PLAY_ERROR_CODES) assert.ok(source.includes(`= "${code}"`), code);
  });

  it('has a C# call for every SBPlay wrapper', async () => {
    const source = await runtimeSource();
    const missing = SBPLAY_WRAPPERS.filter((wrapper) => {
      const parts = wrapper.split('.');
      // on · off 는 C# 에서 event 다
      if (wrapper === 'on' || wrapper === 'off') return false;
      if (parts.length === 1) return !new RegExp(`\\b${pascal(parts[0])}Async\\(`).test(source);
      const [group, name] = parts;
      return !new RegExp(`class ${pascal(group)}\\b[\\s\\S]*?\\b${pascal(name)}Async\\(`).test(source);
    });
    assert.deepEqual(missing, []);
  });

  it('forwards every zone event to C#', async () => {
    const source = await read('Runtime/Internal/PlayProtocol.cs');
    const forwarded = /Forwarded = \{([^}]+)\}/.exec(source)?.[1] ?? '';
    assert.equal(forwarded.split(',').length, GAME_CHANNEL_EVENTS.length);
  });

  it('calls every jslib function it imports, with the same names on both sides', async () => {
    const [jslib, js, canvas] = await Promise.all([read('Runtime/Plugins/WebGL/SuperboxPlay.jslib'), read('Runtime/Internal/PlayJsChannel.cs'), read('Runtime/Internal/PlayCanvas.cs')]);
    const declared = [...`${js}\n${canvas}`.matchAll(/extern \w+ (SuperboxPlay_\w+)\(/g)].map((match) => match[1]);
    const exported = [...jslib.matchAll(/^\s{4}(SuperboxPlay_\w+): function/gm)].map((match) => match[1]);
    assert.deepEqual([...declared].sort(), [...exported].sort());
    assert.ok(exported.length >= 5);
  });
});
