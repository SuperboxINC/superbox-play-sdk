/**
 * Android WebView 첫 터치 포커스 — 엔진이 touchstart · touchend 를 preventDefault 하면 탭 제스처가 만들어지지 않아
 * 문서에 포커스가 오지 않고, 그 상태에서는 입력칸 focus 가 가상 키보드를 띄우지 못한다.
 * 포커스가 없는 문서에서 캔버스의 첫 탭 한 번만 preventDefault 를 비활성화한다. 탭 뒤 따라오는 호환 마우스 이벤트는 엔진이 두 번 받지 않게 삼킨다.
 */
const SWALLOW_MS = 800;
const COMPAT_MOUSE_EVENTS = ['mousedown', 'mouseup', 'click'] as const;

function neutralize(event: Event): void {
  Object.defineProperty(event, 'preventDefault', { value: () => undefined, configurable: true });
}

export function installFirstTouchFocus(win: Window, doc: Document, now: () => number): void {
  let armed = false;
  let swallowUntil = 0;

  const onStart = (event: TouchEvent): void => {
    const target = event.target as Element | null;
    armed = !doc.hasFocus() && event.cancelable && event.touches.length === 1 && target?.tagName === 'CANVAS';
    if (armed) neutralize(event);
  };
  const onEnd = (event: TouchEvent): void => {
    if (!armed) return;
    armed = false;
    neutralize(event);
    swallowUntil = now() + SWALLOW_MS;
  };
  const onCancel = (): void => {
    armed = false;
  };
  const onMouse = (event: Event): void => {
    if (!event.isTrusted || now() >= swallowUntil) return;
    // 캔버스로 포커스가 넘어가 입력칸이 blur 되지 않게
    if (event.type === 'mousedown') event.preventDefault();
    event.stopImmediatePropagation();
  };

  win.addEventListener('touchstart', onStart, true);
  win.addEventListener('touchend', onEnd, true);
  win.addEventListener('touchcancel', onCancel, true);
  for (const type of COMPAT_MOUSE_EVENTS) win.addEventListener(type, onMouse, true);
}
