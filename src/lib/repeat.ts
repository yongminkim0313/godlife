import type { Occurrence, Schedule, ScheduleStatus } from '../types';
import { addDays, fromDateKey, toDateKey } from './date';

/** 반복 규칙을 펼쳐 [from, to] 구간에 실제로 열리는 회차를 만든다. */
export function expandSchedule(schedule: Schedule, from: Date, to: Date): Occurrence[] {
  if (schedule.deletedAt) return [];

  const start = new Date(schedule.startAt);
  const durationMs = new Date(schedule.endAt).getTime() - start.getTime();
  const excluded = new Set(schedule.excludedDates ?? []);
  const out: Occurrence[] = [];

  const push = (dateKey: string) => {
    if (excluded.has(dateKey)) return;
    const day = fromDateKey(dateKey);
    const startAt = new Date(day);
    startAt.setHours(start.getHours(), start.getMinutes(), 0, 0);
    const endAt = new Date(startAt.getTime() + Math.max(durationMs, 0));
    out.push({
      key: `${schedule.id}@${dateKey}`,
      scheduleId: schedule.id,
      date: dateKey,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      schedule,
      status: occurrenceStatus(schedule, dateKey),
    });
  };

  if (schedule.repeatRule.freq === 'none') {
    const key = toDateKey(start);
    if (start >= dayStart(from) && start <= dayEnd(to)) push(key);
    return out;
  }

  const { weekdays, until } = schedule.repeatRule;
  if (weekdays.length === 0) return out;
  const untilDate = until ? dayEnd(fromDateKey(until)) : null;

  // 일정 시작일 이전에는 회차가 생기지 않는다.
  let cursor = dayStart(from < start ? start : from);
  const limit = dayEnd(to);
  while (cursor <= limit) {
    if (untilDate && cursor > untilDate) break;
    if (weekdays.includes(cursor.getDay())) push(toDateKey(cursor));
    cursor = addDays(cursor, 1);
  }
  return out;
}

export function occurrenceStatus(schedule: Schedule, dateKey: string): ScheduleStatus {
  return schedule.occurrenceStatus?.[dateKey] ?? (schedule.repeatRule.freq === 'none' ? schedule.status : 'planned');
}

export function expandAll(schedules: Schedule[], from: Date, to: Date): Occurrence[] {
  return schedules
    .flatMap((s) => expandSchedule(s, from, to))
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
}

/** 지금 이후로 가장 가까운 회차들. 홈/위젯이 쓴다. */
export function upcoming(schedules: Schedule[], now: Date, days = 14, limit = 20): Occurrence[] {
  return expandAll(schedules, now, addDays(now, days))
    .filter((o) => new Date(o.endAt).getTime() >= now.getTime() && o.status !== 'done')
    .slice(0, limit);
}

export function repeatLabel(rule: Schedule['repeatRule']): string {
  if (rule.freq === 'none') return '반복 없음';
  const labels = ['일', '월', '화', '수', '목', '금', '토'];
  const days = [...rule.weekdays].sort((a, b) => a - b).map((d) => labels[d]).join('·');
  return `매주 ${days}${rule.until ? ` (~${rule.until})` : ''}`;
}

function dayStart(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function dayEnd(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
