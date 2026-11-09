import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isZoneFamilyOrigin, RESERVED_ZONE_NAMES, signalForTarget, zoneSignalTarget } from './zone-family.ts';

/** 게임센터 출처 가족 — 게임 채널 규격 1장. 부트 런타임과 Play SDK 에 같은 시험이 하나씩 있다(zone-family.ts 머리 주석). */
const ZONE = 'https://game.superboxgo.com';
const LOCAL_ZONE = 'http://localhost:8200';

function expectFamily(zoneOrigin: string, origins: readonly string[], expected: boolean): void {
  for (const origin of origins) assert.equal(isZoneFamilyOrigin(origin, zoneOrigin), expected, `${origin} ← ${zoneOrigin}`);
}

describe('game center origin family', () => {
  it('trusts the zone origin and one channel name next to it', () => {
    expectFamily(ZONE, [ZONE, 'https://myapp.superboxgo.com', 'https://my-app-2.superboxgo.com', 'https://xn--3e0b707e.superboxgo.com'], true);
  });

  it('leaves out every name a channel address cannot take — company hosts, API, mail (game stays — the demo channel)', () => {
    for (const name of ['www', 'cdn', 'assets', 'api', 'console', 'admin', 'developers', 'docs']) assert.ok(RESERVED_ZONE_NAMES.includes(name), name);
    assert.equal(RESERVED_ZONE_NAMES.includes('game'), false);
    expectFamily(ZONE, RESERVED_ZONE_NAMES.map((name) => `https://${name}.superboxgo.com`), false);
    expectFamily(LOCAL_ZONE, RESERVED_ZONE_NAMES.map((name) => `http://${name}.localhost:8200`), false);
    expectFamily(LOCAL_ZONE, ['http://game.localhost:8200'], true);
  });

  it('needs the same scheme and port', () => {
    expectFamily(ZONE, ['http://game.superboxgo.com', 'http://myapp.superboxgo.com', 'https://myapp.superboxgo.com:8443'], false);
    expectFamily(LOCAL_ZONE, ['http://localhost:3000', 'http://myapp.localhost:3000', 'https://myapp.localhost:8200', 'http://myapp.localhost'], false);
  });

  it('takes exactly one name — no deeper names, no bare base, no look-alikes', () => {
    expectFamily(
      ZONE,
      [
        'https://a.b.superboxgo.com',
        'https://superboxgo.com',
        'https://evilsuperboxgo.com',
        'https://myapp.superboxgo.com.evil.example',
        'https://myapp.superboxgo.co',
        'https://my_app.superboxgo.com',
        'https://evil.example',
      ],
      false,
    );
  });

  it('local dev — localhost and one name under localhost on the same port', () => {
    expectFamily(LOCAL_ZONE, [LOCAL_ZONE, 'http://myapp.localhost:8200'], true);
    expectFamily(LOCAL_ZONE, ['http://a.b.localhost:8200', 'http://127.0.0.1:8200', 'http://10.0.2.2:8200'], false);
  });

  it('IP hosts and two-name hosts match only themselves', () => {
    expectFamily('http://10.0.2.2:8200', ['http://10.0.2.2:8200'], true);
    expectFamily('http://10.0.2.2:8200', ['http://192.168.0.10:8200', 'http://localhost:8200'], false);
    expectFamily('http://[::1]:8200', ['http://[::1]:8200'], true);
    expectFamily('https://superboxgo.com', ['https://superboxgo.com'], true);
    expectFamily('https://superboxgo.com', ['https://myapp.superboxgo.com'], false);
    expectFamily('http://game.localhost:8200', ['http://myapp.localhost:8200'], false);
  });

  it('reads serialized origins only', () => {
    expectFamily(
      ZONE,
      ['null', '', 'not a url', 'https://myapp.superboxgo.com/', 'https://myapp.superboxgo.com/path', 'https://myapp.superboxgo.com:443', 'javascript:alert(1)'],
      false,
    );
    expectFamily('not a url', [ZONE], false);
  });
});

describe('where a game document sends its signals', () => {
  it('to the window right above when it is in the family', () => {
    assert.equal(zoneSignalTarget({ 0: 'https://myapp.superboxgo.com' }, ZONE), 'https://myapp.superboxgo.com');
    assert.equal(zoneSignalTarget({ 0: ZONE }, ZONE), ZONE);
    assert.equal(zoneSignalTarget({ 0: 'http://myapp.localhost:8200' }, LOCAL_ZONE), 'http://myapp.localhost:8200');
  });

  it('nowhere when the window above is someone else — console run tab, company hosts, other sites, opaque', () => {
    for (const nearest of ['https://console.superboxgo.com', 'https://www.superboxgo.com', 'https://evil.example', 'null']) {
      assert.equal(zoneSignalTarget({ 0: nearest }, ZONE), null, nearest);
    }
    assert.equal(zoneSignalTarget({}, ZONE), null);
  });

  it('to "*" when the browser does not tell — no ancestorOrigins (Firefox)', () => {
    assert.equal(zoneSignalTarget(undefined, ZONE), '*');
  });
});

describe('what a game document sends', () => {
  it('drops the error text when it has to send to "*" — the code stays', () => {
    const error = { stage: 'error', code: 'SCRIPT_LOAD', message: 'https://internal.example/build/x.js' };

    assert.deepEqual(signalForTarget(error, '*'), { stage: 'error', code: 'SCRIPT_LOAD' });
    assert.equal(error.message, 'https://internal.example/build/x.js');
  });

  it('keeps the signal as it is for a known game center and for signals without text', () => {
    const error = { stage: 'error', code: 'UNKNOWN', message: 'boom' };
    const progress = { stage: 'progress', progress: 0.4 };

    assert.equal(signalForTarget(error, 'https://myapp.superboxgo.com'), error);
    assert.equal(signalForTarget(progress, '*'), progress);
  });
});
