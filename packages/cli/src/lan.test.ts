import assert from 'node:assert/strict';
import type { NetworkInterfaceInfo } from 'node:os';
import { describe, it } from 'node:test';
import { formatLanAccess, lanAddresses } from './lan.ts';

const ipv4 = (address: string, internal = false): NetworkInterfaceInfo =>
  ({ address, family: 'IPv4', internal, netmask: '255.255.255.0', mac: '00:00:00:00:00:00', cidr: `${address}/24` }) as NetworkInterfaceInfo;
const ipv6: NetworkInterfaceInfo = { address: 'fe80::1', family: 'IPv6', internal: false, netmask: 'ffff::', mac: '00:00:00:00:00:00', cidr: 'fe80::1/64', scopeid: 1 };

describe('lan addresses', () => {
  it('finds the private IPv4 address a phone on the same network can reach', () => {
    assert.deepEqual(lanAddresses({ lo0: [ipv4('127.0.0.1', true)], en0: [ipv6, ipv4('192.168.0.12')] }), ['192.168.0.12']);
  });

  it('lists Wi-Fi and Ethernet before anything else', () => {
    assert.deepEqual(lanAddresses({ foo0: [ipv4('10.1.0.2')], en0: [ipv4('192.168.0.12')], 'Wi-Fi': [ipv4('172.20.10.3')] }), ['192.168.0.12', '172.20.10.3', '10.1.0.2']);
  });

  it('leaves out addresses a phone cannot reach', () => {
    const unreachable = {
      docker0: [ipv4('172.17.0.1')],
      'br-abc': [ipv4('172.18.0.1')],
      vmnet8: [ipv4('192.168.56.1')],
      'vEthernet (WSL)': [ipv4('172.24.0.1')],
      utun3: [ipv4('10.8.0.2')],
      bridge100: [ipv4('192.168.64.1')],
      awdl0: [ipv4('169.254.1.1')],
      en1: [ipv4('8.8.8.8'), ipv4('169.254.10.2')],
    };
    assert.deepEqual(lanAddresses(unreachable), []);
  });

  it('accepts the numeric family older Node reports', () => {
    assert.deepEqual(lanAddresses({ en0: [{ ...ipv4('192.168.0.12'), family: 4 as unknown as 'IPv4' }] }), ['192.168.0.12']);
  });

  it('lists an address once', () => {
    assert.deepEqual(lanAddresses({ en0: [ipv4('192.168.0.12')], en1: [ipv4('192.168.0.12')] }), ['192.168.0.12']);
  });

  it('returns nothing without a network', () => {
    assert.deepEqual(lanAddresses({}), []);
  });
});

describe('lan access text', () => {
  it('shows where to open it, with a QR code for the first address', () => {
    const text = formatLanAccess(8300, ['192.168.0.12', '10.1.0.2']);
    assert.ok(text.includes('http://192.168.0.12:8300/'));
    assert.ok(text.includes('http://10.1.0.2:8300/'));
    assert.ok(text.includes('같은 Wi-Fi'));
    assert.ok(/[█▀▄]/u.test(text), 'QR 을 그린다');
  });

  it('says so when there is no address to open', () => {
    const text = formatLanAccess(8300, []);
    assert.ok(text.includes('Wi-Fi 연결을 확인해 주세요'));
    assert.equal(/[█▀▄]/u.test(text), false);
  });
});
