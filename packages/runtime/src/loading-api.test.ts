import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createLoading, type LoadingController } from './loading-api.ts';
import type { LoadingErrorInfo, LoadingSignal, LoadingView } from './types.ts';

interface Harness {
  readonly loading: LoadingController;
  readonly signals: LoadingSignal[];
  readonly reported: unknown[];
  readonly view: { progress: number[]; hidden: number; errors: LoadingErrorInfo[]; errorHidden: number; appInfo: unknown[] };
  tick(ms: number): void;
}

function harness(): Harness {
  let clock = 1000;
  const timers: { at: number; run: () => void }[] = [];
  const signals: LoadingSignal[] = [];
  const reported: unknown[] = [];
  const state = { progress: [] as number[], hidden: 0, errors: [] as LoadingErrorInfo[], errorHidden: 0, appInfo: [] as unknown[] };
  const view: LoadingView = {
    attach: () => undefined,
    setProgress: (value) => state.progress.push(value),
    setAppInfo: (info) => state.appInfo.push(info),
    hide: () => {
      state.hidden += 1;
    },
    showError: (error) => state.errors.push(error),
    hideError: () => {
      state.errorHidden += 1;
    },
  };
  const loading = createLoading({
    appInfo: { title: '패키지 이름', iconUrl: null, primaryColor: '#111111', backgroundColor: '#222222' },
    view,
    post: (signal) => signals.push(signal),
    now: () => clock,
    later: (run, ms) => timers.push({ at: clock + ms, run }),
    report: (error) => reported.push(error),
    classify: (message) => (/webgl/i.test(message) ? 'WEBGL_CONTEXT' : 'ENGINE_INIT'),
  });
  return {
    loading,
    signals,
    reported,
    view: state,
    tick: (ms) => {
      clock += ms;
      for (const timer of timers.filter((item) => item.at <= clock)) {
        timers.splice(timers.indexOf(timer), 1);
        timer.run();
      }
    },
  };
}

describe('SBPlayLoading', () => {
  it('starts with package values and autoComplete on', () => {
    const { loading } = harness();
    assert.equal(loading.api.appInfo.title, '패키지 이름');
    assert.equal(loading.api.autoComplete, true);
    assert.equal(loading.hasProgress(), false);
  });

  it('onReady calls right away and again each time app info changes', () => {
    const { loading, view } = harness();
    const seen: (string | null)[] = [];
    loading.api.onReady((info) => seen.push(info.title));
    loading.setAppInfo({ title: '콘솔 이름' });
    assert.deepEqual(seen, ['패키지 이름', '콘솔 이름']);
    assert.equal(loading.api.appInfo.title, '콘솔 이름');
    assert.equal(loading.api.appInfo.primaryColor, '#111111');
    assert.equal(view.appInfo.length, 1);
  });

  it('progress never goes back and is clamped', () => {
    const { loading, view } = harness();
    const seen: number[] = [];
    loading.api.onProgress((value) => seen.push(value));
    loading.api.progress(0.2);
    loading.api.progress(0.1);
    loading.api.progress(5);
    loading.api.progress(Number.NaN);
    loading.api.progress('0.5' as unknown as number);
    assert.deepEqual(seen, [0.2, 1]);
    assert.deepEqual(view.progress, [0.2, 1]);
  });

  it('a late onProgress gets the last value once', () => {
    const { loading } = harness();
    loading.api.progress(0.4);
    const seen: number[] = [];
    loading.api.onProgress((value) => seen.push(value));
    assert.deepEqual(seen, [0.4]);
    const none: number[] = [];
    harness().loading.api.onProgress((value) => none.push(value));
    assert.deepEqual(none, []);
  });

  it('throttles progress signals but lets the first through and never loses the last', () => {
    const { loading, signals, tick } = harness();
    loading.api.progress(0.1);
    loading.api.progress(0.2);
    tick(50);
    loading.api.progress(0.3);
    assert.deepEqual(signals, [{ stage: 'progress', progress: 0.1 }]);
    tick(60);
    assert.deepEqual(signals.at(-1), { stage: 'progress', progress: 0.3 }, '멈춰 있어도 마지막 값이 나간다');
    loading.api.progress(0.4);
    assert.equal(signals.length, 2);
    tick(100);
    assert.deepEqual(signals.at(-1), { stage: 'progress', progress: 0.4 });
    assert.equal(signals.length, 3);
    tick(1000);
    assert.equal(signals.length, 3, '바뀐 것이 없으면 더 보내지 않는다');
  });

  it('a queued progress signal never follows ready', () => {
    const { loading, signals, tick } = harness();
    loading.api.progress(0.1);
    loading.api.progress(0.2);
    loading.api.complete();
    tick(1000);
    assert.deepEqual(signals.map((signal) => signal.stage), ['progress', 'ready']);
  });

  it('complete closes once, signals ready with elapsed time and fills the bar', () => {
    const { loading, signals, view, tick } = harness();
    tick(2120.4);
    const completed: number[] = [];
    loading.api.onComplete(() => completed.push(1));
    loading.api.complete();
    loading.api.complete();
    assert.equal(loading.isComplete(), true);
    assert.deepEqual(completed, [1]);
    assert.equal(view.hidden, 1);
    assert.deepEqual(view.progress, [1]);
    assert.deepEqual(signals, [{ stage: 'ready', elapsedMs: 3120 }]);
  });

  it('a late onComplete runs at once; progress after complete does nothing', () => {
    const { loading, view } = harness();
    loading.api.complete();
    let called = false;
    loading.api.onComplete(() => {
      called = true;
    });
    assert.equal(called, true);
    loading.api.progress(0.5);
    assert.deepEqual(view.progress, [1]);
  });

  it('error shows the screen once, signals the code and truncates the message', () => {
    const { loading, signals, view } = harness();
    const seen: LoadingErrorInfo[] = [];
    loading.api.onError((error) => seen.push(error));
    loading.api.error('WebGL 없음');
    loading.api.error('둘째');
    assert.equal(loading.hasFailed(), true);
    assert.deepEqual(seen, [{ code: 'WEBGL_CONTEXT', message: 'WebGL 없음' }]);
    assert.equal(view.errors.length, 1);
    assert.deepEqual(signals, [{ stage: 'error', code: 'WEBGL_CONTEXT', message: 'WebGL 없음' }]);

    const other = harness();
    other.loading.api.error(new Error('x'.repeat(500)));
    assert.equal(other.view.errors[0]?.message.length, 200);
    assert.equal(other.view.errors[0]?.code, 'ENGINE_INIT');
  });

  it('a late onError gets the failure', () => {
    const { loading } = harness();
    loading.fail('SCRIPT_LOAD', 'a.js');
    const seen: LoadingErrorInfo[] = [];
    loading.api.onError((error) => seen.push(error));
    assert.deepEqual(seen, [{ code: 'SCRIPT_LOAD', message: 'a.js' }]);
  });

  it('complete after an error trusts the game and closes the error screen', () => {
    const { loading, view } = harness();
    loading.fail('UNKNOWN', 'x');
    loading.api.complete();
    assert.equal(view.errorHidden, 1);
    assert.equal(view.hidden, 1);
  });

  it('errors after complete are ignored — the game is running', () => {
    const { loading, view, signals } = harness();
    loading.api.complete();
    loading.api.error('늦은 오류');
    assert.equal(view.errors.length, 0);
    assert.equal(signals.some((signal) => signal.stage === 'error'), false);
  });

  it('hide closes the screen without the ready signal', () => {
    const { loading, view, signals } = harness();
    loading.api.hide();
    assert.equal(view.hidden, 1);
    assert.equal(loading.isComplete(), false);
    assert.deepEqual(signals, []);
  });

  it('a throwing game callback does not stop the flow', () => {
    const { loading, reported } = harness();
    const seen: string[] = [];
    loading.api.onProgress(() => {
      throw new Error('게임 콜백 오류');
    });
    loading.api.onProgress(() => seen.push('progress'));
    loading.api.onComplete(() => {
      throw new Error('완료 콜백 오류');
    });
    loading.api.onComplete(() => seen.push('complete'));
    loading.api.onError(() => {
      throw new Error('오류 콜백 오류');
    });
    loading.api.progress(0.5);
    loading.api.complete();
    assert.deepEqual(seen, ['progress', 'progress', 'complete']);
    assert.equal(reported.length, 3);
  });

  it('tracks movement for the watchdog', () => {
    const { loading, tick } = harness();
    tick(10);
    loading.api.progress(0.2);
    const moved = loading.lastMoveAt();
    tick(100);
    loading.api.progress(0.2);
    assert.equal(loading.lastMoveAt(), moved);
    assert.equal(loading.lastProgress(), 0.2);
    assert.equal(loading.hasProgress(), true);
  });
});
