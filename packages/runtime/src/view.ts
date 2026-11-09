import type { BootConfig, LoadingAppInfo, LoadingErrorInfo, LoadingView } from './types.ts';

/**
 * 로딩 화면 · 오류 화면 DOM. 플레이어에게 보이는 글은 해요체이고 게임이나 게임존이 보낸 글자는 textContent 로만 넣는다.
 * 오류 화면은 CSS 를 따로 두지 않는다 — custom 로딩에는 기본 CSS 가 없고, 스크립트가 무너진 문서에서도 그려져야 한다.
 */
const TIP_ROTATE_MS = 4000;
const TIP_SWAP_MS = 200;
const FADE_MS = 360;
const FONT = '-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR","Segoe UI",sans-serif';

const ERROR_TITLE = '게임을 불러오지 못했어요';
const RETRY_LABEL = '다시 시도';
const HINT_NETWORK = '네트워크 상태를 확인하고 다시 시도해 주세요.';
const HINT_DEVICE = '다른 앱을 닫고 다시 시도해 주세요.';

function glowOf(color: string): string {
  const value = Number.parseInt(color.slice(1), 16);
  return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},.24)`;
}

function firstLetter(text: string | null): string {
  return Array.from((text ?? '').trim())[0] ?? '';
}

export function createView(doc: Document, config: BootConfig, retry: () => void): LoadingView {
  let root: HTMLElement | null = null;
  let tipTimer: ReturnType<typeof setInterval> | undefined;
  let errorEl: HTMLElement | null = null;
  let lastProgress = -1;

  const query = <T extends Element>(selector: string): T | null => root?.querySelector<T>(selector) ?? null;

  const dropBrokenIcon = (img: HTMLImageElement): void => {
    const remove = (): void => img.remove();
    img.addEventListener('error', remove);
    if (img.complete && img.naturalWidth === 0 && img.getAttribute('src')) remove();
  };

  const startTips = (): void => {
    const tip = query<HTMLElement>('.sbp-tip');
    if (!tip || config.tips.length < 2) return;
    let index = 0;
    tipTimer = setInterval(() => {
      index = (index + 1) % config.tips.length;
      tip.style.opacity = '0';
      setTimeout(() => {
        tip.textContent = config.tips[index] ?? '';
        tip.style.opacity = '';
      }, TIP_SWAP_MS);
    }, TIP_ROTATE_MS);
  };

  const applyProgress = (progress: number): void => {
    const bar = query<HTMLElement>('.sbp-bar');
    if (!bar) return;
    bar.setAttribute('data-on', '');
    bar.setAttribute('aria-valuenow', String(Math.round(progress * 100)));
    const fill = bar.firstElementChild as HTMLElement | null;
    if (fill) fill.style.transform = `scaleX(${progress})`;
  };

  return {
    attach() {
      root = doc.getElementById('sbp-loading');
      if (!root) return;
      const img = query<HTMLImageElement>('.sbp-icon img');
      if (img) dropBrokenIcon(img);
      startTips();
      if (lastProgress >= 0) applyProgress(lastProgress);
    },
    setProgress(progress) {
      lastProgress = progress;
      applyProgress(progress);
    },
    setAppInfo(info: LoadingAppInfo) {
      if (!root || root.getAttribute('data-mode') === 'custom') return;
      root.style.setProperty('--sbp-bg', info.backgroundColor);
      root.style.setProperty('--sbp-primary', info.primaryColor);
      root.style.setProperty('--sbp-glow', glowOf(info.primaryColor));
      const name = query<HTMLElement>('.sbp-name');
      if (name) name.textContent = info.title ?? '';
      const letter = query<HTMLElement>('.sbp-icon span');
      if (letter) letter.textContent = firstLetter(info.title);
      const icon = query<HTMLElement>('.sbp-icon');
      if (!icon) return;
      icon.hidden = !info.iconUrl && !firstLetter(info.title);
      // 게임사가 패키지에 넣은 그림(`loading.image`)이 콘솔 아이콘보다 앞선다 — 일부러 고른 로딩 화면이다
      if (info.iconUrl && !config.iconUrl) {
        query<HTMLImageElement>('.sbp-icon img')?.remove();
        const img = doc.createElement('img');
        img.alt = '';
        img.src = info.iconUrl;
        icon.appendChild(img);
        dropBrokenIcon(img);
      }
    },
    hide() {
      if (tipTimer !== undefined) clearInterval(tipTimer);
      const target = root ?? doc.getElementById('sbp-loading');
      if (!target) return;
      root = null;
      target.style.opacity = '0';
      target.style.pointerEvents = 'none';
      setTimeout(() => target.remove(), FADE_MS);
    },
    showError(error: LoadingErrorInfo, info: LoadingAppInfo) {
      if (errorEl) return;
      const panel = doc.createElement('div');
      panel.id = 'sbp-error';
      panel.setAttribute('role', 'alert');
      panel.style.cssText = `position:fixed;top:0;right:0;bottom:0;left:0;z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;background:${info.backgroundColor};color:#f2f4f6;font:400 14px/1.5 ${FONT};text-align:center;word-break:keep-all`;
      const title = doc.createElement('p');
      title.textContent = ERROR_TITLE;
      title.style.cssText = 'margin:0;font-size:17px;font-weight:600;line-height:26px';
      const hint = doc.createElement('p');
      hint.textContent = error.code === 'WEBGL_CONTEXT' ? HINT_DEVICE : HINT_NETWORK;
      hint.style.cssText = 'margin:6px 0 0;color:rgba(255,255,255,.62);font-size:13px';
      const button = doc.createElement('button');
      button.type = 'button';
      button.textContent = RETRY_LABEL;
      button.style.cssText = `margin-top:22px;min-width:132px;min-height:44px;padding:0 24px;border:0;border-radius:12px;background:${info.primaryColor};color:#fff;font:600 15px/1 ${FONT};cursor:pointer`;
      button.addEventListener('click', retry);
      panel.append(title, hint, button);
      (doc.body ?? doc.documentElement).appendChild(panel);
      errorEl = panel;
    },
    hideError() {
      errorEl?.remove();
      errorEl = null;
    },
  };
}
