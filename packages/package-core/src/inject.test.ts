import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PackageError } from './errors.ts';
import { attrValue, scanTags } from './html-scan.ts';
import { DEFAULT_VIEWPORT, escapeHtml, injectEntry, isInlineSafe, jsonForScript, renderLoadingHtml, type BootConfig, type InjectInput } from './inject.ts';
import { BOOT_JS, DEBUG_CONSOLE_JS, LOADING_TEMPLATE, RUNTIME_SIZES } from './runtime-assets.generated.ts';

const ZONE = 'https://game.superboxgo.com';
const BOOT: BootConfig = {
  zoneOrigin: ZONE,
  engine: 'html5',
  mode: 'default',
  title: '시험',
  iconUrl: null,
  primaryColor: '#1B64DA',
  backgroundColor: '#0B0F19',
  tips: [],
  earlyFetch: [],
  maxDevicePixelRatio: 'auto',
  watchdog: true,
};
const RUNTIME = { bootJs: '/*BOOT*/', loadingTemplate: LOADING_TEMPLATE };

function inject(html: string, overrides: Partial<InjectInput> = {}): string {
  return injectEntry({ html, boot: BOOT, customLoadingHtml: null, debugConsole: false, runtime: RUNTIME, ...overrides }).html;
}

const BASIC = '<!doctype html><html><head><title>t</title></head><body><canvas></canvas><script src="game.js"></script></body></html>';

describe('escaping', () => {
  it('JSON in a script cannot end the script or open a comment', () => {
    const value = { title: '</script><script>alert(1)</script>', tip: '<!-- x', amp: 'a&b' };
    const out = jsonForScript(value);
    assert.equal(out.includes('<'), false);
    assert.equal(out.includes('>'), false);
    assert.equal(out.includes('&'), false);
    assert.deepEqual(JSON.parse(out), value);
  });

  it('U+2028 and U+2029 are escaped', () => {
    const value = `a${String.fromCharCode(0x2028)}b${String.fromCharCode(0x2029)}c`;
    const out = jsonForScript({ value });
    assert.equal(out.includes(String.fromCharCode(0x2028)), false);
    assert.equal(out.includes(String.fromCharCode(0x2029)), false);
    assert.ok(out.includes('\\u2028'));
    assert.deepEqual(JSON.parse(out), { value });
  });

  it('HTML text escapes the five characters', () => {
    assert.equal(escapeHtml(`<img src=x onerror="a('b')">&`), '&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;');
  });

  it('title and tips reach the document escaped, in both the JSON and the markup', () => {
    const boot = { ...BOOT, title: '</script><b>굵게</b>', tips: ['<img src=x onerror=alert(1)>', '둘째 팁'] };
    const out = inject(BASIC, { boot });
    assert.equal(out.includes('<b>굵게'), false);
    assert.equal(out.includes('<img src=x'), false);
    assert.ok(out.includes('&lt;b&gt;굵게&lt;/b&gt;'));
    assert.ok(out.includes('&lt;img src=x onerror=alert(1)&gt;'));
    // 부트 · shell · SDK · game.js 넷뿐이다 — 값이 태그를 더 열거나 닫지 못한다
    assert.equal(scanTags(out).filter((tag) => tag.name === 'script' && tag.closing).length, 4);
  });

  it('the bundled boot script is inline safe and within budget', () => {
    assert.equal(isInlineSafe(BOOT_JS), true);
    assert.ok(RUNTIME_SIZES.bootBytes <= RUNTIME_SIZES.bootBudget, `부트 ${RUNTIME_SIZES.bootBytes}B`);
    assert.ok(RUNTIME_SIZES.loadingBytes <= RUNTIME_SIZES.loadingBudget, `로딩 ${RUNTIME_SIZES.loadingBytes}B`);
    assert.equal(/[^\x00-\x7F]/.test(BOOT_JS), false, '부트 스크립트는 ASCII 다 — 문서 인코딩에 기대지 않는다');
    assert.ok(DEBUG_CONSOLE_JS.length > 0);
    assert.throws(() => inject(BASIC, { runtime: { bootJs: 'a</script>b', loadingTemplate: LOADING_TEMPLATE } }), (error: unknown) => error instanceof PackageError && error.code === 'RUNTIME_MISSING');
  });
});

describe('injectEntry positions', () => {
  it('puts the mark, charset and boot first in head, before any game code', () => {
    const out = inject(BASIC);
    const headEnd = out.indexOf('<head>') + '<head>'.length;
    assert.ok(out.startsWith('<!-- sbp:v1 --><meta charset="utf-8">', headEnd));
    assert.ok(out.indexOf('window.SBPlayBoot={config:') < out.indexOf('src="game.js"'));
    assert.ok(out.indexOf('/*BOOT*/') > out.indexOf('window.SBPlayBoot={config:'));
  });

  it('puts the charset meta inside the first 1024 bytes even with a big boot script', () => {
    const out = inject(`<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>`, { runtime: { bootJs: BOOT_JS, loadingTemplate: LOADING_TEMPLATE } });
    assert.ok(out.indexOf('<meta charset="utf-8">') < 1024);
  });

  it('puts the loading screen and shell signal first in body', () => {
    const out = inject(BASIC);
    const bodyEnd = out.indexOf('<body>') + '<body>'.length;
    assert.ok(out.startsWith('<div id="sbp-loading"', bodyEnd));
    assert.ok(out.indexOf('SBPlayBoot.shell()') < out.indexOf('<canvas>'));
  });

  it('puts the SDK tag before the first script', () => {
    const out = inject(BASIC);
    assert.ok(out.indexOf(`<script src="${ZONE}/sdk/play/v1.js"></script>`) < out.indexOf('src="game.js"'));
    assert.ok(out.indexOf('SBPlayBoot.shell()') < out.indexOf(`${ZONE}/sdk/play/v1.js`));
  });

  it('keeps an existing v1.js tag in place and only fixes the origin', () => {
    const html = '<html><head></head><body><script src="https://old.example/sdk/play/v1.js?x=1"></script><script src="a.js"></script></body></html>';
    const out = inject(html);
    assert.equal(out.match(/sdk\/play\/v1\.js/g)?.length, 1);
    assert.ok(out.includes(`<script src="${ZONE}/sdk/play/v1.js"></script><script src="a.js">`));
  });

  it('warns when the existing SDK tag is async', () => {
    const result = injectEntry({ html: '<html><head><script async src="/sdk/play/v1.js"></script></head><body></body></html>', boot: BOOT, customLoadingHtml: null, debugConsole: false, runtime: RUNTIME });
    assert.deepEqual(result.warnings.map((item) => item.code), ['SDK_TAG_DEFERRED']);
  });

  it('adds the default viewport only when there is none', () => {
    assert.ok(inject(BASIC).includes(`<meta name="viewport" content="${DEFAULT_VIEWPORT}">`));
    const kept = '<html><head><meta name="viewport" content="width=device-width"></head><body></body></html>';
    const result = injectEntry({ html: kept, boot: BOOT, customLoadingHtml: null, debugConsole: false, runtime: RUNTIME });
    assert.equal(result.html.match(/name="viewport"/g)?.length, 1);
    assert.deepEqual(result.warnings.map((item) => item.code), ['VIEWPORT_KEPT']);
    const complete = '<html><head><meta name="viewport" content="width=device-width, user-scalable=no, viewport-fit=cover"></head><body></body></html>';
    assert.equal(injectEntry({ html: complete, boot: BOOT, customLoadingHtml: null, debugConsole: false, runtime: RUNTIME }).warnings.length, 0);
  });

  it('stops on a document that was already packaged', () => {
    const once = inject(BASIC);
    assert.throws(() => inject(once), (error: unknown) => error instanceof PackageError && error.code === 'ALREADY_INJECTED');
  });

  it('stops on a non UTF-8 document', () => {
    assert.throws(() => inject('<html><head><meta charset="euc-kr"></head><body></body></html>'), (error: unknown) => error instanceof PackageError && error.code === 'ENTRY_NOT_UTF8');
    assert.throws(() => inject('<html><head><meta http-equiv="Content-Type" content="text/html; charset=euc-kr"></head></html>'), (error: unknown) => error instanceof PackageError && error.code === 'ENTRY_NOT_UTF8');
    assert.ok(inject('<html><head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"></head></html>').includes('sbp:v1'));
  });

  it('is not fooled by tags in comments and scripts', () => {
    const html = '<!-- <head><body><script src="x.js"></script> --><html><head><script>var s = "<body></body><script>";</script></head><body><p>hi</p></body></html>';
    const out = inject(html);
    assert.ok(out.indexOf('<div id="sbp-loading"') > out.indexOf('</head>'));
    assert.ok(out.indexOf('sbp:v1') > out.indexOf('<!-- <head>') + 10);
    assert.ok(out.indexOf('sbp:v1') < out.indexOf('var s ='));
    assert.ok(out.indexOf(`${ZONE}/sdk/play/v1.js`) < out.indexOf('var s ='));
  });

  it('handles documents without head or body tags', () => {
    const out = inject('<!doctype html><title>x</title><canvas></canvas><script src="g.js"></script>');
    assert.ok(out.indexOf('sbp:v1') < out.indexOf('<canvas>'));
    assert.ok(out.indexOf('<div id="sbp-loading"') < out.indexOf('<canvas>'));
    assert.ok(out.indexOf(`${ZONE}/sdk/play/v1.js`) < out.indexOf('g.js'));
    const bare = inject('<p>hello</p>');
    assert.ok(bare.indexOf('sbp:v1') < bare.indexOf('<p>hello'));
    assert.ok(bare.indexOf('v1.js') > 0);
  });

  it('keeps a BOM at the start and goes after the doctype', () => {
    const out = inject('﻿<!DOCTYPE html><html lang="ko"><head></head><body></body></html>');
    assert.ok(out.startsWith('﻿<!DOCTYPE html>'));
  });

  it('runs boot before a script that comes before head', () => {
    const out = inject('<html><script src="early.js"></script><head></head><body></body></html>');
    assert.ok(out.indexOf('window.SBPlayBoot') < out.indexOf('early.js'));
  });

  it('does not count scripts in noscript or template as the first script', () => {
    const out = inject('<html><head></head><body><noscript><script src="n.js"></script></noscript><script src="real.js"></script></body></html>');
    assert.ok(out.indexOf('v1.js') > out.indexOf('</noscript>'));
    assert.ok(out.indexOf('v1.js') < out.indexOf('real.js'));
  });

  it('custom loading html goes in whole, inside the shell div', () => {
    const out = inject(BASIC, { customLoadingHtml: '<h1 id="mine">내 화면</h1>', boot: { ...BOOT, mode: 'custom' } });
    assert.ok(out.includes('<div id="sbp-loading" data-mode="custom"'));
    assert.ok(out.includes('<h1 id="mine">내 화면</h1></div>'));
    assert.equal(out.includes('sbp-col'), false);
  });

  it('debug console tag only when asked', () => {
    assert.equal(inject(BASIC).includes('debug-console.js'), false);
    const out = inject(BASIC, { debugConsole: true });
    assert.ok(out.indexOf('sbp/debug-console.js') < out.indexOf('<title>'));
  });
});

describe('renderLoadingHtml', () => {
  it('fills every token and keeps colors as given', () => {
    const out = renderLoadingHtml(LOADING_TEMPLATE, { ...BOOT, mode: 'theme', iconUrl: 'sbp/loading-image.png', tips: ['팁 & 하나'] });
    assert.equal(/%%[A-Z]+%%/.test(out), false);
    assert.ok(out.includes('--sbp-bg:#0B0F19'));
    assert.ok(out.includes('--sbp-primary:#1B64DA'));
    assert.ok(out.includes('--sbp-glow:rgba(27,100,218,.24)'));
    assert.ok(out.includes('<img src="sbp/loading-image.png" alt="">'));
    assert.ok(out.includes('팁 &amp; 하나'));
    assert.ok(out.includes('data-mode="theme"'));
  });

  it('uses the first letter of the title as the icon fallback', () => {
    const tags = scanTags(renderLoadingHtml(LOADING_TEMPLATE, { ...BOOT, title: '  드랍 더 넘버' }));
    assert.ok(tags.some((tag) => tag.name === 'span'));
    assert.ok(renderLoadingHtml(LOADING_TEMPLATE, { ...BOOT, title: '  드랍 더 넘버' }).includes('<span>드</span>'));
    assert.ok(renderLoadingHtml(LOADING_TEMPLATE, { ...BOOT, title: null }).includes('<span></span>'));
  });

  it('does not draw an empty icon box when there is neither a title nor an image', () => {
    assert.ok(renderLoadingHtml(LOADING_TEMPLATE, { ...BOOT, title: null, iconUrl: null }).includes('<div class="sbp-icon" hidden>'));
    assert.ok(renderLoadingHtml(LOADING_TEMPLATE, { ...BOOT, title: '이름', iconUrl: null }).includes('<div class="sbp-icon">'));
    assert.ok(renderLoadingHtml(LOADING_TEMPLATE, { ...BOOT, title: null, iconUrl: 'sbp/loading-image.png' }).includes('<div class="sbp-icon">'));
  });
});

describe('scanTags', () => {
  it('reads attributes in all quote styles with their positions', () => {
    const html = `<script src="a.js" data-x='y' defer data-z=z></script>`;
    const tag = scanTags(html)[0];
    assert.ok(tag);
    assert.equal(attrValue(tag, 'src'), 'a.js');
    assert.equal(attrValue(tag, 'data-x'), 'y');
    assert.equal(attrValue(tag, 'defer'), '');
    assert.equal(attrValue(tag, 'data-z'), 'z');
    const src = tag.attrs[0];
    assert.equal(html.slice(src?.valueStart, src?.valueEnd), 'a.js');
  });

  it('survives broken markup', () => {
    assert.deepEqual(scanTags('a < b <').map((tag) => tag.name), []);
    assert.equal(scanTags('<div a="unterminated').length, 1);
    assert.equal(scanTags('<!-- never closed <body>').length, 0);
    assert.equal(scanTags('<script>never closed <body>').length, 1);
  });
});
