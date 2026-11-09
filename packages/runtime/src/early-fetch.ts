/**
 * 초기 다운로드 — 큰 파일을 입구 파싱이 시작될 때 받아 두고 로더의 같은 요청에 그 응답을 준다.
 * 게임존이 iframe 을 띄우고 엔진 로더가 뜨기까지의 시간만큼 다운로드가 앞당겨진다.
 *
 * 새로고침 때는 하지 않는다 — 이전 문서의 연결이 정리되는 중이라 끊기기 쉽고, 어차피 HTTP 캐시가 따뜻하다.
 * 받아 둔 응답이 실패했거나 틀렸으면 로더 요청을 원래대로 보낸다(fail-open).
 */
export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface EarlyFetchWindow {
  fetch: FetchLike;
  readonly location: { readonly href: string };
}

export type DisposeEarlyFetch = () => void;

const noop: DisposeEarlyFetch = () => undefined;

function targetUrl(input: RequestInfo | URL, base: string): string | null {
  try {
    if (typeof input === 'string') return new URL(input, base).href;
    if (input instanceof URL) return input.href;
    return input.url;
  } catch {
    return null;
  }
}

function methodOf(input: RequestInfo | URL, init?: RequestInit): string {
  const fromRequest = typeof input === 'object' && 'method' in input ? input.method : 'GET';
  return (init?.method ?? fromRequest).toUpperCase();
}

function cancelUnused(pending: Promise<Response | null>): void {
  void pending.then((response) => response?.body?.cancel()).catch(() => undefined);
}

export function installEarlyFetch(win: EarlyFetchWindow, urls: readonly string[], skip: boolean): DisposeEarlyFetch {
  if (skip || urls.length === 0 || typeof win.fetch !== 'function') return noop;
  const original = win.fetch;
  const call: FetchLike = (input, init) => original.call(win, input, init);
  const pending = new Map<string, Promise<Response | null>>();
  for (const url of urls) {
    const absolute = targetUrl(url, win.location.href);
    if (absolute) pending.set(absolute, call(url).catch(() => null));
  }

  const wrapped: FetchLike = (input, init) => {
    const url = targetUrl(input, win.location.href);
    const early = url && methodOf(input, init) === 'GET' ? pending.get(url) : undefined;
    if (!url || !early) return call(input, init);
    pending.delete(url);
    if (pending.size === 0) restore();
    return early.then((response) => (response && response.ok && !response.bodyUsed ? response : call(input, init)));
  };
  const restore = (): void => {
    // 다른 코드가 그 위에 또 감쌌으면 건드리지 않는다
    if (win.fetch === wrapped) win.fetch = original;
  };
  win.fetch = wrapped;

  return () => {
    restore();
    for (const early of pending.values()) cancelUnused(early);
    pending.clear();
  };
}
