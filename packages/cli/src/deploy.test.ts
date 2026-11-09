import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import { createPackage } from '../../package-core/src/index.ts';
import { main } from './cli.ts';
import { assertConsoleOrigin, deployPackage, DEFAULT_CONSOLE_ORIGIN, resolveApiKey, type DeployOptions } from './deploy.ts';
import { CliError, cliErrorFromApi, exitCodeOf } from './errors.ts';

/**
 * 가짜 콘솔 · 가짜 저장소로 흐름 · 재시도 · 키 비노출을 본다.
 */
const SECRET = `sbk_${'a1b2c3d4'.repeat(8)}`;
const SLUG = 'sample-game';
const CHANNEL = 'p_testchannel';
const BUILD_KEY = 'b_test000001';

interface RecordedPut {
  readonly path: string;
  readonly headers: IncomingMessage['headers'];
  readonly body: Buffer;
}

interface Backend {
  origin: string;
  createBody: Record<string, unknown> | null;
  createHeaders: IncomingMessage['headers'] | null;
  completeCalls: number;
  completeHeaders: IncomingMessage['headers'] | null;
  puts: RecordedPut[];
  inFlight: number;
  maxInFlight: number;
  /** true 를 돌려주면 응답을 직접 한 것 — 시도 번호는 1부터. */
  respondPut: ((filePath: string, attempt: number, res: ServerResponse) => boolean) | null;
  respondCreate: ((res: ServerResponse) => boolean) | null;
  respondComplete: ((attempt: number, res: ServerResponse) => boolean) | null;
  attempts: Map<string, number>;
  rawRequests: string[];
}

function json(res: ServerResponse, status: number, body: unknown): boolean {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
  return true;
}

let root = '';
let packageFile = '';
let server: Server;
let backend: Backend;

function freshBackend(origin: string): Backend {
  return {
    origin,
    createBody: null,
    createHeaders: null,
    completeCalls: 0,
    completeHeaders: null,
    puts: [],
    inFlight: 0,
    maxInFlight: 0,
    respondPut: null,
    respondCreate: null,
    respondComplete: null,
    attempts: new Map(),
    rawRequests: [],
  };
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

async function handleCreate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  backend.createHeaders = req.headers;
  const body = JSON.parse((await readBody(req)).toString()) as { version: string; files: { path: string }[] };
  backend.createBody = body as unknown as Record<string, unknown>;
  if (backend.respondCreate?.(res)) return;
  json(res, 201, {
    build: { buildKey: BUILD_KEY, version: body.version, status: 'uploading' },
    uploads: body.files.map((file) => ({
      path: file.path,
      url: `${backend.origin}/s3/${encodeURIComponent(file.path)}?X-Amz-Signature=secret-signature`,
      headers: { 'Content-Type': 'application/octet-stream', 'If-None-Match': '*', 'x-amz-checksum-sha256': 'abc=' },
    })),
  });
}

async function handlePut(filePath: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const attempt = (backend.attempts.get(filePath) ?? 0) + 1;
  backend.attempts.set(filePath, attempt);
  backend.inFlight += 1;
  backend.maxInFlight = Math.max(backend.maxInFlight, backend.inFlight);
  const body = await readBody(req);
  await new Promise((resolve) => setTimeout(resolve, 5));
  backend.inFlight -= 1;
  if (backend.respondPut?.(filePath, attempt, res)) return;
  backend.puts.push({ path: filePath, headers: req.headers, body });
  res.writeHead(200);
  res.end();
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://local');
  backend.rawRequests.push(`${req.method} ${url.pathname}`);
  if (req.method === 'POST' && url.pathname === `/api/v1/console/ci/games/${SLUG}/builds`) {
    await handleCreate(req, res);
    return;
  }
  if (req.method === 'POST' && url.pathname === `/api/v1/console/ci/games/${SLUG}/builds/${BUILD_KEY}/complete`) {
    backend.completeCalls += 1;
    backend.completeHeaders = req.headers;
    if (!backend.respondComplete?.(backend.completeCalls, res)) json(res, 200, { buildKey: BUILD_KEY, status: 'ready' });
    return;
  }
  if (req.method === 'PUT' && url.pathname.startsWith('/s3/')) {
    await handlePut(decodeURIComponent(url.pathname.slice('/s3/'.length)), req, res);
    return;
  }
  json(res, 404, { code: 'NOT_FOUND', message: 'unexpected request' });
}

before(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'sbp-deploy-'));
  const folder = path.join(root, 'build');
  await mkdir(path.join(folder, 'assets'), { recursive: true });
  await writeFile(path.join(folder, 'index.html'), '<!doctype html><html><head><title>t</title></head><body><script src="game.js"></script></body></html>');
  await writeFile(path.join(folder, 'game.js'), 'window.sampleMarker = "game-content";');
  await writeFile(path.join(folder, 'empty.txt'), '');
  for (let index = 0; index < 12; index += 1) await writeFile(path.join(folder, `assets/f${index}.bin`), Buffer.alloc(2000 + index, index));
  packageFile = path.join(root, 'game.sbp');
  await createPackage({ folder, out: packageFile, tool: { name: 'superbox-play', version: '0.1.0' }, config: { version: '1.0.3', title: '배포 시험' }, zoneOrigin: 'http://localhost:8200' });
  server = createServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      res.writeHead(500);
      res.end(String(error));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
});

after(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await rm(root, { recursive: true, force: true });
});

beforeEach(() => {
  backend = freshBackend(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
});

function options(overrides: Partial<DeployOptions> = {}): DeployOptions & { readonly lines: string[] } {
  const lines: string[] = [];
  return {
    file: packageFile,
    game: SLUG,
    channel: CHANNEL,
    consoleOrigin: backend.origin,
    apiKey: SECRET,
    out: (text) => lines.push(text),
    sleep: async () => undefined,
    lines,
    ...overrides,
  };
}

async function failsWith(run: Promise<unknown>, code: string): Promise<CliError> {
  let caught: unknown;
  try {
    await run;
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof CliError, `CliError 가 아니다: ${String(caught)}`);
  assert.equal(caught.code, code);
  return caught;
}

describe('deploy flow', () => {
  it('creates, uploads every file with its headers, adds the manifest row, completes', async () => {
    const result = await deployPackage(options({ note: '광고 지면 추가' }));

    assert.equal(result.buildKey, BUILD_KEY);
    assert.equal(result.version, '1.0.3');
    const body = backend.createBody as unknown as {
      partnerKey: string;
      version: string;
      entryPath: string;
      note: string;
      package: Record<string, unknown>;
      files: { path: string; size: number; sha256: string; encoding: string | null }[];
    };
    assert.equal(body.partnerKey, CHANNEL);
    assert.equal(body.version, '1.0.3');
    assert.equal(body.entryPath, 'index.html');
    assert.equal(body.note, '광고 지면 추가');
    assert.deepEqual(Object.keys(body.package).sort(), ['createdAt', 'engine', 'format', 'loading', 'orientation', 'title', 'tool', 'zoneOrigin'].sort());
    assert.equal(body.package.title, '배포 시험');
    assert.equal(body.package.zoneOrigin, 'http://localhost:8200');
    assert.ok(body.files.every((file) => /^[0-9a-f]{64}$/.test(file.sha256)));

    const manifestRow = body.files.find((file) => file.path === 'sbp-manifest.json');
    assert.ok(manifestRow, 'sbp-manifest.json 한 줄');
    assert.equal(manifestRow.encoding, null);

    assert.equal(backend.puts.length, body.files.length);
    for (const file of body.files) {
      const put = backend.puts.find((item) => item.path === file.path);
      assert.ok(put, file.path);
      assert.equal(put.body.length, file.size, file.path);
      assert.equal(createHash('sha256').update(put.body).digest('hex'), file.sha256, file.path);
      assert.equal(put.headers['if-none-match'], '*');
      assert.equal(put.headers['x-amz-checksum-sha256'], 'abc=');
      assert.equal(put.headers['content-length'], String(file.size), '서명에 든 Content-Length — chunked 로 나가면 저장소가 거절한다');
      assert.equal(put.headers['transfer-encoding'], undefined);
    }
    assert.equal(JSON.parse(backend.puts.find((item) => item.path === 'sbp-manifest.json')?.body.toString() ?? '{}').version, '1.0.3');

    assert.equal(backend.completeCalls, 1);
    assert.ok(result.consoleUrl.startsWith(`${backend.origin}/games/${SLUG}/release?`));
    assert.ok(result.consoleUrl.includes(`id=${BUILD_KEY}`));
    assert.ok(result.consoleUrl.includes(`channel=${CHANNEL}`));
  });

  it('runs at most four uploads at once', async () => {
    await deployPackage(options());
    assert.ok(backend.maxInFlight > 1, `동시 ${backend.maxInFlight}`);
    assert.ok(backend.maxInFlight <= 4, `동시 ${backend.maxInFlight}`);
  });

  it('never requests review or release', async () => {
    await deployPackage(options());
    const posts = backend.rawRequests.filter((line) => line.startsWith('POST'));
    assert.deepEqual(posts, [`POST /api/v1/console/ci/games/${SLUG}/builds`, `POST /api/v1/console/ci/games/${SLUG}/builds/${BUILD_KEY}/complete`]);
  });

  it('leaves note out when not given', async () => {
    await deployPackage(options());
    assert.equal('note' in (backend.createBody as object), false);
  });

  it('refuses a package whose content does not match before making a build', async () => {
    const bytes = await readFile(packageFile);
    const at = bytes.indexOf('game-content');
    assert.ok(at > 0);
    bytes[at] = 0x58;
    const tampered = path.join(root, 'tampered.sbp');
    await writeFile(tampered, bytes);
    await assert.rejects(deployPackage(options({ file: tampered })), (error: { code?: string }) => error.code === 'HASH_MISMATCH');
    assert.equal(backend.createBody, null, '서버에 빌드 행을 남기지 않는다');
  });

  it('drops a key or length the server might echo in the upload headers', async () => {
    backend.respondCreate = (res) => {
      const files = (backend.createBody as unknown as { files: { path: string }[] }).files;
      return json(res, 201, {
        build: { buildKey: BUILD_KEY },
        uploads: files.map((file) => ({
          path: file.path,
          url: `${backend.origin}/s3/${encodeURIComponent(file.path)}`,
          headers: { authorization: `Bearer ${SECRET}`, 'content-length': '1' },
        })),
      });
    };
    await deployPackage(options());
    for (const put of backend.puts) {
      assert.equal(put.headers.authorization, undefined);
      assert.equal(put.headers['content-length'], String(put.body.length));
    }
  });
});

describe('upload retries', () => {
  it('retries 5xx and then succeeds', async () => {
    const seen: number[] = [];
    backend.respondPut = (filePath, attempt, res) => {
      if (filePath !== 'game.js') return false;
      seen.push(attempt);
      if (attempt >= 3) return false;
      res.writeHead(503);
      res.end('slow down');
      return true;
    };
    await deployPackage(options());
    assert.deepEqual(seen, [1, 2, 3]);
    assert.equal(backend.completeCalls, 1);
  });

  it('waits longer between tries', async () => {
    const waits: number[] = [];
    backend.respondPut = (filePath, attempt, res) => {
      if (filePath !== 'game.js' || attempt >= 3) return false;
      res.writeHead(500);
      res.end();
      return true;
    };
    await deployPackage(options({ sleep: async (ms) => void waits.push(ms) }));
    assert.deepEqual(waits, [500, 2000]);
  });

  it('retries a dropped connection and reads the body again from the start', async () => {
    backend.respondPut = (filePath, attempt, res) => {
      if (filePath !== 'game.js' || attempt > 1) return false;
      res.destroy();
      return true;
    };
    await deployPackage(options());
    assert.equal(backend.attempts.get('game.js'), 2);
    assert.equal(backend.puts.find((item) => item.path === 'game.js')?.body.toString(), 'window.sampleMarker = "game-content";');
  });

  it('gives up after three tries and names the file, not the url', async () => {
    backend.respondPut = (filePath, _attempt, res) => {
      if (filePath !== 'game.js') return false;
      res.writeHead(500);
      res.end('boom');
      return true;
    };
    const run = options();
    const error = await failsWith(deployPackage(run), 'UPLOAD_FAILED');
    assert.equal(backend.attempts.get('game.js'), 3);
    assert.ok(error.message.includes('game.js'));
    assert.equal(error.message.includes('X-Amz-Signature'), false);
    assert.equal(backend.completeCalls, 0);
    assert.ok(run.lines.join('').includes(BUILD_KEY), '남은 빌드 키를 알린다');
  });

  it('does not retry 4xx and reports the storage code', async () => {
    backend.respondPut = (filePath, _attempt, res) => {
      if (filePath !== 'game.js') return false;
      res.writeHead(403);
      res.end('<Error><Code>AccessDenied</Code><StringToSign>private</StringToSign></Error>');
      return true;
    };
    const error = await failsWith(deployPackage(options()), 'UPLOAD_REJECTED');
    assert.equal(backend.attempts.get('game.js'), 1);
    assert.ok(error.message.includes('403 AccessDenied'));
    assert.equal(error.message.includes('private'), false, '저장소 응답 본문을 그대로 찍지 않는다');
  });

  for (const storageCode of ['BadDigest', 'XAmzContentChecksumMismatch', 'XAmzContentSHA256Mismatch']) {
    it(`a checksum rejection (${storageCode}) says the package is corrupt`, async () => {
      backend.respondPut = (filePath, _attempt, res) => {
        if (filePath !== 'game.js') return false;
        res.writeHead(400);
        res.end(`<Error><Code>${storageCode}</Code></Error>`);
        return true;
      };
      const error = await failsWith(deployPackage(options()), 'PACKAGE_CORRUPT');
      assert.equal(backend.attempts.get('game.js'), 1);
      assert.ok(error.message.includes('패키지가 손상됐어요'));
      assert.equal(exitCodeOf(error), 1);
    });
  }

  it('another 400 is a rejection, not corruption', async () => {
    backend.respondPut = (filePath, _attempt, res) => {
      if (filePath !== 'game.js') return false;
      res.writeHead(400);
      res.end('<Error><Code>ExpiredToken</Code></Error>');
      return true;
    };
    await failsWith(deployPackage(options()), 'UPLOAD_REJECTED');
  });

  it('412 after a lost response means the earlier try landed', async () => {
    backend.respondPut = (filePath, attempt, res) => {
      if (filePath !== 'game.js') return false;
      if (attempt === 1) {
        res.destroy();
        return true;
      }
      res.writeHead(412);
      res.end('<Error><Code>PreconditionFailed</Code></Error>');
      return true;
    };
    await deployPackage(options());
    assert.equal(backend.completeCalls, 1);
  });

  it('412 on the first try is a real rejection', async () => {
    backend.respondPut = (filePath, _attempt, res) => {
      if (filePath !== 'game.js') return false;
      res.writeHead(412);
      res.end();
      return true;
    };
    await failsWith(deployPackage(options()), 'UPLOAD_REJECTED');
  });

  it('stops starting new uploads after a fatal failure', async () => {
    backend.respondPut = (_filePath, _attempt, res) => {
      res.writeHead(403);
      res.end();
      return true;
    };
    await failsWith(deployPackage(options()), 'UPLOAD_REJECTED');
    assert.ok(backend.attempts.size <= 4, `시작한 파일 ${backend.attempts.size}개`);
  });

  it('complete is retried on 5xx', async () => {
    backend.respondComplete = (attempt, res) => {
      if (attempt >= 2) return false;
      return json(res, 503, {});
    };
    await deployPackage(options());
    assert.equal(backend.completeCalls, 2);
  });

  it('complete is retried on a dropped connection, then gives up', async () => {
    backend.respondComplete = (_attempt, res) => {
      res.destroy();
      return true;
    };
    await failsWith(deployPackage(options()), 'SERVER_UNAVAILABLE');
    assert.equal(backend.completeCalls, 3);
  });

  it('a rejected complete is final and keeps the server message', async () => {
    backend.respondComplete = (_attempt, res) => json(res, 409, { code: 'PLAY_BUILD_UPLOAD_INCOMPLETE', message: '3/15 파일이 올라왔다' });
    const run = options();
    const error = await failsWith(deployPackage(run), 'PLAY_BUILD_UPLOAD_INCOMPLETE');
    assert.equal(backend.completeCalls, 1);
    assert.ok(error.message.includes('3/15'));
    assert.ok(run.lines.join('').includes(BUILD_KEY));
  });

  it('does not retry creating the build — a second call would collide on the version', async () => {
    let calls = 0;
    backend.respondCreate = (res) => {
      calls += 1;
      res.destroy();
      return true;
    };
    await failsWith(deployPackage(options()), 'SERVER_UNAVAILABLE');
    assert.equal(calls, 1);
  });
});

describe('API errors', () => {
  const CASES: readonly (readonly [number, string, number])[] = [
    [401, 'CONSOLE_API_KEY_INVALID', 6],
    [401, 'CONSOLE_API_KEY_EXPIRED', 6],
    [403, 'CONSOLE_API_KEY_SCOPE', 6],
    [404, 'PLAY_GAME_NOT_FOUND', 7],
    [403, 'CONSOLE_CHANNEL_NOT_ALLOWED', 7],
    [409, 'CONSOLE_CHANNEL_PAUSED', 7],
    [409, 'CONSOLE_GAME_CLOSING', 7],
    [409, 'CONSOLE_GAME_CLOSED', 7],
    [409, 'PLAY_BUILD_VERSION_TAKEN', 7],
    [400, 'PLAY_BUILD_PACKAGE_INVALID', 7],
    [400, 'PLAY_BUILD_PACKAGE_ZONE_NOT_ALLOWED', 7],
    [400, 'PLAY_BUILD_PATH_RESERVED', 7],
    [400, 'PLAY_BUILD_PATH_INVALID', 7],
    [400, 'PLAY_BUILD_ENTRY_MISSING', 7],
    [400, 'PLAY_BUILD_TOO_LARGE', 7],
    [429, 'CONSOLE_API_KEY_RATE_LIMITED', 8],
    [429, 'CONSOLE_ISSUE_RATE_LIMITED', 8],
  ];

  for (const [status, code, exit] of CASES) {
    it(`${status} ${code} → Korean message and exit ${exit}`, async () => {
      backend.respondCreate = (res) => json(res, status, { code, message: 'server text', field: 'zoneOrigin' });
      const error = await failsWith(deployPackage(options()), code);
      assert.equal(exitCodeOf(error), exit);
      assert.ok(/[가-힣]/.test(error.message), error.message);
      assert.ok(error.message.includes('zoneOrigin'), error.message);
    });
  }

  it('게임존 거절은 고칠 방법을 CLI 문구가 말한다 — 서버의 안쪽 문구를 덧붙이지 않는다', () => {
    const error = cliErrorFromApi(400, {
      code: 'PLAY_BUILD_PACKAGE_ZONE_NOT_ALLOWED',
      field: 'zoneOrigin',
      message: 'zoneOrigin — 이 환경에 올릴 수 없는 게임존 — 도구의 --zone 으로 다시 만든다 (받은 값: "https://game.example")',
    });
    assert.ok(error.message.endsWith('(zoneOrigin)'), error.message);
    assert.ok(!error.message.includes('다시 만든다'), error.message);
  });

  it('서버 문구가 칸 이름으로 시작해도 칸 이름은 한 번만 보인다', () => {
    const error = cliErrorFromApi(400, { code: 'PLAY_BUILD_PACKAGE_INVALID', field: 'createdAt', message: 'createdAt — 시각 꼴이 아니다' });
    assert.ok(error.message.endsWith('(createdAt — 시각 꼴이 아니다)'), error.message);
  });

  it('falls back by status for bodies without a known code', () => {
    assert.equal(cliErrorFromApi(401, {}).code, 'CONSOLE_API_KEY_INVALID');
    assert.equal(cliErrorFromApi(403, {}).code, 'CONSOLE_API_KEY_SCOPE');
    assert.equal(cliErrorFromApi(429, {}).code, 'CONSOLE_API_KEY_RATE_LIMITED');
    assert.equal(cliErrorFromApi(502, {}).code, 'SERVER_UNAVAILABLE');
    const plain = cliErrorFromApi(404, {});
    assert.equal(plain.code, 'API_REJECTED');
    assert.ok(plain.message.includes('404'), '프록시 응답 — 상태라도 보여 준다');
    const unknown = cliErrorFromApi(400, { code: 'SOMETHING_NEW', message: '설명' });
    assert.equal(unknown.code, 'API_REJECTED');
    assert.ok(unknown.message.includes('400 SOMETHING_NEW'));
    assert.ok(unknown.message.includes('설명'));
    // Object 의 이름을 코드로 보내도 표를 잘못 읽지 않는다
    assert.equal(cliErrorFromApi(400, { code: 'constructor' }).code, 'API_REJECTED');
  });

  it('5xx from the console is a try-later', async () => {
    backend.respondCreate = (res) => json(res, 500, { message: 'oops' });
    const error = await failsWith(deployPackage(options()), 'SERVER_UNAVAILABLE');
    assert.equal(exitCodeOf(error), 8);
  });

  it('a server that does not speak the contract is reported, not crashed on', async () => {
    backend.respondCreate = (res) => json(res, 201, { build: { buildKey: BUILD_KEY } });
    await failsWith(deployPackage(options()), 'SERVER_RESPONSE_INVALID');
    backend.respondCreate = (res) => json(res, 201, { build: { buildKey: BUILD_KEY }, uploads: [] });
    await failsWith(deployPackage(options()), 'SERVER_RESPONSE_INVALID');
    backend.respondCreate = (res) => json(res, 201, { build: { buildKey: BUILD_KEY }, uploads: [{ path: 'game.js', url: 'ftp://x/y', headers: {} }] });
    await failsWith(deployPackage(options()), 'SERVER_RESPONSE_INVALID');
    backend.respondCreate = (res) => {
      res.writeHead(201);
      res.end('<html>not json</html>');
      return true;
    };
    await failsWith(deployPackage(options()), 'SERVER_RESPONSE_INVALID');
  });
});

describe('--console', () => {
  it('accepts https and local http only — the key must not travel in clear text', () => {
    assert.doesNotThrow(() => assertConsoleOrigin(DEFAULT_CONSOLE_ORIGIN));
    assert.doesNotThrow(() => assertConsoleOrigin('http://console.localhost:8200'));
    assert.doesNotThrow(() => assertConsoleOrigin('http://127.0.0.1:3200'));
    for (const bad of ['http://console.superboxgo.com', 'https://console.superboxgo.com/', 'ftp://x', 'nope']) {
      assert.throws(() => assertConsoleOrigin(bad), (error: unknown) => error instanceof CliError && error.code === 'CONSOLE_ORIGIN_INVALID', bad);
    }
  });
});

describe('the API key stays secret', () => {
  async function runCli(args: readonly string[], env: string | undefined): Promise<{ code: number; out: string; err: string }> {
    const previous = process.env.SUPERBOX_PLAY_API_KEY;
    if (env === undefined) delete process.env.SUPERBOX_PLAY_API_KEY;
    else process.env.SUPERBOX_PLAY_API_KEY = env;
    let out = '';
    let err = '';
    try {
      const code = await main(args, {
        out: (text) => {
          out += text;
        },
        err: (text) => {
          err += text;
        },
      });
      return { code, out, err };
    } finally {
      if (previous === undefined) delete process.env.SUPERBOX_PLAY_API_KEY;
      else process.env.SUPERBOX_PLAY_API_KEY = previous;
    }
  }

  function deployArgs(extra: readonly string[] = []): readonly string[] {
    return ['deploy', packageFile, '--game', SLUG, '--channel', CHANNEL, '--console', backend.origin, ...extra];
  }

  it('sends the key as a bearer header to the console only — never to storage', async () => {
    const result = await runCli(deployArgs(), SECRET);
    assert.equal(result.code, 0, result.err);
    assert.equal(backend.createHeaders?.authorization, `Bearer ${SECRET}`);
    assert.equal(backend.completeHeaders?.authorization, `Bearer ${SECRET}`);
    assert.ok(backend.puts.length > 0);
    for (const put of backend.puts) assert.equal(put.headers.authorization, undefined, put.path);
  });

  it('does not print the key on success, and says what comes next', async () => {
    const result = await runCli(deployArgs(), SECRET);
    assert.equal(result.code, 0, result.err);
    assert.equal(`${result.out}${result.err}`.includes(SECRET), false);
    assert.ok(result.out.includes(BUILD_KEY));
    assert.ok(result.out.includes('1.0.3'));
    assert.ok(result.out.includes(CHANNEL));
    assert.ok(result.out.includes(`/games/${SLUG}/release`));
    assert.ok(result.out.includes('검수'));
  });

  it('hides the key even when the server echoes it back in an error', async () => {
    backend.respondCreate = (res) => json(res, 400, { code: 'PLAY_BUILD_PACKAGE_INVALID', field: 'title', message: `받은 값 ${SECRET}` });
    const result = await runCli(deployArgs(), SECRET);
    assert.equal(result.code, 7);
    assert.equal(`${result.out}${result.err}`.includes(SECRET), false);
    assert.ok(result.err.includes('***'));
  });

  it('hides a key given with --api-key, and warns about the option', async () => {
    backend.respondCreate = (res) => json(res, 401, { code: 'CONSOLE_API_KEY_INVALID', message: `key ${SECRET} rejected` });
    const result = await runCli(deployArgs(['--api-key', SECRET]), undefined);
    assert.equal(result.code, 6);
    assert.equal(`${result.out}${result.err}`.includes(SECRET), false);
    assert.ok(result.err.includes('SUPERBOX_PLAY_API_KEY'));
    assert.equal(backend.createHeaders?.authorization, `Bearer ${SECRET}`);
  });

  it('hides it in --api-key=value form and on usage errors', async () => {
    const result = await runCli(['deploy', packageFile, `--api-key=${SECRET}`, '--bogus'], undefined);
    assert.equal(result.code, 2);
    assert.equal(`${result.out}${result.err}`.includes(SECRET), false);
  });

  it('hides it with surrounding whitespace from a pasted environment value', async () => {
    backend.respondCreate = (res) => json(res, 400, { code: 'PLAY_BUILD_PACKAGE_INVALID', message: `받은 값 ${SECRET}` });
    const result = await runCli(deployArgs(), `  ${SECRET}\n`);
    assert.equal(result.code, 7);
    assert.equal(backend.createHeaders?.authorization, `Bearer ${SECRET}`);
    assert.equal(`${result.out}${result.err}`.includes(SECRET), false);
  });

  it('prefers --api-key over the environment', async () => {
    const other = `sbk_${'f'.repeat(64)}`;
    const result = await runCli(deployArgs(['--api-key', other]), SECRET);
    assert.equal(result.code, 0, result.err);
    assert.equal(backend.createHeaders?.authorization, `Bearer ${other}`);
    assert.equal(`${result.out}${result.err}`.includes(other), false);
    assert.equal(`${result.out}${result.err}`.includes(SECRET), false);
  });

  it('does not print presigned urls', async () => {
    backend.respondPut = (_filePath, _attempt, res) => {
      res.writeHead(500);
      res.end();
      return true;
    };
    const result = await runCli(deployArgs(), SECRET);
    assert.equal(result.code, 8);
    assert.equal(`${result.out}${result.err}`.includes('X-Amz-Signature'), false);
    assert.equal(`${result.out}${result.err}`.includes('secret-signature'), false);
  });

  it('asks for a key when there is none, without calling anything', async () => {
    const result = await runCli(deployArgs(), undefined);
    assert.equal(result.code, 6);
    assert.ok(result.err.includes('[API_KEY_MISSING]'));
    assert.ok(result.err.includes('SUPERBOX_PLAY_API_KEY'));
    assert.deepEqual(backend.rawRequests, []);
  });

  it('refuses a key that cannot go in a header, without printing or sending it', async () => {
    const pasted = 'sbk_abc def한글';
    const result = await runCli(deployArgs(), pasted);
    assert.equal(result.code, 6);
    assert.equal(`${result.out}${result.err}`.includes(pasted), false);
    assert.deepEqual(backend.rawRequests, []);
    assert.throws(() => resolveApiKey(undefined, '   '), (error: unknown) => error instanceof CliError && error.code === 'API_KEY_MISSING');
  });
});

describe('deploy usage', () => {
  async function run(...args: string[]): Promise<{ code: number; err: string }> {
    let err = '';
    const code = await main(args, { out: () => undefined, err: (text) => void (err += text) });
    return { code, err };
  }

  it('needs a file, a game and a channel', async () => {
    assert.equal((await run('deploy')).code, 2);
    assert.equal((await run('deploy', packageFile)).code, 2);
    assert.equal((await run('deploy', packageFile, '--game', SLUG)).code, 2);
  });

  it('a missing file is exit 4, a bad console is exit 2', async () => {
    assert.equal((await run('deploy', path.join(root, 'none.sbp'), '--game', SLUG, '--channel', CHANNEL, '--api-key', SECRET)).code, 4);
    const bad = await run('deploy', packageFile, '--game', SLUG, '--channel', CHANNEL, '--api-key', SECRET, '--console', 'http://evil.example');
    assert.equal(bad.code, 2);
    assert.ok(bad.err.includes('[CONSOLE_ORIGIN_INVALID]'));
  });

  it('a broken package is exit 1 before touching the network', async () => {
    const junk = path.join(root, 'junk.sbp');
    await writeFile(junk, 'not a package at all, sorry, not a zip');
    const result = await run('deploy', junk, '--game', SLUG, '--channel', CHANNEL, '--api-key', SECRET, '--console', backend.origin);
    assert.equal(result.code, 1);
    assert.deepEqual(backend.rawRequests, []);
  });

  it('a game name cannot escape the path', async () => {
    await assert.rejects(deployPackage(options({ game: '../../admin' })));
    assert.equal(backend.rawRequests.length, 1);
    assert.ok(backend.rawRequests[0]?.includes('..%2F..%2Fadmin'));
  });

  it('a dead console is a try-later', async () => {
    const dead = createServer();
    await new Promise<void>((resolve) => dead.listen(0, '127.0.0.1', resolve));
    const { port } = dead.address() as AddressInfo;
    await new Promise((resolve) => dead.close(resolve));
    const result = await run('deploy', packageFile, '--game', SLUG, '--channel', CHANNEL, '--api-key', SECRET, '--console', `http://127.0.0.1:${port}`);
    assert.equal(result.code, 8);
  });
});
