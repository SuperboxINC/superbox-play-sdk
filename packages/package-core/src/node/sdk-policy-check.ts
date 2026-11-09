import { get as httpGet } from 'node:http';
import { get as httpsGet } from 'node:https';
import { evaluateSdkPolicy, parseSdkPolicy, SDK_POLICY_URL, type SdkPolicyVerdict } from '../sdk-policy.ts';

/**
 * 공개 저장소의 sdk-policy.json 을 읽어 이 도구 버전을 판정한다 — 빌드를 늦추지 않게 2초만 기다리고, 네트워크 · 파일 문제로는 막지 않는다.
 * 낡은 Node 에서도 돌아야 해서(Unity) fetch 를 쓰지 않는다.
 */
export const SDK_POLICY_URL_ENV = 'SUPERBOX_PLAY_POLICY_URL';
const POLICY_OFF = 'off';
const DEFAULT_TIMEOUT_MS = 2000;
const MAX_POLICY_CHARS = 16 * 1024;
const OK: SdkPolicyVerdict = { kind: 'ok' };

function readJson(url: string, timeoutMs: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const get = url.startsWith('http:') ? httpGet : httpsGet;
    const request = get(url, (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`status ${response.statusCode}`));
        return;
      }
      let text = '';
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => {
        text += chunk;
        if (text.length > MAX_POLICY_CHARS) request.destroy(new Error('too large'));
      });
      response.on('end', () => {
        try {
          resolve(JSON.parse(text));
        } catch (error) {
          reject(error);
        }
      });
      response.on('error', reject);
    });
    // 전체 시간을 잰다 — request.setTimeout 은 쉬는 시간만 재서 조금씩 흘리는 서버를 넘기지 못한다
    const deadline = setTimeout(() => {
      reject(new Error('timeout'));
      request.destroy();
    }, timeoutMs);
    request.on('close', () => clearTimeout(deadline));
    request.on('error', reject);
  });
}

export async function checkSdkPolicy(version: string, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<SdkPolicyVerdict> {
  const configured = process.env[SDK_POLICY_URL_ENV];
  if (configured === POLICY_OFF) return OK;
  const policy = await readJson(configured || SDK_POLICY_URL, timeoutMs).then(parseSdkPolicy, () => null);
  return policy ? evaluateSdkPolicy(policy, version) : OK;
}
