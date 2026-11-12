import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { initialConfig, loadingModeOf, parseConfig } from './config.ts';
import { PackageError } from './errors.ts';

function failsOn(raw: unknown, field: string): void {
  assert.throws(() => parseConfig(raw), (error: unknown) => error instanceof PackageError && error.code === 'CONFIG_INVALID' && error.detail === field, field);
}

describe('parseConfig', () => {
  it('accepts the example from the format document', () => {
    const { config, warnings } = parseConfig({
      version: '1.0.3',
      title: '드랍 더 넘버',
      orientation: 'portrait',
      aspectRange: { min: '9:21', max: '3:4' },
      engine: 'unity',
      loading: { backgroundColor: '#0B0F19', primaryColor: '#1B64DA', image: 'loading/logo.png', tips: ['블록을 합치면 점수가 올라요'], html: 'loading.html' },
      runtime: { earlyFetch: true, maxDevicePixelRatio: 'auto', watchdog: true, debugConsole: false },
    });
    assert.equal(config.title, '드랍 더 넘버');
    assert.equal(config.runtime?.maxDevicePixelRatio, 'auto');
    assert.deepEqual(config.aspectRange, { min: 0.4286, max: 0.75 });
    assert.deepEqual(warnings, []);
  });

  it('reads the aspect range as width ÷ height — "W:H" text or a number, four decimals', () => {
    assert.deepEqual(parseConfig({ aspectRange: { min: '4:3', max: '2.4:1' } }).config.aspectRange, { min: 1.3333, max: 2.4 });
    assert.deepEqual(parseConfig({ aspectRange: { min: 1.33333, max: 2.4 } }).config.aspectRange, { min: 1.3333, max: 2.4 });
    assert.deepEqual(parseConfig({ aspectRange: { min: ' 1:4 ', max: '4:1' } }).config.aspectRange, { min: 0.25, max: 4 });
    assert.deepEqual(parseConfig({ aspectRange: { min: '16:9', max: '16:9' } }).config.aspectRange, { min: 1.7778, max: 1.7778 });
  });

  it('every field is optional', () => {
    assert.deepEqual(parseConfig({}), { config: {}, warnings: [] });
  });

  it('stops on wrong values', () => {
    failsOn([], '(root)');
    failsOn({ version: 'a b' }, 'version');
    failsOn({ title: '' }, 'title');
    failsOn({ title: 'x'.repeat(101) }, 'title');
    failsOn({ title: `a${String.fromCharCode(0x202e)}b` }, 'title');
    failsOn({ title: 'a\nb' }, 'title');
    failsOn({ orientation: 'up' }, 'orientation');
    failsOn({ engine: 'godot' }, 'engine');
    failsOn({ loading: 1 }, 'loading');
    failsOn({ loading: { backgroundColor: 'red' } }, 'loading.backgroundColor');
    failsOn({ loading: { primaryColor: '#12345' } }, 'loading.primaryColor');
    failsOn({ loading: { tips: 'one' } }, 'loading.tips');
    failsOn({ loading: { tips: [''] } }, 'loading.tips[0]');
    failsOn({ loading: { tips: new Array(11).fill('a') } }, 'loading.tips');
    failsOn({ runtime: { watchdog: 'yes' } }, 'runtime.watchdog');
    failsOn({ runtime: { maxDevicePixelRatio: 9 } }, 'runtime.maxDevicePixelRatio');
    failsOn({ runtime: { maxDevicePixelRatio: 'high' } }, 'runtime.maxDevicePixelRatio');
    failsOn({ aspectRange: '4:3' }, 'aspectRange');
    failsOn({ aspectRange: { min: '4:3' } }, 'aspectRange.max');
    failsOn({ aspectRange: { min: 'wide', max: '2:1' } }, 'aspectRange.min');
    failsOn({ aspectRange: { min: '4:0', max: '2:1' } }, 'aspectRange.min');
    failsOn({ aspectRange: { min: '-4:3', max: '2:1' } }, 'aspectRange.min');
    failsOn({ aspectRange: { min: '1:5', max: '2:1' } }, 'aspectRange.min');
    failsOn({ aspectRange: { min: 1, max: 4.5 } }, 'aspectRange.max');
    failsOn({ aspectRange: { min: 1, max: Number.POSITIVE_INFINITY } }, 'aspectRange.max');
    failsOn({ aspectRange: { min: '2:1', max: '4:3' } }, 'aspectRange');
  });

  it('warns about unknown keys, which may be typos', () => {
    const { warnings } = parseConfig({ titel: 'x', loading: { tip: [] }, runtime: { watchDog: true }, aspectRange: { min: '4:3', max: '2:1', step: 1 }, $schema: 'x' });
    assert.equal(warnings.length, 4);
    assert.ok(warnings.every((item) => item.code === 'CONFIG_UNKNOWN_KEY'));
    assert.ok(warnings[0]?.message.includes('titel'));
    assert.ok(warnings[1]?.message.includes('loading.tip'));
    assert.ok(warnings[3]?.message.includes('aspectRange.step'));
  });
});

describe('loadingModeOf', () => {
  it('follows the values', () => {
    assert.equal(loadingModeOf({}), 'default');
    assert.equal(loadingModeOf({ loading: {} }), 'default');
    assert.equal(loadingModeOf({ loading: { tips: [] } }), 'default');
    assert.equal(loadingModeOf({ loading: { tips: ['a'] } }), 'theme');
    assert.equal(loadingModeOf({ loading: { backgroundColor: '#000000' } }), 'theme');
    assert.equal(loadingModeOf({ loading: { primaryColor: '#000000' } }), 'theme');
    assert.equal(loadingModeOf({ loading: { image: 'a.png' } }), 'theme');
    assert.equal(loadingModeOf({ loading: { html: 'l.html', primaryColor: '#000000' } }), 'custom');
  });
});

describe('initialConfig', () => {
  it('passes its own validation and starts in default mode', () => {
    const config = initialConfig('내 게임');
    assert.deepEqual(parseConfig(config).warnings, []);
    assert.equal(loadingModeOf(config), 'default');
    assert.equal(config.title, '내 게임');
  });
});
