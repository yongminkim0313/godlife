import { describe, expect, it } from 'vitest';
import { buildNotifications, composeCopy, dueNotifications, makeSnooze } from '../lib/notifications';
import { DEFAULT_SETTINGS } from '../lib/db';
import { expandSchedule } from '../lib/repeat';
import { atTime } from '../lib/date';
import type { NotificationRecord, Schedule, Settings, WeatherCache } from '../types';

const NOW = atTime('2026-03-02', '08:00');

function makeSchedule(patch: Partial<Schedule> = {}): Schedule {
  return {
    id: 'sch1',
    title: '봄 소풍',
    institution: 'kindergarten',
    startAt: atTime('2026-03-02', '10:00').toISOString(),
    endAt: atTime('2026-03-02', '12:00').toISOString(),
    isAllDay: false,
    repeatRule: { freq: 'none' },
    sourceType: 'manual',
    status: 'planned',
    preparations: [{ id: 'p1', text: '도시락', checked: false }],
    updatedAt: NOW.toISOString(),
    ...patch,
  };
}

function occurrencesOf(schedule: Schedule) {
  return expandSchedule(schedule, atTime('2026-03-01', '00:00'), atTime('2026-03-03', '23:59'));
}

const settings: Settings = { ...DEFAULT_SETTINGS, defaultOffsets: [5, 10, 1440] };

describe('buildNotifications', () => {
  it('오프셋마다 알림을 만들고 실천 확인 알림을 덧붙인다', () => {
    const schedule = makeSchedule();
    const records = buildNotifications({ occurrences: occurrencesOf(schedule), settings, existing: [], now: NOW });
    expect(records.map((r) => r.offset)).toEqual([1440, 10, 5, 0]);
    expect(records.find((r) => r.offset === 5)?.fireAt).toBe(atTime('2026-03-02', '09:55').toISOString());
    expect(records.find((r) => r.offset === 1440)?.fireAt).toBe(atTime('2026-03-01', '10:00').toISOString());
  });

  it('하루 전 알림은 준비물 알림을 겸한다', () => {
    const records = buildNotifications({ occurrences: occurrencesOf(makeSchedule()), settings, existing: [], now: NOW });
    expect(records.find((r) => r.offset === 1440)?.type).toBe('preparation');
    expect(records.find((r) => r.offset === 10)?.type).toBe('normal');
  });

  it('준비물이 없으면 하루 전 알림도 일반 알림이다', () => {
    const schedule = makeSchedule({ preparations: [] });
    const records = buildNotifications({ occurrences: occurrencesOf(schedule), settings, existing: [], now: NOW });
    expect(records.find((r) => r.offset === 1440)?.type).toBe('normal');
  });

  it('일정에 지정된 오프셋이 기본 설정을 덮어쓴다', () => {
    const schedule = makeSchedule({ notificationOffsets: [30] });
    const records = buildNotifications({ occurrences: occurrencesOf(schedule), settings, existing: [], now: NOW });
    expect(records.filter((r) => r.offset > 0).map((r) => r.offset)).toEqual([30]);
  });

  it('완료된 회차에는 알림을 만들지 않는다', () => {
    const schedule = makeSchedule({ status: 'done' });
    const records = buildNotifications({ occurrences: occurrencesOf(schedule), settings, existing: [], now: NOW });
    expect(records).toHaveLength(0);
  });

  it('다시 계산해도 발화 이력과 스누즈 횟수가 유지된다', () => {
    const schedule = makeSchedule();
    const first = buildNotifications({ occurrences: occurrencesOf(schedule), settings, existing: [], now: NOW });
    const fired = first.map((r) => (r.offset === 10 ? { ...r, firedAt: NOW.toISOString(), snoozeCount: 2 } : r));
    const second = buildNotifications({ occurrences: occurrencesOf(schedule), settings, existing: fired, now: NOW });
    const target = second.find((r) => r.offset === 10)!;
    expect(target.firedAt).toBe(NOW.toISOString());
    expect(target.snoozeCount).toBe(2);
    expect(target.id).toBe(first.find((r) => r.offset === 10)!.id);
  });

  it('비/눈 예보가 있으면 하루 전 알림에 우천 표시를 붙인다', () => {
    const weather: WeatherCache = {
      region: DEFAULT_SETTINGS.region,
      cachedAt: NOW.toISOString(),
      forecast: [{ date: '2026-03-02', code: 61, tempMin: 5, tempMax: 12, precipProbability: 80 }],
    };
    const records = buildNotifications({ occurrences: occurrencesOf(makeSchedule()), settings, existing: [], weather, now: NOW });
    expect(records.find((r) => r.offset === 1440)?.weatherAlert).toBe(true);
    expect(records.find((r) => r.offset === 5)?.weatherAlert).toBeUndefined();
  });

  it('매주 반복 일정은 회차마다 알림이 생긴다', () => {
    const schedule = makeSchedule({ repeatRule: { freq: 'weekly', weekdays: [1, 2] } });
    const records = buildNotifications({ occurrences: occurrencesOf(schedule), settings, existing: [], now: NOW });
    expect(new Set(records.map((r) => r.date))).toEqual(new Set(['2026-03-02', '2026-03-03']));
  });
});

describe('dueNotifications', () => {
  it('발화 시각이 지났고 아직 안 울린 것만 고른다', () => {
    const base: NotificationRecord = {
      id: 'n1',
      scheduleId: 'sch1',
      date: '2026-03-02',
      offset: 10,
      type: 'normal',
      fireAt: atTime('2026-03-02', '09:50').toISOString(),
      snoozeCount: 0,
      resolved: false,
    };
    const records: NotificationRecord[] = [
      base,
      { ...base, id: 'n2', fireAt: atTime('2026-03-02', '11:00').toISOString() },
      { ...base, id: 'n3', firedAt: NOW.toISOString() },
      { ...base, id: 'n4', resolved: true },
    ];
    expect(dueNotifications(records, atTime('2026-03-02', '10:00')).map((r) => r.id)).toEqual(['n1']);
  });
});

describe('makeSnooze', () => {
  const record: NotificationRecord = {
    id: 'n1',
    scheduleId: 'sch1',
    date: '2026-03-02',
    offset: 0,
    type: 'snooze',
    fireAt: NOW.toISOString(),
    snoozeCount: 0,
    resolved: false,
  };

  it('설정한 간격 뒤에 재알림을 만든다', () => {
    const snooze = makeSnooze(record, { ...settings, snoozeMinutes: 15 }, NOW)!;
    expect(snooze.fireAt).toBe(atTime('2026-03-02', '08:15').toISOString());
    expect(snooze.snoozeCount).toBe(1);
    expect(snooze.type).toBe('snooze');
  });

  it('최대 횟수를 넘으면 더 만들지 않는다', () => {
    expect(makeSnooze({ ...record, snoozeCount: 3 }, { ...settings, maxSnooze: 3 }, NOW)).toBeNull();
  });
});

describe('composeCopy', () => {
  const occurrence = occurrencesOf(makeSchedule())[0];

  it('준비물 알림은 준비물을 본문에 넣는다', () => {
    const copy = composeCopy(
      { id: 'n', scheduleId: 'sch1', date: '2026-03-02', offset: 1440, type: 'preparation', fireAt: '', snoozeCount: 0, resolved: false },
      occurrence,
    );
    expect(copy.title).toContain('내일');
    expect(copy.body).toContain('도시락');
  });

  it('우천 알림이면 안내 문구를 덧붙인다', () => {
    const copy = composeCopy(
      {
        id: 'n',
        scheduleId: 'sch1',
        date: '2026-03-02',
        offset: 1440,
        type: 'preparation',
        fireAt: '',
        snoozeCount: 0,
        resolved: false,
        weatherAlert: true,
      },
      occurrence,
    );
    expect(copy.body).toContain('비/눈');
  });

  it('재알림은 실천 여부를 묻는다', () => {
    const copy = composeCopy(
      { id: 'n', scheduleId: 'sch1', date: '2026-03-02', offset: 0, type: 'snooze', fireAt: '', snoozeCount: 1, resolved: false },
      occurrence,
    );
    expect(copy.title).toContain('실천');
    expect(copy.body).toContain('1번째');
  });

  it('일반 알림은 몇 분 전인지 알려준다', () => {
    const copy = composeCopy(
      { id: 'n', scheduleId: 'sch1', date: '2026-03-02', offset: 5, type: 'normal', fireAt: '', snoozeCount: 0, resolved: false },
      occurrence,
    );
    expect(copy.title).toContain('5분 전');
  });
});
