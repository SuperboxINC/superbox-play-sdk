import { installCocosGlue, type CocosGlobal } from './cocos.ts';
import { installEarlyFetch, type EarlyFetchWindow } from './early-fetch.ts';
import { createClassifier, installErrorWatch } from './error-watch.ts';
import { installFirstTouchFocus } from './first-touch.ts';
import { createLoading, type LoadingController } from './loading-api.ts';
import { recommendPixelRatio } from './pixel-ratio.ts';
import { spendAutoReload } from './reload-budget.ts';
import type { BootConfig, LoadingAppInfo, LoadingSignal, SBPlayBootGlobal, SBPlayLoadingApi } from './types.ts';
import { installUnityGlue, type UnityWindow } from './unity.ts';
import { createView } from './view.ts';
import { installWatchdog } from './watchdog.ts';
import { isZoneFamilyOrigin, signalForTarget, zoneSignalTarget } from './zone-family.ts';

/**
 * 부트 런타임 — 입구 문서 맨 앞에 인라인으로 들어가 엔진 로더 · 게임 코드보다 먼저 돈다(package-format.md 4 · 5장).
 *
 * 규칙: 어떤 실패도 게임 시작을 막지 않는다(fail-open). 기능마다 guard 로 감싸 sessionStorage · fetch · WebGL 시험이 던져도
 * 삼키고 원래 동작으로 간다. 여기서 던진 것 때문에 게임이 멈추는 일이 가장 나쁘다.
 */
type BootWindow = Window &
  typeof globalThis &
  UnityWindow & {
    SBPlayBoot?: SBPlayBootGlobal;
    SBPlayLoading?: SBPlayLoadingApi;
    cc?: CocosGlobal;
  };

const FRAME_FALLBACK_MS = 120;
const COLOR = /^#[0-9A-Fa-f]{6}$/;
const IOS_UA = /iPhone|iPad|iPod/i;
const ANDROID_UA = /Android/i;

function guard(task: () => void): void {
  try {
    task();
  } catch {
    // 부가 기능이 실패해도 게임은 돈다
  }
}

function afterFrame(win: BootWindow, callback: () => void): void {
  let done = false;
  const run = (): void => {
    if (done) return;
    done = true;
    callback();
  };
  guard(() => win.requestAnimationFrame(() => win.requestAnimationFrame(run)));
  // 숨겨진 iframe 에서는 requestAnimationFrame 이 돌지 않는다
  win.setTimeout(run, FRAME_FALLBACK_MS);
}

function timingEntries(win: BootWindow, type: string): PerformanceEntryList {
  try {
    return win.performance.getEntriesByType(type);
  } catch {
    return [];
  }
}

function isReloadNavigation(win: BootWindow): boolean {
  return (timingEntries(win, 'navigation')[0] as PerformanceNavigationTiming | undefined)?.type === 'reload';
}

function gpuRenderer(doc: Document): string {
  try {
    const gl = doc.createElement('canvas').getContext('webgl');
    if (!gl) return '';
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return name;
  } catch {
    return '';
  }
}

function computePixelRatio(win: BootWindow, config: BootConfig): number | null {
  const ua = win.navigator.userAgent;
  const ios = IOS_UA.test(ua);
  const mobile = ios || ANDROID_UA.test(ua);
  const nav = win.navigator as Navigator & { deviceMemory?: number };
  return recommendPixelRatio(config.maxDevicePixelRatio, {
    devicePixelRatio: win.devicePixelRatio,
    mobile,
    ios,
    memoryGb: nav.deviceMemory,
    cores: nav.hardwareConcurrency,
    // WebGL 시험은 컨텍스트를 하나 쓰므로 필요할 때만
    renderer: mobile && config.maxDevicePixelRatio === 'auto' ? gpuRenderer(win.document) : '',
  });
}

/** 게임센터 → 게임 `sbx.appInfo` — 콘솔 값으로 이름 · 아이콘 · 색을 갱신한다. 출처(게임센터 출처 가족)를 보고 칸마다 형식을 본다. */
function readAppInfo(data: unknown): Partial<LoadingAppInfo> | null {
  if (typeof data !== 'object' || data === null) return null;
  const message = data as Record<string, unknown>;
  if (message.type !== 'sbx.appInfo' || message.v !== 1) return null;
  const patch: { -readonly [K in keyof LoadingAppInfo]?: LoadingAppInfo[K] } = {};
  if (typeof message.title === 'string' && message.title.length <= 100) patch.title = message.title;
  if (typeof message.iconUrl === 'string' && /^https?:\/\//.test(message.iconUrl)) patch.iconUrl = message.iconUrl;
  if (typeof message.primaryColor === 'string' && COLOR.test(message.primaryColor)) patch.primaryColor = message.primaryColor;
  if (typeof message.backgroundColor === 'string' && COLOR.test(message.backgroundColor)) patch.backgroundColor = message.backgroundColor;
  return patch;
}

function installAppInfo(win: BootWindow, config: BootConfig, loading: LoadingController): void {
  win.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== win.parent || !isZoneFamilyOrigin(event.origin, config.zoneOrigin)) return;
    const patch = readAppInfo(event.data);
    if (patch) loading.setAppInfo(patch);
  });
}

function main(win: BootWindow, boot: SBPlayBootGlobal): void {
  const { config } = boot;
  const doc = win.document;
  // 바로 위 창이 게임센터 출처 가족일 때만 그 출처로 보낸다(zone-family.ts) — 채널 주소(https://{주소 이름}.superboxgo.com)에서 열려도
  // 닿고, 콘솔 · 어드민 실행 탭 iframe 에는 보내지 않는다(보내 봐야 target origin 경고만 찍힌다). ancestorOrigins 가 없는 브라우저(Firefox)는 '*'
  // 이고, 그때는 오류 문구를 빼고 코드만 보낸다(signalForTarget — 게임 오류 글에 내부 주소 · 스택 일부가 들어갈 수 있다)
  const target = win.parent !== win ? zoneSignalTarget(win.location.ancestorOrigins, config.zoneOrigin) : null;
  const now = (): number => win.performance.now();
  let webglFailed = false;

  const send = (signal: LoadingSignal): void => {
    if (target === null) return;
    guard(() => win.parent.postMessage({ type: 'sbx.loading', v: 1, ...signalForTarget(signal, target) }, target));
  };
  // shell 이 언제나 첫 신호다 — 화면이 그려지기 전에 온 진행률 · 오류는 그 뒤로 미룬다
  let shellSent = false;
  const beforeShell: LoadingSignal[] = [];
  const post = (signal: LoadingSignal): void => {
    if (shellSent) send(signal);
    else beforeShell.push(signal);
  };
  const classify = createClassifier(config, () => webglFailed);
  const view = createView(doc, config, () => win.location.reload());
  const loading = createLoading({
    appInfo: { title: config.title, iconUrl: config.iconUrl, primaryColor: config.primaryColor, backgroundColor: config.backgroundColor },
    view,
    post,
    now,
    later: (callback, ms) => win.setTimeout(callback, ms),
    report: (error) => guard(() => console.error(error)),
    classify,
  });
  win.SBPlayLoading = loading.api;

  let shellDone = false;
  const shell = (): void => {
    if (shellDone) return;
    shellDone = true;
    guard(() => view.attach());
    afterFrame(win, () => {
      send({ stage: 'shell' });
      shellSent = true;
      for (const signal of beforeShell.splice(0)) send(signal);
    });
  };
  boot.shell = shell;
  doc.addEventListener('DOMContentLoaded', shell);

  let ratio: number | null | undefined;
  Object.defineProperty(boot, 'pixelRatio', {
    configurable: true,
    get() {
      ratio ??= computePixelRatio(win, config);
      return ratio;
    },
  });

  guard(() => installErrorWatch({ win, config, loading }, classify, () => { webglFailed = true; }));
  guard(() => {
    const dispose = installEarlyFetch(win as unknown as EarlyFetchWindow, config.earlyFetch, isReloadNavigation(win));
    loading.api.onComplete(dispose);
  });
  guard(() => {
    const session = (win.navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) session.type = 'ambient';
  });
  guard(() => {
    if (ANDROID_UA.test(win.navigator.userAgent)) installFirstTouchFocus(win, doc, now);
  });
  if (target !== null) guard(() => installAppInfo(win, config, loading));

  const timers = {
    setInterval: (callback: () => void, ms: number): unknown => win.setInterval(callback, ms),
    clearInterval: (handle: unknown): void => win.clearInterval(handle as number),
  };
  if (config.watchdog) {
    guard(() =>
      installWatchdog({
        loading,
        now,
        isHidden: () => doc.hidden,
        resourceCount: () => timingEntries(win, 'resource').length,
        reload: () => {
          if (!spendAutoReload(() => win.sessionStorage)) return false;
          win.location.reload();
          return true;
        },
        ...timers,
      }),
    );
  }
  if (config.engine === 'unity') {
    guard(() =>
      installUnityGlue({
        win,
        doc,
        loading,
        now,
        classify,
        pixelRatio: () => boot.pixelRatio ?? null,
        afterFrame: (callback) => afterFrame(win, callback),
        ...timers,
      }),
    );
  }
  if (config.engine === 'cocos') guard(() => installCocosGlue({ win, loading, now, classify, ...timers }));

  win.addEventListener('load', () => {
    if (config.engine === 'cocos') return;
    afterFrame(win, () => {
      if (loading.api.autoComplete && !loading.hasFailed()) loading.api.complete();
    });
  });
}

const win = window as BootWindow;
const boot = win.SBPlayBoot;
if (boot?.config && !win.SBPlayLoading) guard(() => main(win, boot));
