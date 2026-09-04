import type { NotificationRecord, Occurrence, Settings, WeatherCache } from '../types';
import { addMinutes, offsetLabel, toTimeLabel, uid } from './date';
import { forecastFor, isWetForecast } from './weather';

/**
 * 알림 생성·발화 (기획서 핵심요구 3·7, 추가기능 3.4).
 *
 * - 5분/10분/하루 전 다중 알림
 * - 하루 전 알림에는 준비물 메모를 붙인다
 * - 일정이 끝났는데 완료 체크가 없으면 실천 확인 알림 -> 미완료면 스누즈
 */

export const OFFSET_CHOICES = [5, 10, 30, 60, 1440] as const;

/** 같은 회차/오프셋/타입이면 같은 알림. 재계산해도 firedAt·snoozeCount를 잃지 않게 하는 키. */
function recordKey(r: Pick<NotificationRecord, 'scheduleId' | 'date' | 'offset' | 'type'>): string {
  return `${r.scheduleId}|${r.date}|${r.offset}|${r.type}`;
}

export interface BuildInput {
  occurrences: Occurrence[];
  settings: Settings;
  existing: NotificationRecord[];
  weather?: WeatherCache | null;
  now?: Date;
}

/** 다가오는 회차들로부터 알림 목록을 다시 만든다. 기존 발화 이력은 유지된다. */
export function buildNotifications({ occurrences, settings, existing, weather, now = new Date() }: BuildInput): NotificationRecord[] {
  const previous = new Map(existing.map((r) => [recordKey(r), r]));
  const out: NotificationRecord[] = [];

  // 사용자가 직접 만든 스누즈 알림은 회차 재계산과 무관하게 살려둔다.
  for (const record of existing) {
    if (record.type === 'snooze' && record.offset === -1 && !record.resolved) out.push(record);
  }

  for (const occurrence of occurrences) {
    if (occurrence.status === 'done') continue;
    const start = new Date(occurrence.startAt);
    const offsets = occurrence.schedule.notificationOffsets ?? settings.defaultOffsets;

    for (const offset of [...new Set(offsets)].sort((a, b) => b - a)) {
      const fireAt = addMinutes(start, -offset);
      const hasPreparations = occurrence.schedule.preparations.length > 0;
      // 하루 전 알림은 준비물 알림을 겸한다(3.4).
      const type: NotificationRecord['type'] =
        offset >= 1440 && hasPreparations && settings.preparationReminder ? 'preparation' : 'normal';
      const key = recordKey({ scheduleId: occurrence.scheduleId, date: occurrence.date, offset, type });
      const prior = previous.get(key);
      const wet = settings.weatherEnabled && isWetOccurrence(occurrence, weather);
      out.push({
        id: prior?.id ?? uid('noti'),
        scheduleId: occurrence.scheduleId,
        date: occurrence.date,
        offset,
        type,
        fireAt: fireAt.toISOString(),
        firedAt: prior?.firedAt,
        snoozeCount: prior?.snoozeCount ?? 0,
        resolved: prior?.resolved ?? false,
        weatherAlert: wet && offset >= 1440 ? true : undefined,
      });
    }

    // 일정 종료 후 실천 확인 -> 미완료면 재알림(7).
    const followUpKey = recordKey({ scheduleId: occurrence.scheduleId, date: occurrence.date, offset: 0, type: 'snooze' });
    const priorFollowUp = previous.get(followUpKey);
    out.push({
      id: priorFollowUp?.id ?? uid('noti'),
      scheduleId: occurrence.scheduleId,
      date: occurrence.date,
      offset: 0,
      type: 'snooze',
      fireAt: occurrence.endAt,
      firedAt: priorFollowUp?.firedAt,
      snoozeCount: priorFollowUp?.snoozeCount ?? 0,
      resolved: priorFollowUp?.resolved ?? false,
    });
  }

  // 아주 오래된 이력은 버린다 (7일 전까지만 보관).
  const cutoff = addMinutes(now, -7 * 24 * 60).toISOString();
  return out.filter((r) => r.fireAt >= cutoff || !r.firedAt);
}

function isWetOccurrence(occurrence: Occurrence, weather?: WeatherCache | null): boolean {
  const forecast = forecastFor(weather ?? null, occurrence.date);
  return forecast ? isWetForecast(forecast) : false;
}

export function dueNotifications(records: NotificationRecord[], now = new Date()): NotificationRecord[] {
  const iso = now.toISOString();
  return records.filter((r) => !r.firedAt && !r.resolved && r.fireAt <= iso);
}

/** 재알림 레코드 생성. offset -1은 "스누즈로 새로 만든 알림"이라는 표시. */
export function makeSnooze(record: NotificationRecord, settings: Settings, now = new Date()): NotificationRecord | null {
  if (record.snoozeCount >= settings.maxSnooze) return null;
  return {
    id: uid('noti'),
    scheduleId: record.scheduleId,
    date: record.date,
    offset: -1,
    type: 'snooze',
    fireAt: addMinutes(now, settings.snoozeMinutes).toISOString(),
    snoozeCount: record.snoozeCount + 1,
    resolved: false,
  };
}

export interface NotificationCopy {
  title: string;
  body: string;
}

export function composeCopy(record: NotificationRecord, occurrence: Occurrence | undefined): NotificationCopy {
  const title = occurrence?.schedule.title ?? '일정';
  const timeLabel = occurrence ? toTimeLabel(occurrence.startAt) : '';
  const preparations = occurrence?.schedule.preparations.map((p) => p.text) ?? [];

  if (record.type === 'preparation') {
    const prep = preparations.length > 0 ? `준비물: ${preparations.join(', ')}` : '준비물을 확인해 주세요.';
    const weather = record.weatherAlert ? '\n☔ 비/눈 예보가 있어요. 우비·장화도 챙겨 주세요.' : '';
    return { title: `내일 ${timeLabel} ${title}`, body: `${prep}${weather}` };
  }
  if (record.type === 'snooze') {
    return {
      title: `${title} 실천하셨나요?`,
      body: record.snoozeCount > 0 ? `${record.snoozeCount}번째 재알림입니다.` : '완료 여부를 체크해 주세요.',
    };
  }
  const weather = record.weatherAlert ? ' ☔' : '';
  return { title: `${offsetLabel(record.offset)} · ${title}${weather}`, body: `${timeLabel} 시작` };
}

export async function ensurePermission(): Promise<NotificationPermission> {
  if (typeof Notification === 'undefined') return 'denied';
  if (Notification.permission !== 'default') return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

/** OS 알림을 띄운다. 권한이 없으면 false를 돌려주고 앱 내 알림 카드로 대체한다. */
export function deliver(copy: NotificationCopy, tag: string): boolean {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
  try {
    new Notification(copy.title, { body: copy.body, tag, icon: `${import.meta.env.BASE_URL}icon.svg` });
    return true;
  } catch {
    return false;
  }
}
