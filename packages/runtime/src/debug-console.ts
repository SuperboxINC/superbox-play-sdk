/**
 * 진단 콘솔 — `runtime.debugConsole: true` 일 때만 패키지에 들어간다. 게임은 교차 출처 iframe 이라
 * 파트너 앱 안에서는 개발자 도구로 콘솔을 볼 수 없다. 화면에 작은 단추와 로그 패널을 띄운다. 운영 패키지에는 넣지 않는다.
 */
const MAX_LINES = 300;
const LEVELS = ['log', 'info', 'warn', 'error'] as const;
const FONT = 'font:12px/1.4 ui-monospace,Menlo,Consolas,monospace';

const lines: string[] = [];
let panel: HTMLPreElement | null = null;

function text(value: unknown): string {
  if (value instanceof Error) return value.stack ?? value.message;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function add(level: string, values: readonly unknown[]): void {
  lines.push(`[${level}] ${values.map(text).join(' ')}`);
  if (lines.length > MAX_LINES) lines.shift();
  if (panel && panel.style.display !== 'none') panel.textContent = lines.join('\n');
}

for (const level of LEVELS) {
  const original = console[level].bind(console);
  console[level] = (...values: unknown[]): void => {
    add(level, values);
    original(...values);
  };
}
window.addEventListener('error', (event) => {
  const target = event.target as { src?: string; href?: string } | null;
  add('error', [event.message || `load failed: ${target?.src ?? target?.href ?? ''}`]);
}, true);
window.addEventListener('unhandledrejection', (event) => add('rejection', [event.reason]));

function mount(): void {
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.textContent = 'log';
  toggle.style.cssText = `position:fixed;left:8px;bottom:8px;z-index:2147483647;padding:6px 10px;border:0;border-radius:8px;background:rgba(0,0,0,.72);color:#fff;${FONT}`;
  const pre = document.createElement('pre');
  pre.style.cssText = `display:none;position:fixed;left:8px;right:8px;bottom:44px;top:40%;z-index:2147483647;margin:0;padding:10px;overflow:auto;border-radius:10px;background:rgba(0,0,0,.88);color:#e8eaed;white-space:pre-wrap;word-break:break-all;${FONT}`;
  toggle.addEventListener('click', () => {
    const open = pre.style.display === 'none';
    pre.style.display = open ? 'block' : 'none';
    if (open) pre.textContent = lines.join('\n');
  });
  panel = pre;
  document.documentElement.append(pre, toggle);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
else mount();
