/**
 * 권장 픽셀 비율 — 저사양 기기가 고해상도 프레임버퍼를 감당하지 못해 메모리 부족 · 프레임 저하로 게임이 죽는 문제를 줄인다.
 * 값은 게임 체감과 맞바꾸는 것이라 숫자 고정(`runtime.maxDevicePixelRatio`)이 언제나 이긴다.
 */
export interface DeviceHints {
  readonly devicePixelRatio: number;
  readonly mobile: boolean;
  readonly ios: boolean;
  readonly memoryGb?: number | undefined;
  readonly cores?: number | undefined;
  readonly renderer: string;
}

const WEAK_GPU = /Mali-[34]|Mali-T[0-7]|Adreno (?:\(TM\) )?[2-4]\d\d|PowerVR SGX|PowerVR Rogue G|Intel\(R\) HD Graphics [2-5]/i;

/** null = 손대지 않는다(데스크톱 + auto). */
export function recommendPixelRatio(setting: number | 'auto', device: DeviceHints): number | null {
  const base = device.devicePixelRatio || 1;
  if (setting !== 'auto') return Math.min(setting, base);
  if (!device.mobile) return null;
  if (WEAK_GPU.test(device.renderer)) return 1;
  if (device.memoryGb !== undefined && device.memoryGb <= 2) return 1;
  if (device.cores !== undefined && device.cores <= 2) return 1;
  const strong = device.ios ? (device.cores ?? 0) >= 6 : (device.memoryGb ?? 0) >= 6;
  return strong ? base : Math.min(base, 2);
}
