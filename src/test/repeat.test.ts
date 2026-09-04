import { describe, expect, it } from 'vitest';
import { expandSchedule, repeatLabel } from '../lib/repeat';
import type { Schedule } from '../types';
import { atTime, toDateKey } from '../lib/date';

function makeSchedule(patch: Partial<Schedule> = {}): Schedule {
  return {
    id: 'sch1',
    title: '등원',
    institution: 'daycare',
    startAt: atTime('2026-03-02', '09:00').toISOString(), // 월요일
    endAt: atTime('2026-03-02', '09:30').toISOString(),
    isAllDay: false,
    repeatRule: { freq: 'none' },
    sourceType: 'manual',
    status: 'planned',
    preparations: [],
    updatedAt: new Date().toISOString(),
    ...patch,
  };
}

describe('expandSchedule', () => {
  it('반복 없는 일정은 해당 날짜에만 1회 나온다', () => {
    const out = expandSchedule(makeSchedule(), atTime('2026-03-01', '00:00'), atTime('2026-03-31', '23:59'));
    expect(out).toHaveLength(1);
    expect(out[0].date).toBe('2026-03-02');
  });

  it('구간 밖의 단일 일정은 나오지 않는다', () => {
    const out = expandSchedule(makeSchedule(), atTime('2026-04-01', '00:00'), atTime('2026-04-30', '23:59'));
    expect(out).toHaveLength(0);
  });

  it('매주 반복은 지정 요일마다 회차를 만든다', () => {
    const schedule = makeSchedule({ repeatRule: { freq: 'weekly', weekdays: [1, 3] } });
    const out = expandSchedule(schedule, atTime('2026-03-01', '00:00'), atTime('2026-03-14', '23:59'));
    expect(out.map((o) => o.date)).toEqual(['2026-03-02', '2026-03-04', '2026-03-09', '2026-03-11']);
  });

  it('시작일 이전에는 회차가 생기지 않는다', () => {
    const schedule = makeSchedule({ repeatRule: { freq: 'weekly', weekdays: [1] } });
    const out = expandSchedule(schedule, atTime('2026-02-01', '00:00'), atTime('2026-03-09', '23:59'));
    expect(out.map((o) => o.date)).toEqual(['2026-03-02', '2026-03-09']);
  });

  it('반복 종료일 이후에는 멈춘다', () => {
    const schedule = makeSchedule({ repeatRule: { freq: 'weekly', weekdays: [1], until: '2026-03-09' } });
    const out = expandSchedule(schedule, atTime('2026-03-01', '00:00'), atTime('2026-03-31', '23:59'));
    expect(out.map((o) => o.date)).toEqual(['2026-03-02', '2026-03-09']);
  });

  it('제외된 날짜는 건너뛴다', () => {
    const schedule = makeSchedule({ repeatRule: { freq: 'weekly', weekdays: [1] }, excludedDates: ['2026-03-09'] });
    const out = expandSchedule(schedule, atTime('2026-03-01', '00:00'), atTime('2026-03-16', '23:59'));
    expect(out.map((o) => o.date)).toEqual(['2026-03-02', '2026-03-16']);
  });

  it('회차별 상태와 시간대가 유지된다', () => {
    const schedule = makeSchedule({
      repeatRule: { freq: 'weekly', weekdays: [1] },
      occurrenceStatus: { '2026-03-09': 'done' },
    });
    const out = expandSchedule(schedule, atTime('2026-03-01', '00:00'), atTime('2026-03-16', '23:59'));
    expect(out.map((o) => o.status)).toEqual(['planned', 'done', 'planned']);
    expect(toDateKey(new Date(out[1].startAt))).toBe('2026-03-09');
    expect(new Date(out[1].startAt).getHours()).toBe(9);
    expect(new Date(out[1].endAt).getTime() - new Date(out[1].startAt).getTime()).toBe(30 * 60_000);
  });

  it('삭제된 일정은 펼쳐지지 않는다', () => {
    const schedule = makeSchedule({ deletedAt: new Date().toISOString() });
    expect(expandSchedule(schedule, atTime('2026-03-01', '00:00'), atTime('2026-03-31', '23:59'))).toHaveLength(0);
  });
});

describe('repeatLabel', () => {
  it('요일을 정렬해 보여준다', () => {
    expect(repeatLabel({ freq: 'weekly', weekdays: [3, 1] })).toBe('매주 월·수');
    expect(repeatLabel({ freq: 'none' })).toBe('반복 없음');
  });
});
