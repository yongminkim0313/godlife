import { computed, onScopeDispose, ref, watch } from 'vue';
import { defineStore } from 'pinia';
import type {
  InstitutionKind,
  MailImport,
  NotificationRecord,
  Occurrence,
  ParsedItem,
  Schedule,
  ScheduleStatus,
  Settings,
  WeatherCache,
} from '../types';
import { db } from '../lib/db';
import { SyncEngine } from '../lib/sync';
import { addDays, atTime, uid } from '../lib/date';
import { expandAll, upcoming } from '../lib/repeat';
import { buildNotifications, composeCopy, deliver, dueNotifications, makeSnooze } from '../lib/notifications';
import { fetchForecast } from '../lib/weather';
import { parseMail } from '../lib/mailParser';
import { buildSample } from '../lib/sample';

/** 알림이 울렸는데 아직 사용자가 처리하지 않은 항목. */
export interface InboxEntry {
  record: NotificationRecord;
  occurrence?: Occurrence;
  title: string;
  body: string;
}

const TICK_MS = 20_000;

export const useAppStore = defineStore('app', () => {
  const ready = ref(false);
  const schedules = ref<Schedule[]>([]);
  const mails = ref<MailImport[]>([]);
  const notifications = ref<NotificationRecord[]>([]);
  const settings = ref<Settings>(db.loadSettings());
  const weather = ref<WeatherCache | null>(null);
  const inbox = ref<InboxEntry[]>([]);
  const online = ref(navigator.onLine);
  const pendingSync = ref(0);
  const lastSyncedAt = ref<string | undefined>(undefined);

  const sync = new SyncEngine(undefined, (state) => {
    pendingSync.value = state.pendingCount;
    lastSyncedAt.value = state.lastSyncedAt;
  });

  /*
   * 저장은 액션 안에서 명시적으로 한다.
   * 감시자에 맡기면 저장 시점이 markDirty()보다 늦어질 수 있고, 그러면 동기화가
   * 아직 반영되지 않은 저장소를 읽어 방금 만든 변경을 덮어쓴다.
   */
  function commitSchedules(next: Schedule[]): void {
    schedules.value = next;
    db.saveSchedules(next);
    sync.markDirty();
  }

  function commitMails(next: MailImport[]): void {
    mails.value = next;
    db.saveMails(next);
    sync.markDirty();
  }

  function commitNotifications(next: NotificationRecord[]): void {
    notifications.value = next;
    db.saveNotifications(next);
  }

  function commitSettings(patch: Partial<Settings>): void {
    settings.value = { ...settings.value, ...patch };
    db.saveSettings(settings.value);
  }

  /* ---------------------------------------------------------------- */
  /* 조회                                                              */
  /* ---------------------------------------------------------------- */

  const visible = (occurrence: Occurrence) => settings.value.institutionFilter.includes(occurrence.schedule.institution);

  function occurrencesBetween(from: Date, to: Date): Occurrence[] {
    return expandAll(schedules.value, from, to).filter(visible);
  }

  function upcomingOccurrences(limit = 10): Occurrence[] {
    return upcoming(schedules.value, new Date(), 21, 200).filter(visible).slice(0, limit);
  }

  function findOccurrence(scheduleId: string, date: string): Occurrence | undefined {
    const schedule = schedules.value.find((s) => s.id === scheduleId);
    if (!schedule) return undefined;
    return expandAll([schedule], atTime(date, '00:00'), atTime(date, '23:59')).find((o) => o.date === date);
  }

  const pendingMails = computed(() => mails.value.filter((m) => m.reviewStatus === 'pending'));

  /* ---------------------------------------------------------------- */
  /* 일정                                                              */
  /* ---------------------------------------------------------------- */

  function createSchedule(input: Omit<Schedule, 'id' | 'updatedAt'>): Schedule {
    const schedule: Schedule = { ...input, id: uid('sch'), updatedAt: new Date().toISOString() };
    commitSchedules([...schedules.value, schedule]);
    return schedule;
  }

  function patchSchedule(id: string, patch: (schedule: Schedule) => Schedule): void {
    commitSchedules(schedules.value.map((s) => (s.id === id ? { ...patch(s), updatedAt: new Date().toISOString() } : s)));
  }

  function updateSchedule(id: string, patch: Partial<Schedule>): void {
    patchSchedule(id, (s) => ({ ...s, ...patch }));
  }

  function deleteSchedule(id: string): void {
    // 동기화 병합을 위해 tombstone으로 남긴다.
    patchSchedule(id, (s) => ({ ...s, deletedAt: new Date().toISOString() }));
  }

  function excludeOccurrence(id: string, date: string): void {
    patchSchedule(id, (s) => ({ ...s, excludedDates: [...new Set([...(s.excludedDates ?? []), date])] }));
  }

  function setOccurrenceStatus(scheduleId: string, date: string, status: ScheduleStatus): void {
    patchSchedule(scheduleId, (s) => ({
      ...s,
      status: s.repeatRule.freq === 'none' ? status : s.status,
      occurrenceStatus: { ...(s.occurrenceStatus ?? {}), [date]: status },
    }));
  }

  function togglePreparation(scheduleId: string, preparationId: string): void {
    patchSchedule(scheduleId, (s) => ({
      ...s,
      preparations: s.preparations.map((p) => (p.id === preparationId ? { ...p, checked: !p.checked } : p)),
    }));
  }

  /* ---------------------------------------------------------------- */
  /* 메일 · AI 검토                                                    */
  /* ---------------------------------------------------------------- */

  function importMail(subject: string, rawEmail: string, options?: { receivedAt?: string }): MailImport {
    const now = new Date().toISOString();
    // 계획표에 연도가 없을 때 수신 시각으로 연/월을 추정하므로, 메일의 실제 수신 시각을 넘긴다.
    const receivedAt = options?.receivedAt ?? now;
    const mail: MailImport = {
      id: uid('mail'),
      subject,
      receivedAt,
      rawEmail,
      parsedItems: parseMail(rawEmail, { receivedAt: new Date(receivedAt) }),
      reviewStatus: 'pending',
      createdAt: now,
      updatedAt: now,
    };
    commitMails([mail, ...mails.value]);
    return mail;
  }

  function updateMail(id: string, patch: Partial<MailImport>): void {
    commitMails(mails.value.map((m) => (m.id === id ? { ...m, ...patch, updatedAt: new Date().toISOString() } : m)));
  }

  function approveMail(id: string, items: ParsedItem[]): Schedule[] {
    const now = new Date().toISOString();
    const created = items
      .filter((item) => item.selected)
      .map<Schedule>((item) => {
        const start = item.time ? atTime(item.date, item.time) : atTime(item.date, '09:00');
        return {
          id: uid('sch'),
          title: item.title,
          institution: item.institution,
          startAt: start.toISOString(),
          endAt: new Date(start.getTime() + 60 * 60_000).toISOString(),
          isAllDay: !item.time,
          repeatRule: { freq: 'none' },
          sourceType: 'mail-ai',
          status: 'planned',
          preparations: item.preparations.map((text) => ({ id: uid('prep'), text, checked: false })),
          updatedAt: now,
        };
      });
    commitSchedules([...schedules.value, ...created]);
    commitMails(mails.value.map((m) => (m.id === id ? { ...m, parsedItems: items, reviewStatus: 'approved', updatedAt: now } : m)));
    return created;
  }

  function discardMail(id: string): void {
    updateMail(id, { reviewStatus: 'discarded' });
  }

  /* ---------------------------------------------------------------- */
  /* 설정 · 날씨                                                       */
  /* ---------------------------------------------------------------- */

  function updateSettings(patch: Partial<Settings>): void {
    commitSettings(patch);
  }

  function toggleInstitution(kind: InstitutionKind): void {
    const current = settings.value.institutionFilter;
    commitSettings({
      institutionFilter: current.includes(kind) ? current.filter((k) => k !== kind) : [...current, kind],
    });
  }

  async function refreshWeather(force = false): Promise<void> {
    if (!settings.value.weatherEnabled) return;
    weather.value = await fetchForecast(settings.value.region, { force });
  }

  /* ---------------------------------------------------------------- */
  /* 알림                                                              */
  /* ---------------------------------------------------------------- */

  function rebuildNotifications(): void {
    if (!ready.value) return;
    const now = new Date();
    const horizon = expandAll(schedules.value, addDays(now, -1), addDays(now, 30));
    commitNotifications(
      buildNotifications({ occurrences: horizon, settings: settings.value, existing: notifications.value, weather: weather.value, now }),
    );
  }

  function tick(): void {
    const now = new Date();
    const due = dueNotifications(notifications.value, now);
    if (due.length === 0) return;

    const fired = new Set(due.map((r) => r.id));
    const entries: InboxEntry[] = due.map((record) => {
      const occurrence = findOccurrence(record.scheduleId, record.date);
      const copy = composeCopy(record, occurrence);
      return { record: { ...record, firedAt: now.toISOString() }, occurrence, title: copy.title, body: copy.body };
    });
    // 이미 완료 체크한 일정이면 실천 확인 알림은 조용히 넘긴다.
    const live = entries.filter((e) => !(e.record.type === 'snooze' && e.occurrence?.status === 'done'));

    // OS 알림은 권한이 있을 때만 나간다. 실패해도 아래 인박스 카드로 항상 보인다.
    for (const entry of live) deliver({ title: entry.title, body: entry.body }, entry.record.id);

    commitNotifications(notifications.value.map((r) => (fired.has(r.id) ? { ...r, firedAt: now.toISOString() } : r)));
    if (live.length > 0) inbox.value = [...live, ...inbox.value].slice(0, 30);
  }

  function resolveInbox(recordId: string, result: 'done' | 'missed'): void {
    const entry = inbox.value.find((e) => e.record.id === recordId);
    if (entry?.occurrence) {
      setOccurrenceStatus(entry.occurrence.scheduleId, entry.occurrence.date, result === 'done' ? 'done' : 'missed');
    }
    // 미완료 -> 재알림 예약 (기획서 7)
    const snooze = entry && result === 'missed' ? makeSnooze(entry.record, settings.value) : null;
    const marked = notifications.value.map((r) => (r.id === recordId ? { ...r, resolved: true } : r));
    commitNotifications(snooze ? [...marked, snooze] : marked);
    inbox.value = inbox.value.filter((e) => e.record.id !== recordId);
  }

  /** 완료 여부를 묻지 않는 사전 알림을 닫기만 한다. */
  function dismissInbox(recordId: string): void {
    commitNotifications(notifications.value.map((r) => (r.id === recordId ? { ...r, resolved: true } : r)));
    inbox.value = inbox.value.filter((e) => e.record.id !== recordId);
  }

  /* ---------------------------------------------------------------- */
  /* 데이터 관리 · 초기화                                              */
  /* ---------------------------------------------------------------- */

  function loadSampleData(): void {
    const { schedules: sample, mail } = buildSample();
    commitSchedules(sample);
    commitMails([mail]);
  }

  function resetAll(): void {
    db.clearAll();
    schedules.value = [];
    mails.value = [];
    notifications.value = [];
    inbox.value = [];
    settings.value = db.loadSettings();
  }

  /*
   * onScopeDispose는 setup이 실행되는 동안에만 등록된다. init()은 컴포넌트가 마운트된
   * 뒤에 불리므로, 여기서 미리 정리 훅을 걸어두고 init()은 목록에만 추가한다.
   * 이렇게 하지 않으면 알림 타이머가 살아남아 알림이 중복으로 울린다.
   */
  const cleanups: (() => void)[] = [];
  onScopeDispose(() => {
    while (cleanups.length > 0) cleanups.pop()?.();
  });

  /** 앱 시작 시 한 번 호출. 로컬 캐시 복원 -> 알림 루프 -> 연결 감시 순으로 준비한다. */
  function init(): void {
    if (ready.value) return;
    schedules.value = db.loadSchedules();
    mails.value = db.loadMails();
    notifications.value = db.loadNotifications();
    weather.value = db.loadWeather();
    lastSyncedAt.value = db.loadSyncedAt();
    ready.value = true;

    rebuildNotifications();
    tick();
    const timer = window.setInterval(tick, TICK_MS);
    cleanups.push(() => window.clearInterval(timer));

    const update = () => {
      online.value = navigator.onLine;
      if (navigator.onLine) void refreshWeather();
    };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    cleanups.push(() => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    });
    cleanups.push(sync.watchConnectivity());

    void refreshWeather();
  }

  // 일정·설정·날씨가 바뀌면 알림 목록을 다시 만든다.
  watch([schedules, settings, weather], rebuildNotifications, { deep: true });

  return {
    ready,
    schedules,
    mails,
    notifications,
    settings,
    weather,
    inbox,
    online,
    pendingSync,
    lastSyncedAt,
    pendingMails,
    occurrencesBetween,
    upcomingOccurrences,
    findOccurrence,
    createSchedule,
    updateSchedule,
    deleteSchedule,
    excludeOccurrence,
    setOccurrenceStatus,
    togglePreparation,
    importMail,
    updateMail,
    approveMail,
    discardMail,
    updateSettings,
    toggleInstitution,
    refreshWeather,
    resolveInbox,
    dismissInbox,
    loadSampleData,
    resetAll,
    init,
  };
});
