import { stat } from 'node:fs/promises';
import { networkInterfaces, type NetworkInterfaceInfo } from 'node:os';
import { DEFAULT_DEV_PORT, startDevServer, type DevServerHandle } from '../../../packages/cli/src/dev-server.ts';
import { lanAddresses, lanUrl } from '../../../packages/cli/src/lan.ts';
import { qrMatrix } from '../../../packages/cli/src/qr.ts';
import { PackageError } from '../../../packages/package-core/src/browser.ts';
import { loadUnityConfig, type UnityPackageRequest } from './package-build.ts';

/**
 * Unity 메뉴 `Test on Device` 의 서버 — CLI `dev --lan` 과 같은 서버다. 답은 C# JsonUtility 가 그대로 읽는 모양이다.
 */
const ALL_NETWORK_CARDS = '0.0.0.0';

export interface DeviceTestAddress {
  readonly url: string;
  readonly qrSize: number;
  /** 왼쪽 위부터 줄 순서로 이어 붙인 QR 칸 — 1 이 어두운 칸 */
  readonly qr: string;
}

export interface DeviceTestAnswer {
  readonly ok: true;
  readonly port: number;
  readonly localUrl: string;
  readonly addresses: readonly DeviceTestAddress[];
}

export interface DeviceTestStarted {
  readonly handle: DevServerHandle;
  readonly answer: DeviceTestAnswer;
}

export interface DeviceTestEnvironment {
  /** Play SDK 사본 후보 */
  readonly sdkPaths: readonly string[];
  readonly interfaces?: Readonly<Record<string, readonly NetworkInterfaceInfo[] | undefined>>;
}

function addressOf(address: string, port: number): DeviceTestAddress {
  const url = lanUrl(address, port);
  const { size, modules } = qrMatrix(url);
  return { url, qrSize: size, qr: modules };
}

export async function startDeviceTest(request: UnityPackageRequest, environment: DeviceTestEnvironment): Promise<DeviceTestStarted> {
  const folder = await stat(request.folder).catch(() => null);
  if (!folder?.isDirectory()) throw new PackageError('FOLDER_MISSING', request.folder);
  const handle = await startDevServer({
    folder: request.folder,
    host: ALL_NETWORK_CARDS,
    port: DEFAULT_DEV_PORT,
    fixedPort: false,
    engine: 'unity',
    loadConfig: async () => ({ config: (await loadUnityConfig(request)).config, configDir: request.projectDir }),
    sdkPaths: environment.sdkPaths,
  });
  const addresses = lanAddresses(environment.interfaces ?? networkInterfaces()).map((address) => addressOf(address, handle.port));
  return { handle, answer: { ok: true, port: handle.port, localUrl: handle.url, addresses } };
}
