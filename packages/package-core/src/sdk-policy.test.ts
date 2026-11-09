import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateSdkPolicy, parseSdkPolicy, type SdkPolicy } from './sdk-policy.ts';

const POLICY: SdkPolicy = { minVersion: '0.2.0', recommendedVersion: '0.3.0', deniedVersions: ['0.2.5'] };

describe('sdk policy', () => {
  describe('evaluate', () => {
    it('lets the recommended version and anything newer through', () => {
      assert.deepEqual(evaluateSdkPolicy(POLICY, '0.3.0'), { kind: 'ok' });
      assert.deepEqual(evaluateSdkPolicy(POLICY, '1.0.0'), { kind: 'ok' });
    });

    it('recommends an update between the minimum and the recommended version', () => {
      const verdict = evaluateSdkPolicy(POLICY, '0.2.0');
      assert.equal(verdict.kind, 'update-recommended');
      assert.ok(verdict.kind === 'update-recommended' && verdict.message.includes('0.3.0'));
    });

    it('blocks anything below the minimum', () => {
      const verdict = evaluateSdkPolicy(POLICY, '0.1.9');
      assert.equal(verdict.kind, 'blocked');
      assert.ok(verdict.kind === 'blocked' && verdict.message.includes('0.1.9') && verdict.message.includes('0.2.0'));
    });

    it('blocks a denied version even when it is new enough', () => {
      const verdict = evaluateSdkPolicy(POLICY, '0.2.5');
      assert.equal(verdict.kind, 'blocked');
      assert.ok(verdict.kind === 'blocked' && verdict.message.includes('0.2.5'));
    });

    it('names the version to move to, and the one in use', () => {
      for (const version of ['0.2.0', '0.1.9']) {
        const verdict = evaluateSdkPolicy(POLICY, version);
        assert.ok(verdict.kind !== 'ok' && verdict.latestVersion === '0.3.0' && verdict.message.includes(version), version);
      }
    });

    it('compares numbers, not letters', () => {
      assert.equal(evaluateSdkPolicy({ minVersion: '0.9.0', recommendedVersion: '0.9.0', deniedVersions: [] }, '0.10.0').kind, 'ok');
    });

    it('does not judge a version it cannot read', () => {
      assert.deepEqual(evaluateSdkPolicy(POLICY, '0.1.0-dev'), { kind: 'ok' });
    });

    it('blocks a denied pre-release by its exact name', () => {
      assert.equal(evaluateSdkPolicy({ ...POLICY, deniedVersions: ['0.3.0-rc.1'] }, '0.3.0-rc.1').kind, 'blocked');
    });
  });

  describe('parse', () => {
    it('reads a valid policy', () => {
      assert.deepEqual(parseSdkPolicy({ schemaVersion: 1, minVersion: '0.1.0', recommendedVersion: '0.2.0', deniedVersions: ['0.1.5'] }), {
        minVersion: '0.1.0',
        recommendedVersion: '0.2.0',
        deniedVersions: ['0.1.5'],
      });
    });

    it('treats a missing denied list as empty', () => {
      assert.deepEqual(parseSdkPolicy({ schemaVersion: 1, minVersion: '0.1.0', recommendedVersion: '0.1.0' })?.deniedVersions, []);
    });

    it('keeps the minimum when a denied entry is one it cannot read', () => {
      const policy = parseSdkPolicy({ schemaVersion: 1, minVersion: '0.2.0', recommendedVersion: '0.2.0', deniedVersions: ['0.2.1-rc.1', 1, null] });
      assert.deepEqual(policy, { minVersion: '0.2.0', recommendedVersion: '0.2.0', deniedVersions: ['0.2.1-rc.1'] });
    });

    it('keeps the minimum when the denied list is not a list', () => {
      assert.deepEqual(parseSdkPolicy({ schemaVersion: 1, minVersion: '0.2.0', recommendedVersion: '0.2.0', deniedVersions: 'x' })?.deniedVersions, []);
    });

    for (const [name, value] of [
      ['not an object', 'x'],
      ['nothing', null],
      ['a future schema', { schemaVersion: 2, minVersion: '0.1.0', recommendedVersion: '0.1.0' }],
      ['a broken minimum', { schemaVersion: 1, minVersion: 'latest', recommendedVersion: '0.1.0' }],
      ['a broken recommended version', { schemaVersion: 1, minVersion: '0.1.0', recommendedVersion: 3 }],
    ] as const) {
      it(`ignores ${name}`, () => {
        assert.equal(parseSdkPolicy(value), null);
      });
    }
  });
});
