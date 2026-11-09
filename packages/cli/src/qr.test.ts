import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { qrForTerminal, qrMatrix } from './qr.ts';

const FINDER_EDGE = '1111111';

describe('qr', () => {
  it('encodes text into a square of dark and light modules, without a margin', () => {
    const { size, modules } = qrMatrix('http://192.168.0.12:8300/');
    assert.equal(size % 4, 1, 'QR 한 변은 4n+1 칸이다');
    assert.equal(modules.length, size * size);
    assert.match(modules, /^[01]+$/);
    assert.equal(modules.slice(0, FINDER_EDGE.length), FINDER_EDGE, '여백 없이 왼쪽 위 찾기 무늬부터 시작한다');
  });

  it('gives the same code for the same text', () => {
    assert.deepEqual(qrMatrix('http://10.0.0.5:8300/'), qrMatrix('http://10.0.0.5:8300/'));
  });

  it('draws it with block characters for a terminal', () => {
    const lines = qrForTerminal('http://192.168.0.12:8300/').split('\n');
    assert.ok(lines.length > 10);
    for (const line of lines) assert.match(line, /^[ █▀▄]+$/u);
  });
});
