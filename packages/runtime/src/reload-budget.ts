/**
 * 자동 새로고침 예산 — 세션당 2회로 끊는다(package-format.md 5장). 세는 자리가 없으면(저장소가 던지면) 새로고침하지 않는다:
 * 셀 수 없는 새로고침은 끝나지 않는 고리가 될 수 있다. 사용자가 누르는 「다시 시도」는 여기를 지나지 않는다.
 */
export const MAX_AUTO_RELOADS = 2;
const STORAGE_KEY = 'sbp.reload';

export interface CounterStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** 새로고침해도 되면 true(세었다), 안 되면 false. 어떤 경우에도 던지지 않는다. */
export function spendAutoReload(getStorage: () => CounterStorage): boolean {
  try {
    const storage = getStorage();
    const used = Number.parseInt(storage.getItem(STORAGE_KEY) ?? '0', 10);
    const count = Number.isFinite(used) ? used : MAX_AUTO_RELOADS;
    if (count >= MAX_AUTO_RELOADS) return false;
    storage.setItem(STORAGE_KEY, String(count + 1));
    return true;
  } catch {
    return false;
  }
}
