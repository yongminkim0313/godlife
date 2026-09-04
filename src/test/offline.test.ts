import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, db, mergeByUpdatedAt } from '../lib/db';
import { describeWeather, forecastFor, isStale, isWetForecast } from '../lib/weather';
import { SyncEngine } from '../lib/sync';
import type { RemoteAdapter } from '../lib/sync';
import type { Schedule, WeatherCache } from '../types';

function schedule(id: string, updatedAt: string, title: string): Schedule {
  return {
    id,
    title,
    institution: 'home',
    startAt: new Date().toISOString(),
    endAt: new Date().toISOString(),
    isAllDay: false,
    repeatRule: { freq: 'none' },
    sourceType: 'manual',
    status: 'planned',
    preparations: [],
    updatedAt,
  };
}

describe('오프라인 캐시', () => {
  beforeEach(() => localStorage.clear());

  it('저장한 일정이 그대로 복원된다', () => {
    const items = [schedule('a', '2026-03-01T00:00:00Z', '등원')];
    db.saveSchedules(items);
    expect(db.loadSchedules()).toEqual(items);
  });

  it('저장된 값이 없으면 빈 목록과 기본 설정을 준다', () => {
    expect(db.loadSchedules()).toEqual([]);
    expect(db.loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(db.loadWeather()).toBeNull();
  });

  it('캐시가 깨져도 조회는 실패하지 않는다', () => {
    localStorage.setItem('godlife.v1.schedules', '{깨진 JSON');
    expect(db.loadSchedules()).toEqual([]);
  });

  it('설정은 기본값 위에 덮어써진다', () => {
    db.saveSettings({ ...DEFAULT_SETTINGS, snoozeMinutes: 30 });
    const loaded = db.loadSettings();
    expect(loaded.snoozeMinutes).toBe(30);
    expect(loaded.maxSnooze).toBe(DEFAULT_SETTINGS.maxSnooze);
  });

  it('전체 초기화하면 저장분이 사라진다', () => {
    db.saveSchedules([schedule('a', '2026-03-01T00:00:00Z', '등원')]);
    db.clearAll();
    expect(db.loadSchedules()).toEqual([]);
  });
});

describe('mergeByUpdatedAt', () => {
  it('마지막 저장이 이긴다', () => {
    const local = [schedule('a', '2026-03-02T00:00:00Z', '로컬 최신'), schedule('b', '2026-03-01T00:00:00Z', '로컬만')];
    const remote = [schedule('a', '2026-03-01T00:00:00Z', '원격 예전'), schedule('c', '2026-03-03T00:00:00Z', '원격만')];
    const merged = mergeByUpdatedAt(local, remote);
    expect(merged.find((s) => s.id === 'a')?.title).toBe('로컬 최신');
    expect(merged.map((s) => s.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('원격이 더 최신이면 원격을 쓴다', () => {
    const merged = mergeByUpdatedAt([schedule('a', '2026-03-01T00:00:00Z', '로컬')], [schedule('a', '2026-03-05T00:00:00Z', '원격')]);
    expect(merged[0].title).toBe('원격');
  });
});

describe('날씨', () => {
  const cache: WeatherCache = {
    region: DEFAULT_SETTINGS.region,
    cachedAt: new Date().toISOString(),
    forecast: [
      { date: '2026-03-02', code: 0, tempMin: 3, tempMax: 14, precipProbability: 0 },
      { date: '2026-03-03', code: 61, tempMin: 5, tempMax: 11, precipProbability: 80 },
      { date: '2026-03-04', code: 3, tempMin: 4, tempMax: 10, precipProbability: 65 },
    ],
  };

  it('날짜로 예보를 찾는다', () => {
    expect(forecastFor(cache, '2026-03-03')?.code).toBe(61);
    expect(forecastFor(cache, '2026-04-01')).toBeUndefined();
    expect(forecastFor(null, '2026-03-03')).toBeUndefined();
  });

  it('비/눈 코드와 높은 강수확률을 우천으로 본다', () => {
    expect(isWetForecast(cache.forecast[0])).toBe(false);
    expect(isWetForecast(cache.forecast[1])).toBe(true);
    expect(isWetForecast(cache.forecast[2])).toBe(true); // 흐림이지만 강수확률 65%
  });

  it('WMO 코드를 사람이 읽는 라벨로 바꾼다', () => {
    expect(describeWeather(0).label).toBe('맑음');
    expect(describeWeather(71).wet).toBe(true);
  });

  it('오래된 캐시는 만료로 판정한다', () => {
    expect(isStale(cache)).toBe(false);
    expect(isStale({ ...cache, cachedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString() })).toBe(true);
    expect(isStale(null)).toBe(true);
  });
});

describe('SyncEngine', () => {
  beforeEach(() => localStorage.clear());

  it('pull을 기다리는 동안 생긴 로컬 변경을 덮어쓰지 않는다', async () => {
    // 동기화 중에도 사용자가 일정을 추가할 수 있다. 그 사이 저장분이 사라지면 안 된다.
    const remote: RemoteAdapter = {
      async pull() {
        db.saveSchedules([schedule('new', '2026-03-10T00:00:00Z', '동기화 중 추가')]);
        return { schedules: [], mails: [] };
      },
      async push() {},
    };
    const engine = new SyncEngine(remote);
    await engine.flush();
    expect(db.loadSchedules().map((s) => s.id)).toEqual(['new']);
  });

  it('원격에만 있는 일정을 로컬로 가져온다', async () => {
    db.saveSchedules([schedule('local', '2026-03-01T00:00:00Z', '로컬')]);
    const remote: RemoteAdapter = {
      async pull() {
        return { schedules: [schedule('remote', '2026-03-02T00:00:00Z', '원격')], mails: [] };
      },
      async push() {},
    };
    await new SyncEngine(remote).flush();
    expect(db.loadSchedules().map((s) => s.id).sort()).toEqual(['local', 'remote']);
  });

  it('동기화가 실패해도 로컬 데이터는 남는다', async () => {
    db.saveSchedules([schedule('local', '2026-03-01T00:00:00Z', '로컬')]);
    const remote: RemoteAdapter = {
      async pull() {
        throw new Error('network down');
      },
      async push() {},
    };
    const engine = new SyncEngine(remote);
    await engine.flush();
    expect(db.loadSchedules()).toHaveLength(1);
    expect(engine.pendingCount).toBe(0);
  });
});
