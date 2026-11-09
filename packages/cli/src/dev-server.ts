import { createReadStream, type Stats } from 'node:fs';
import { lstat, open, readFile, realpath } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { promisify } from 'node:util';
import { brotliDecompress, gunzip } from 'node:zlib';
import { contentTypeFor, detectEncoding, ENCODING_HEAD_BYTES, isSafeBuildPath, PackageError } from '../../package-core/src/browser.ts';
import { BUNDLED_RUNTIME, prepareBuild, type EngineName, type PreparedFile, type SuperboxConfig } from '../../package-core/src/index.ts';
import { CliError, describeError } from './errors.ts';

/**
 * `superbox-play dev` — 빌드 폴더를 패키지와 같은 입구로 띄운다. 입구는 요청마다 다시 주입해 설정을 고치고 새로고침하면 바로 보인다.
 * 압축 파일은 운영처럼 Content-Encoding 을 붙여 내리고 캐시하지 않는다(no-store — 빌드를 바꿔도 옛 파일이 남지 않게).
 *
 * `--zone` 이 없으면 게임존 출처 = 이 서버 자신이고 Play SDK 도 이 서버가 내려 준다.
 * 까닭: SDK 는 `<script src>` 출처를 게임존 출처로 믿으므로 같은 출처면 설정 없이 맞고, 부모가 없어 독립 실행(localhost 시뮬레이션)으로 돈다.
 * 운영 SDK 를 받으면 인터넷이 필요하고 운영 CDN 이 아닌 곳에서 부모 없이 돌아 시험이 달라진다.
 * SDK 파일은 CLI 빌드 때 옆에 복사해 둔 사본이다 — 저장소 경로를 실행 때 찾으면 npm 으로 깔린 CLI 에서 깨진다.
 *
 * 이 컴퓨터 밖에서 받을 때(휴대폰 · LAN)는 압축을 풀어 내린다 — 평문 http 의 다른 기기에서는 브라우저가 Content-Encoding: br 을 풀지 않는다.
 * 같은 망의 누구나 닿으므로 점으로 시작하는 파일 · 폴더(.env · .git)는 내리지 않는다.
 */
export const DEFAULT_DEV_PORT = 8300;
const PORT_TRIES = 11;
const SDK_ROUTE = '/sdk/play/v1.js';
const ENTRY_ROUTE = '/index.html';
const VALID_HOST_HEADER = /^[A-Za-z0-9.:[\]-]+$/;
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['127.0.0.1', 'localhost', '::1']);
const DECODERS = { br: promisify(brotliDecompress), gzip: promisify(gunzip) } as const;
/** 휴대폰 브라우저가 받지 못할 크기까지 풀지 않는다 */
const MAX_DECODED_BYTES = 1024 * 1024 * 1024;

interface DecodedFile {
  readonly mtimeMs: number;
  readonly size: number;
  readonly bytes: Promise<Buffer | null>;
}

export interface DevServerOptions {
  readonly folder: string;
  readonly host: string;
  readonly port: number;
  /** 지정한 포트가 쓰이면 다음 번호로 가지 않고 멈춘다. */
  readonly fixedPort: boolean;
  readonly zoneOrigin?: string;
  readonly engine?: EngineName;
  readonly keepMaps?: boolean;
  loadConfig(): Promise<{ readonly config: SuperboxConfig; readonly configDir: string }>;
  /** Play SDK 사본 후보 — 처음 있는 파일을 쓴다. */
  readonly sdkPaths: readonly string[];
}

export interface DevServerHandle {
  readonly url: string;
  readonly port: number;
  close(): Promise<void>;
}

function send(response: ServerResponse, status: number, type: string, body: Uint8Array | string, head: boolean): void {
  response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  response.end(head ? undefined : body);
}

async function readFirstExisting(paths: readonly string[]): Promise<Uint8Array | null> {
  for (const candidate of paths) {
    const bytes = await readFile(candidate).catch(() => null);
    if (bytes) return bytes;
  }
  return null;
}

async function fileHead(file: string): Promise<Uint8Array> {
  const handle = await open(file, 'r');
  try {
    const buffer = new Uint8Array(ENCODING_HEAD_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, ENCODING_HEAD_BYTES, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

function originOf(request: IncomingMessage, fallback: string): string {
  const host = request.headers.host;
  return host && VALID_HOST_HEADER.test(host) ? `http://${host}` : fallback;
}

function preparedBytes(file: PreparedFile | undefined): Uint8Array | null {
  return file?.source.kind === 'bytes' ? file.source.bytes : null;
}

function isHidden(relative: string): boolean {
  return relative.split('/').some((segment) => segment.startsWith('.'));
}

export async function startDevServer(options: DevServerOptions): Promise<DevServerHandle> {
  const root = path.resolve(options.folder);
  const servesOtherDevices = !LOOPBACK_HOSTS.has(options.host);
  const decodedFiles = new Map<string, DecodedFile>();
  let ownOrigin = '';

  /** 중간 폴더가 링크여도 빌드 폴더 밖으로 나가지 않는다 */
  const isInsideRoot = (absolute: string): Promise<boolean> =>
    Promise.all([realpath(root), realpath(path.dirname(absolute))]).then(
      ([realRoot, realParent]) => realParent === realRoot || realParent.startsWith(realRoot + path.sep),
      () => false,
    );

  /** 파일마다 한 번만 푼다 — 새로고침이나 여러 기기의 요청마다 다시 풀지 않게. 크기나 시각이 바뀌면(다시 빌드) 새로 푼다. */
  const decodedBytes = (absolute: string, encoding: keyof typeof DECODERS, info: Stats): Promise<Buffer | null> => {
    const known = decodedFiles.get(absolute);
    if (known && known.mtimeMs === info.mtimeMs && known.size === info.size) return known.bytes;
    const bytes = readFile(absolute)
      .then((source) => DECODERS[encoding](source, { maxOutputLength: MAX_DECODED_BYTES }))
      .catch(() => null);
    decodedFiles.set(absolute, { mtimeMs: info.mtimeMs, size: info.size, bytes });
    return bytes;
  };

  const serveStatic = async (relative: string, response: ServerResponse, head: boolean): Promise<void> => {
    const absolute = path.resolve(root, relative);
    if (!absolute.startsWith(root + path.sep)) {
      send(response, 403, 'text/plain; charset=utf-8', 'forbidden', head);
      return;
    }
    const info: Stats | null = await lstat(absolute).catch(() => null);
    if (!info?.isFile() || !(await isInsideRoot(absolute))) {
      send(response, 404, 'text/plain; charset=utf-8', 'not found', head);
      return;
    }
    const encoding = detectEncoding(relative, await fileHead(absolute));
    if (encoding && servesOtherDevices) {
      const decoded = await decodedBytes(absolute, encoding, info);
      if (decoded) {
        response.writeHead(200, { 'Content-Type': contentTypeFor(relative, encoding), 'Cache-Control': 'no-store', 'Content-Length': decoded.length });
        response.end(head ? undefined : decoded);
        return;
      }
    }
    response.writeHead(200, {
      'Content-Type': contentTypeFor(relative, encoding),
      'Cache-Control': 'no-store',
      'Content-Length': info.size,
      ...(encoding ? { 'Content-Encoding': encoding } : {}),
    });
    if (head) {
      response.end();
      return;
    }
    // 다시 빌드하느라 파일이 사라져도 서버는 죽지 않는다
    createReadStream(absolute).on('error', () => response.destroy()).pipe(response);
  };

  const prepare = async (request: IncomingMessage): Promise<readonly PreparedFile[]> => {
    const { config, configDir } = await options.loadConfig();
    const prepared = await prepareBuild({
      folder: root,
      config,
      configDir,
      zoneOrigin: options.zoneOrigin ?? originOf(request, ownOrigin),
      // 휴대폰에서 LAN 주소로 열어 보는 경우 — 패키지와 달리 http 출처도 받는다
      allowAnyZone: options.zoneOrigin === undefined,
      ...(options.engine === undefined ? {} : { engine: options.engine }),
      keepMaps: options.keepMaps ?? true,
      runtime: BUNDLED_RUNTIME,
    });
    return prepared.files;
  };

  const handle = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const method = request.method ?? 'GET';
    const head = method === 'HEAD';
    if (method !== 'GET' && !head) {
      send(response, 405, 'text/plain; charset=utf-8', 'method not allowed', head);
      return;
    }
    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://local').pathname);
    } catch {
      send(response, 400, 'text/plain; charset=utf-8', 'bad request', head);
      return;
    }
    if (pathname === SDK_ROUTE && options.zoneOrigin === undefined) {
      const sdk = await readFirstExisting(options.sdkPaths);
      if (!sdk) {
        send(response, 500, 'text/plain; charset=utf-8', new CliError('SDK_MISSING').message, head);
        return;
      }
      send(response, 200, 'application/javascript', sdk, head);
      return;
    }
    const route = pathname === '/' ? ENTRY_ROUTE : pathname;
    const relative = route.slice(1);
    if (!isSafeBuildPath(relative) || (servesOtherDevices && isHidden(relative))) {
      send(response, 404, 'text/plain; charset=utf-8', 'not found', head);
      return;
    }
    if (relative === 'index.html' || relative.startsWith('sbp/')) {
      const files = await prepare(request);
      const bytes = preparedBytes(files.find((file) => file.path === relative));
      if (bytes) {
        send(response, 200, contentTypeFor(relative, null), bytes, head);
        return;
      }
      send(response, 404, 'text/plain; charset=utf-8', 'not found', head);
      return;
    }
    await serveStatic(relative, response, head);
  };

  const server: Server = createServer((request, response) => {
    handle(request, response).catch((error: unknown) => {
      if (response.headersSent) {
        response.destroy();
        return;
      }
      const status = error instanceof PackageError ? 422 : 500;
      send(response, status, 'text/plain; charset=utf-8', describeError(error), false);
    });
  });

  const listen = (port: number): Promise<void> =>
    new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, options.host, () => {
        server.off('error', reject);
        resolve();
      });
    });

  let port = options.port;
  for (let attempt = 0; ; attempt += 1) {
    try {
      await listen(port);
      break;
    } catch (error) {
      const inUse = (error as NodeJS.ErrnoException).code === 'EADDRINUSE';
      if (!inUse) throw error;
      if (options.fixedPort || attempt + 1 >= PORT_TRIES) throw new CliError('PORT_IN_USE', String(port));
      port += 1;
    }
  }
  const address = server.address() as AddressInfo;
  const displayHost = options.host === '0.0.0.0' || options.host === '::' ? 'localhost' : options.host;
  ownOrigin = `http://${displayHost}:${address.port}`;
  return {
    url: `${ownOrigin}/`,
    port: address.port,
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}
