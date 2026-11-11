import assert from 'node:assert/strict';
import { createServer, type RequestListener, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, afterEach, describe, it } from 'node:test';
import { checkSdkPolicy, inspectSdkPolicy, SDK_POLICY_URL_ENV } from './sdk-policy-check.ts';

const POLICY = JSON.stringify({ schemaVersion: 1, minVersion: '0.2.0', recommendedVersion: '0.3.0', deniedVersions: [] });
const SHORT_TIMEOUT_MS = 50;

describe('sdk policy check', () => {
  const previous = process.env[SDK_POLICY_URL_ENV];
  let server: Server | undefined;

  async function serve(listener: RequestListener): Promise<void> {
    server = createServer(listener);
    await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
    process.env[SDK_POLICY_URL_ENV] = `http://127.0.0.1:${(server.address() as AddressInfo).port}/sdk-policy.json`;
  }

  afterEach(async () => {
    server?.closeAllConnections();
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
    server = undefined;
  });

  after(() => {
    if (previous === undefined) delete process.env[SDK_POLICY_URL_ENV];
    else process.env[SDK_POLICY_URL_ENV] = previous;
  });

  it('judges the version by the published policy', async () => {
    await serve((_request, response) => response.end(POLICY));
    assert.equal((await checkSdkPolicy('0.1.0')).kind, 'blocked');
    assert.equal((await checkSdkPolicy('0.2.0')).kind, 'update-recommended');
    assert.equal((await checkSdkPolicy('0.3.0')).kind, 'ok');
  });

  it('does not block when the policy is missing', async () => {
    await serve((_request, response) => {
      response.statusCode = 404;
      response.end('not found');
    });
    assert.deepEqual(await checkSdkPolicy('0.1.0'), { kind: 'ok' });
  });

  it('does not block when the policy is broken', async () => {
    await serve((_request, response) => response.end('{ broken'));
    assert.deepEqual(await checkSdkPolicy('0.1.0'), { kind: 'ok' });
  });

  it('does not block when the network fails', async () => {
    process.env[SDK_POLICY_URL_ENV] = 'http://127.0.0.1:1/sdk-policy.json';
    assert.deepEqual(await checkSdkPolicy('0.1.0'), { kind: 'ok' });
  });

  it('does not wait for a slow server', async () => {
    await serve(() => undefined);
    assert.deepEqual(await checkSdkPolicy('0.1.0', SHORT_TIMEOUT_MS), { kind: 'ok' });
  });

  it('does not wait for a server that keeps trickling', async () => {
    await serve((_request, response) => {
      response.write('{');
      const trickle = setInterval(() => response.write(' '), SHORT_TIMEOUT_MS / 5);
      response.on('close', () => clearInterval(trickle));
    });
    assert.deepEqual(await checkSdkPolicy('0.1.0', SHORT_TIMEOUT_MS), { kind: 'ok' });
  });

  it('tells whether the policy was read, so a failed check is not taken for up to date', async () => {
    await serve((_request, response) => response.end(POLICY));
    assert.deepEqual(await inspectSdkPolicy('0.3.0'), { verdict: { kind: 'ok' }, policy: 'read' });
    assert.equal((await inspectSdkPolicy('0.2.0')).policy, 'read');

    process.env[SDK_POLICY_URL_ENV] = 'http://127.0.0.1:1/sdk-policy.json';
    assert.deepEqual(await inspectSdkPolicy('0.3.0'), { verdict: { kind: 'ok' }, policy: 'unreadable' });

    process.env[SDK_POLICY_URL_ENV] = 'off';
    assert.deepEqual(await inspectSdkPolicy('0.3.0'), { verdict: { kind: 'ok' }, policy: 'off' });
  });

  it('does not take a broken policy for a read one', async () => {
    await serve((_request, response) => response.end('{ broken'));
    assert.equal((await inspectSdkPolicy('0.1.0')).policy, 'unreadable');
  });

  it('does not ask when the check is turned off', async () => {
    let asked = false;
    await serve((_request, response) => {
      asked = true;
      response.end(POLICY);
    });
    process.env[SDK_POLICY_URL_ENV] = 'off';
    assert.deepEqual(await checkSdkPolicy('0.1.0'), { kind: 'ok' });
    assert.equal(asked, false);
  });
});
