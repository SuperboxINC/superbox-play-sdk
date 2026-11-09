import type { NetworkInterfaceInfo } from 'node:os';
import { qrForTerminal } from './qr.ts';

/**
 * 같은 Wi-Fi 의 휴대폰에서 열 주소 — 사설 IPv4 만, 실제 망 카드를 먼저. VPN · Docker · 가상 머신 어댑터의 주소는 휴대폰이 닿지 못해 뺀다.
 */
const PRIVATE_IPV4 = /^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/;
const VIRTUAL_ADAPTER = /docker|veth|vmnet|vboxnet|vmware|virtualbox|hyper-v|vethernet|utun|tun\d|tap\d|ppp|ipsec|bridge|^br-|awdl|llw|tailscale|zerotier|^wg\d/i;
const PHYSICAL_ADAPTER = /^(en|eth|wlan|wl)|wi-?fi|ethernet|이더넷/i;

type NetworkInterfaces = Readonly<Record<string, readonly NetworkInterfaceInfo[] | undefined>>;

function reachableAddresses(entries: readonly NetworkInterfaceInfo[] | undefined): readonly string[] {
  return (entries ?? [])
    .filter((entry) => (entry.family === 'IPv4' || (entry.family as unknown) === 4) && !entry.internal && PRIVATE_IPV4.test(entry.address))
    .map((entry) => entry.address);
}

export function lanAddresses(interfaces: NetworkInterfaces): readonly string[] {
  const usable = Object.entries(interfaces).filter(([name]) => !VIRTUAL_ADAPTER.test(name));
  const physicalFirst = [...usable.filter(([name]) => PHYSICAL_ADAPTER.test(name)), ...usable.filter(([name]) => !PHYSICAL_ADAPTER.test(name))];
  return [...new Set(physicalFirst.flatMap(([, entries]) => reachableAddresses(entries)))];
}

export function lanUrl(address: string, port: number): string {
  return `http://${address}:${port}/`;
}

/** `dev --lan` 이 찍는 글 — 첫 주소는 QR 까지 */
export function formatLanAccess(port: number, addresses: readonly string[]): string {
  const [first, ...others] = addresses.map((address) => lanUrl(address, port));
  if (!first) return '휴대폰에서 열 주소를 찾지 못했어요. Wi-Fi 연결을 확인해 주세요.\n';
  const lines = [`휴대폰에서 열기 ${first}`, qrForTerminal(first), ...others.map((url) => `다른 주소 ${url}`), '휴대폰과 이 컴퓨터가 같은 Wi-Fi에 있어야 해요. 열리지 않으면 방화벽에서 Node 연결을 허용해 주세요.'];
  return `${lines.join('\n')}\n`;
}
