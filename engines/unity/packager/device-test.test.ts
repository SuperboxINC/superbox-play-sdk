import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import type { NetworkInterfaceInfo } from 'node:os';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { brotliCompressSync } from 'node:zlib';
import { startDeviceTest, type DeviceTestStarted } from './device-test.ts';

const INDEX = '<!DOCTYPE html><html><head><title>Game</title></head><body><canvas id="unity-canvas"></canvas><script src="Build/Game.loader.js"></script></body></html>';
const WASM_BODY = 'wasm bytes wasm bytes wasm bytes';
const WIFI: Record<string, NetworkInterfaceInfo[]> = {
  en0: [{ address: '192.168.0.12', family: 'IPv4', internal: false, netmask: '255.255.255.0', mac: '00:00:00:00:00:00', cidr: '192.168.0.12/24' }],
};

describe('Unity 기기 테스트 서버', () => {
  let root: string;
  let folder: string;
  let sdkFile: string;
  let started: DeviceTestStarted;

  const start = (interfaces: Record<string, NetworkInterfaceInfo[]>): Promise<DeviceTestStarted> =>
    startDeviceTest({ folder, projectDir: root, version: '1.2.3', title: '드랍 더 넘버' }, { sdkPaths: [sdkFile], interfaces });
  const local = (pathname: string): string => `http://127.0.0.1:${started.answer.port}${pathname}`;

  before(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'unity-device-test-'));
    folder = path.join(root, 'Build/SuperboxPlay/WebGL');
    await mkdir(path.join(folder, 'Build'), { recursive: true });
    await writeFile(path.join(folder, 'index.html'), INDEX);
    await writeFile(path.join(folder, 'Build/Game.loader.js'), 'function createUnityInstance() {}');
    await writeFile(path.join(folder, 'Build/Game.wasm.br'), brotliCompressSync(Buffer.from(WASM_BODY)));
    sdkFile = path.join(root, 'v1.js');
    await writeFile(sdkFile, 'window.SBPlay = {};');
    started = await start(WIFI);
  });

  after(async () => {
    await started.handle.close();
    await rm(root, { recursive: true, force: true });
  });

  it('답에 휴대폰이 열 주소와 그 QR 을 싣는다', () => {
    const { ok, port, addresses } = started.answer;
    assert.equal(ok, true);
    assert.ok(port > 0);
    assert.equal(addresses.length, 1);
    assert.equal(addresses[0]?.url, `http://192.168.0.12:${port}/`);
    assert.equal(addresses[0]?.qr.length, (addresses[0]?.qrSize ?? 0) ** 2);
  });

  it('Player Settings 의 이름으로 시작 파일을 내주고 SDK 도 자기가 내준다', async () => {
    const html = await (await fetch(local('/'))).text();
    assert.ok(html.includes('드랍 더 넘버'));
    assert.ok(html.includes(`:${started.answer.port}/sdk/play/v1.js`));
    assert.equal(await (await fetch(local('/sdk/play/v1.js'))).text(), 'window.SBPlay = {};');
  });

  it('Unity 의 Brotli 빌드도 휴대폰이 읽게 풀어서 내린다', async () => {
    const response = await fetch(local('/Build/Game.wasm.br'), { headers: { 'accept-encoding': 'identity' } });
    assert.equal(response.headers.get('content-encoding'), null);
    assert.equal(response.headers.get('content-type'), 'application/wasm');
    assert.equal(await response.text(), WASM_BODY);
  });

  it('빌드 폴더가 없으면 서버를 켜지 않고 까닭을 알린다', async () => {
    await assert.rejects(startDeviceTest({ folder: path.join(root, 'missing'), projectDir: root }, { sdkPaths: [sdkFile], interfaces: WIFI }), { code: 'FOLDER_MISSING' });
  });

  it('망이 없으면 주소 없이 답한다', async () => {
    const offline = await start({});
    try {
      assert.equal(offline.answer.ok, true);
      assert.deepEqual(offline.answer.addresses, []);
    } finally {
      await offline.handle.close();
    }
  });
});
