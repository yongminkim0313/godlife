import type { MailImport, NotificationRecord, Schedule, Settings, WeatherCache } from '../types';

/**
 * 온디바이스 저장소 (기획서 3.2 오프라인 캐싱).
 *
 * 일정·메일 파싱 결과·날씨 캐시·설정을 전부 localStorage에 둔다. 네트워크가 없어도
 * 홈/달력/상세가 그대로 뜨고, 온라인이 되면 sync.ts가 백그라운드로 밀어 올린다.
 */

const PREFIX = 'godlife.v1.';

export const KEYS = {
  schedules: `${PREFIX}schedules`,
  mails: `${PREFIX}mails`,
  notifications: `${PREFIX}notifications`,
  settings: `${PREFIX}settings`,
  weather: `${PREFIX}weather`,
  sync: `${PREFIX}sync`,
} as const;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    // 캐시가 깨졌다고 앱이 죽으면 안 된다. 조회는 항상 성공해야 한다.
    console.warn(`[db] ${key} 캐시를 읽지 못해 기본값으로 복구합니다.`);
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`[db] ${key} 저장 실패`, error);
  }
}

export const DEFAULT_SETTINGS: Settings = {
  defaultOffsets: [10, 1440],
  preparationReminder: true,
  snoozeMinutes: 10,
  maxSnooze: 3,
  region: { name: '서울', latitude: 37.5665, longitude: 126.978 },
  weatherEnabled: true,
  institutionFilter: ['kindergarten', 'daycare', 'home'],
};

export const db = {
  loadSchedules: (): Schedule[] => read<Schedule[]>(KEYS.schedules, []),
  saveSchedules: (v: Schedule[]) => write(KEYS.schedules, v),

  loadMails: (): MailImport[] => read<MailImport[]>(KEYS.mails, []),
  saveMails: (v: MailImport[]) => write(KEYS.mails, v),

  loadNotifications: (): NotificationRecord[] => read<NotificationRecord[]>(KEYS.notifications, []),
  saveNotifications: (v: NotificationRecord[]) => write(KEYS.notifications, v),

  loadSettings: (): Settings => ({ ...DEFAULT_SETTINGS, ...read<Partial<Settings>>(KEYS.settings, {}) }),
  saveSettings: (v: Settings) => write(KEYS.settings, v),

  loadWeather: (): WeatherCache | null => read<WeatherCache | null>(KEYS.weather, null),
  saveWeather: (v: WeatherCache) => write(KEYS.weather, v),

  loadSyncedAt: (): string | undefined => read<{ lastSyncedAt?: string }>(KEYS.sync, {}).lastSyncedAt,
  saveSyncedAt: (v: string) => write(KEYS.sync, { lastSyncedAt: v }),

  clearAll: () => Object.values(KEYS).forEach((k) => localStorage.removeItem(k)),
};

/** 마지막 저장 우선(last-write-wins) 병합. updatedAt이 큰 쪽이 이긴다. */
export function mergeByUpdatedAt<T extends { id: string; updatedAt: string }>(local: T[], remote: T[]): T[] {
  const map = new Map(local.map((item) => [item.id, item]));
  for (const item of remote) {
    const mine = map.get(item.id);
    if (!mine || item.updatedAt > mine.updatedAt) map.set(item.id, item);
  }
  return [...map.values()];
}
