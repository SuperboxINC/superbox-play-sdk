import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { BootConfig } from './types.ts';
import { createView } from './view.ts';

/** view 가 쓰는 만큼만 흉내 낸 요소 — 그림 교체 판단만 본다. */
interface FakeElement {
  hidden: boolean;
  textContent: string;
  src: string;
  alt: string;
  complete: boolean;
  naturalWidth: number;
  readonly images: FakeElement[];
  readonly style: { setProperty(): void };
  getAttribute(name: string): string | null;
  setAttribute(): void;
  addEventListener(): void;
  appendChild(child: FakeElement): void;
  remove(): void;
}

function fakeElement(): FakeElement {
  return {
    hidden: false,
    textContent: '',
    src: '',
    alt: '',
    complete: false,
    naturalWidth: 0,
    images: [],
    style: { setProperty: () => undefined },
    getAttribute: () => null,
    setAttribute: () => undefined,
    addEventListener: () => undefined,
    appendChild(child) {
      this.images.push(child);
    },
    remove: () => undefined,
  };
}

function viewWith(config: Partial<BootConfig>): { readonly icon: FakeElement; readonly view: ReturnType<typeof createView> } {
  const icon = fakeElement();
  const root = {
    ...fakeElement(),
    querySelector: (selector: string) => {
      if (selector === '.sbp-icon') return icon;
      return null;
    },
  };
  const doc = { getElementById: () => root, createElement: fakeElement } as unknown as Document;
  const view = createView(doc, { tips: [], ...config } as unknown as BootConfig, () => undefined);
  view.attach();
  return { icon, view };
}

const INFO = { title: '콘솔 이름', iconUrl: 'https://cdn.example/icon.png', primaryColor: '#1B64DA', backgroundColor: '#0B0F19' };

describe('view.setAppInfo — 로딩 그림', () => {
  it('패키지 그림이 없으면 콘솔 아이콘을 넣는다', () => {
    const { icon, view } = viewWith({ iconUrl: null });
    view.setAppInfo(INFO);
    assert.deepEqual(icon.images.map((image) => image.src), [INFO.iconUrl]);
  });

  it('게임사가 패키지에 넣은 그림은 콘솔 아이콘으로 바꾸지 않는다', () => {
    const { icon, view } = viewWith({ iconUrl: 'sbp/loading-image.png' });
    view.setAppInfo(INFO);
    assert.deepEqual(icon.images, []);
  });
});
