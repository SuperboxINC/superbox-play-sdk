import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { verifyPackageFile } from '../../../packages/package-core/src/index.ts';
import { packageUnityBuild } from './package-build.ts';

const INDEX = '<!DOCTYPE html><html><head><title>Game</title></head><body><canvas id="unity-canvas"></canvas><script src="Build/Game.loader.js"></script></body></html>';

describe('Unity 메뉴의 패키징', () => {
  let root: string;
  let projectDir: string;
  let folder: string;

  before(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'unity-packager-'));
  });

  after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function freshProject(name: string): Promise<void> {
    projectDir = path.join(root, name);
    folder = path.join(projectDir, 'Build/SuperboxPlay/WebGL');
    await mkdir(path.join(folder, 'Build'), { recursive: true });
    await writeFile(path.join(folder, 'index.html'), INDEX);
    await writeFile(path.join(folder, 'Build/Game.loader.js'), 'function createUnityInstance() {}');
  }

  it('Player Settings 의 버전과 이름을 쓰고, 패키지를 빌드 폴더 옆에 둔다', async () => {
    await freshProject('player-settings');

    const report = await packageUnityBuild({ folder, projectDir, version: '1.2.3', title: '드랍 더 넘버' });

    assert.equal(report.outPath, `${folder}-1.2.3.sbp`);
    assert.equal(report.manifest.version, '1.2.3');
    assert.equal(report.manifest.title, '드랍 더 넘버');
    assert.equal(report.manifest.engine.name, 'unity');
    assert.equal((await verifyPackageFile(report.outPath)).manifest.version, '1.2.3');
  });

  it('설정 파일이 있으면 Player Settings 보다 앞선다', async () => {
    await freshProject('config-wins');
    await writeFile(path.join(projectDir, 'superbox.config.json'), JSON.stringify({ version: '9.0.0', title: '설정의 이름' }));

    const report = await packageUnityBuild({ folder, projectDir, version: '1.2.3', title: 'Player' });

    assert.equal(report.manifest.version, '9.0.0');
    assert.equal(report.manifest.title, '설정의 이름');
  });

  it('형식에 맞지 않는 Player Settings 버전은 기본 버전으로 만들고 경고한다', async () => {
    await freshProject('bad-version');

    const report = await packageUnityBuild({ folder, projectDir, version: '버전 하나', title: 'Game' });

    assert.equal(report.manifest.version, '1.0.0');
    assert.equal(report.outPath, `${folder}-1.0.0.sbp`);
    assert.ok(report.warnings.some((item) => item.code === 'VERSION_DEFAULTED'));
  });

  it('C# 이 빈 문자열로 쓴 칸은 없는 것으로 본다', async () => {
    await freshProject('empty-values');

    const report = await packageUnityBuild({ folder, projectDir, version: '', title: '', zoneOrigin: '' });

    assert.equal(report.manifest.version, '1.0.0');
    assert.equal(report.manifest.title, null);
    assert.equal(report.manifest.zoneOrigin, 'https://game.superboxgo.com');
  });

  it('로컬 게임존 주소를 받으면 그 주소로 묶는다', async () => {
    await freshProject('local-zone');

    const report = await packageUnityBuild({ folder, projectDir, version: '1.0.0', title: 'Game', zoneOrigin: 'http://localhost:8200' });

    assert.equal(report.manifest.zoneOrigin, 'http://localhost:8200');
    assert.ok(report.warnings.some((item) => item.code === 'LOCAL_ZONE'));
  });

  it('깨진 설정 파일은 무시하지 않고 멈춘다', async () => {
    await freshProject('broken-config');
    await writeFile(path.join(projectDir, 'superbox.config.json'), '{ 깨진 파일');

    await assert.rejects(packageUnityBuild({ folder, projectDir, version: '1.0.0', title: 'Game' }), { code: 'CONFIG_INVALID' });
  });
});
