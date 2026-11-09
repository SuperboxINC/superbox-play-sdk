import { encode, renderUnicodeCompact } from 'uqr';

/**
 * QR 코드 — 외부 서비스 없이 이 컴퓨터에서 만든다. 주소가 짧아 오류 정정은 M 이면 충분하다.
 */
const ERROR_CORRECTION = 'M';
const TERMINAL_MARGIN = 2;

export interface QrMatrix {
  /** 한 변의 칸 수 */
  readonly size: number;
  /** 왼쪽 위부터 줄 순서로 이어 붙인 칸 — 1 이 어두운 칸. 여백은 그리는 쪽이 넣는다 */
  readonly modules: string;
}

export function qrMatrix(text: string): QrMatrix {
  const { size, data } = encode(text, { ecc: ERROR_CORRECTION, border: 0 });
  return { size, modules: data.flat().map((dark) => (dark ? '1' : '0')).join('') };
}

export function qrForTerminal(text: string): string {
  return renderUnicodeCompact(text, { ecc: ERROR_CORRECTION, border: TERMINAL_MARGIN }).replace(/\n$/, '');
}
