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

/** 정책을 어떻게 봤나 — 읽음 · 끔(`SUPERBOX_PLAY_POLICY_URL=off`) · 읽지 못함(네트워크 · 시간 초과 · 틀린 파일). */
export type SdkPolicySource = 'read' | 'off' | 'unreadable';

export interface SdkPolicyInspection {
  readonly verdict: SdkPolicyVerdict;
  readonly policy: SdkPolicySource;
}

/**
 * 판정과 함께 정책을 실제로 읽었는지 — 판정만 보면 「최신이다」와 「확인하지 못했다」가 같은 `ok` 라서,
 * 에디터를 켤 때의 알림이 이것으로 갈라 못 읽었으면 다음 로드에서 다시 본다.
 */
export async function inspectSdkPolicy(version: string, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<SdkPolicyInspection> {
  const configured = process.env[SDK_POLICY_URL_ENV];
  if (configured === POLICY_OFF) return { verdict: OK, policy: 'off' };
  const policy = await readJson(configured || SDK_POLICY_URL, timeoutMs).then(parseSdkPolicy, () => null);
  return policy ? { verdict: evaluateSdkPolicy(policy, version), policy: 'read' } : { verdict: OK, policy: 'unreadable' };
}

export async function checkSdkPolicy(version: string, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<SdkPolicyVerdict> {
  return (await inspectSdkPolicy(version, timeoutMs)).verdict;
}
