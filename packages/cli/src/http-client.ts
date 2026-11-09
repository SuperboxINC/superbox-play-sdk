import { lookup as dnsLookup } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import type { LookupFunction } from 'node:net';
import type { Readable } from 'node:stream';

/**
 * deploy 가 쓰는 작은 HTTP 요청 — fetch 를 쓰지 않는다. presigned PUT 은 서명에 Content-Length 가 들어 있는데 fetch 는 스트림 본문에
 * 길이를 넣을 수 없고(chunked 로 나가 저장소가 거절한다), 500MB 를 메모리에 올리지 않으려면 스트림이어야 한다.
 * 리다이렉트는 따라가지 않는다 — 인증 머리가 다른 곳으로 새지 않게.
 */
export interface HttpRequest {
  /** deploy 는 POST(빌드 만들기 · 끝내기)와 PUT(파일)만 쓴다 */
  readonly method: 'POST' | 'PUT';
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  /** 시도마다 새 스트림이 필요해 함수로 받는다. */
  readonly body?: Uint8Array | (() => Readable);
  /** 요청이 조용한 시간 상한 — 넘으면 네트워크 오류로 끝낸다. */
  readonly idleTimeoutMs: number;
}

export interface HttpResponse {
  readonly status: number;
  /** 본문 — 상한까지만 읽는다. */
  readonly text: string;
}

/** 연결 실패 · 끊김 · 시간 초과 — 재시도 대상. 주소를 담지 않는다(presigned 주소 자체가 비밀이다). */
export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

/** presign 2,000줄 응답이 수 MB 다. */
const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;

/** `console.localhost` 는 OS 에 따라 풀리지 않는다 — 브라우저처럼 자기 자신으로 본다. Host 머리는 그대로라 콘솔 · 게임존 분기가 맞는다. */
const localhostAwareLookup: LookupFunction = (hostname, options, callback) => {
  if (!hostname.endsWith('.localhost')) {
    dnsLookup(hostname, options, callback);
    return;
  }
  if (options.all) callback(null, [{ address: '127.0.0.1', family: 4 }]);
  else callback(null, '127.0.0.1', 4);
};

export function sendRequest(request: HttpRequest): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const url = new URL(request.url);
    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.request(url, { method: request.method, headers: request.headers, lookup: localhostAwareLookup }, (res) => {
      const chunks: Buffer[] = [];
      let size = 0;
      res.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_RESPONSE_BYTES) {
          req.destroy(new NetworkError('응답이 너무 커요'));
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf8') }));
      res.on('error', () => reject(new NetworkError('응답을 받다가 연결이 끊겼어요')));
    });
    req.setTimeout(request.idleTimeoutMs, () => req.destroy(new NetworkError('시간 초과')));
    req.on('error', (error: NodeJS.ErrnoException) => {
      reject(error instanceof NetworkError ? error : new NetworkError(error.code ?? '연결 실패'));
    });
    const { body } = request;
    if (body === undefined) {
      req.end();
    } else if (body instanceof Uint8Array) {
      req.end(body);
    } else {
      const source = body();
      source.on('error', (error) => req.destroy(error));
      source.pipe(req);
    }
  });
}
