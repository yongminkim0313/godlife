import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
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

/** 알림이 울렸는데 아직 사용자가 완료/미완료를 고르지 않은 항목. */
export interface InboxEntry {
  record: NotificationRecord;
  occurrence?: Occurrence;
  title: string;
  body: string;
}

interface AppState {
  ready: boolean;
  schedules: Schedule[];
  mails: MailImport[];
  notifications: NotificationRecord[];
  settings: Settings;
  weather: WeatherCache | null;
  inbox: InboxEntry[];
  online: boolean;
  pendingSync: number;
  lastSyncedAt?: string;
}

interface AppActions {
  createSchedule(input: Omit<Schedule, 'id' | 'updatedAt'>): Schedule;
  updateSchedule(id: string, patch: Partial<Schedule>): void;
  deleteSchedule(id: string): void;
  /** 반복 일정에서 특정 날짜 회차만 제외 */
  excludeOccurrence(id: string, date: string): void;
  setOccurrenceStatus(scheduleId: string, date: string, status: ScheduleStatus): void;
  togglePreparation(scheduleId: string, preparationId: string): void;
  importMail(subject: string, rawEmail: string): MailImport;
  updateMail(id: string, patch: Partial<MailImport>): void;
  approveMail(id: string, items: ParsedItem[]): Schedule[];
  discardMail(id: string): void;
  updateSettings(patch: Partial<Settings>): void;
  toggleInstitution(kind: InstitutionKind): void;
  refreshWeather(force?: boolean): Promise<void>;
  resolveInbox(recordId: string, result: 'done' | 'missed'): void;
  /** 완료 여부를 묻지 않는 사전 알림을 닫기만 한다. */
  dismissInbox(recordId: string): void;
  loadSampleData(): void;
  resetAll(): void;
}

interface AppContextValue extends AppState, AppActions {
  occurrencesBetween(from: Date, to: Date): Occurrence[];
  upcomingOccurrences(limit?: number): Occurrence[];
  findOccurrence(scheduleId: string, date: string): Occurrence | undefined;
}

const AppContext = createContext<AppContextValue | null>(null);

const TICK_MS = 20_000;

export function AppProvider({ children }: { children: ReactNode }) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [mails, setMails] = useState<MailImport[]>([]);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [settings, setSettings] = useState<Settings>(() => db.loadSettings());
  const [weather, setWeather] = useState<WeatherCache | null>(null);
  const [inbox, setInbox] = useState<InboxEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [pendingSync, setPendingSync] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | undefined>(undefined);

  // 상태 업데이터 안에서 부수효과를 내지 않으려고(StrictMode 이중 호출) 최신 인박스를 ref로 들고 있는다.
  const inboxRef = useRef<InboxEntry[]>([]);
  useEffect(() => {
    inboxRef.current = inbox;
  }, [inbox]);

  const sync = useRef<SyncEngine | null>(null);
  if (!sync.current) {
    sync.current = new SyncEngine(undefined, (state) => {
      setPendingSync(state.pendingCount);
      setLastSyncedAt(state.lastSyncedAt);
    });
  }

  // 최초 구동: 로컬 캐시에서 복원한다. 네트워크가 없어도 여기까지는 항상 성공한다.
  useEffect(() => {
    setSchedules(db.loadSchedules());
    setMails(db.loadMails());
    setNotifications(db.loadNotifications());
    setWeather(db.loadWeather());
    setLastSyncedAt(db.loadSyncedAt());
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) db.saveSchedules(schedules);
  }, [schedules, ready]);
  useEffect(() => {
    if (ready) db.saveMails(mails);
  }, [mails, ready]);
  useEffect(() => {
    if (ready) db.saveNotifications(notifications);
  }, [notifications, ready]);
  useEffect(() => {
    if (ready) db.saveSettings(settings);
  }, [settings, ready]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    const stop = sync.current!.watchConnectivity();
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      stop();
    };
  }, []);

  const markDirty = useCallback(() => sync.current?.markDirty(), []);

  const occurrencesBetween = useCallback(
    (from: Date, to: Date) => expandAll(schedules, from, to).filter((o) => settings.institutionFilter.includes(o.schedule.institution)),
    [schedules, settings.institutionFilter],
  );

  const upcomingOccurrences = useCallback(
    (limit = 10) => upcoming(schedules, new Date(), 21, 200).filter((o) => settings.institutionFilter.includes(o.schedule.institution)).slice(0, limit),
    [schedules, settings.institutionFilter],
  );

  const findOccurrence = useCallback(
    (scheduleId: string, date: string) => {
      const schedule = schedules.find((s) => s.id === scheduleId);
      if (!schedule) return undefined;
      return expandAll([schedule], atTime(date, '00:00'), atTime(date, '23:59')).find((o) => o.date === date);
    },
    [schedules],
  );

  // 일정/설정/날씨가 바뀌면 알림 목록을 다시 만든다.
  useEffect(() => {
    if (!ready) return;
    const now = new Date();
    const horizon = expandAll(schedules, addDays(now, -1), addDays(now, 30));
    setNotifications((prev) => buildNotifications({ occurrences: horizon, settings, existing: prev, weather, now }));
  }, [schedules, settings, weather, ready]);

  // 알림 발화 루프.
  useEffect(() => {
    if (!ready) return;
    const tick = () => {
      const now = new Date();
      const due = dueNotifications(notifications, now);
      if (due.length === 0) return;
      const firedIds = new Set(due.map((r) => r.id));
      const entries: InboxEntry[] = due.map((record) => {
        const occurrence = findOccurrence(record.scheduleId, record.date);
        // 이미 완료 체크한 일정이면 실천 확인 알림은 조용히 넘긴다.
        const copy = composeCopy(record, occurrence);
        return {
          record: { ...record, firedAt: now.toISOString() },
          occurrence,
          title: copy.title,
          body: copy.body,
        };
      });

      const live = entries.filter((e) => !(e.record.type === 'snooze' && e.occurrence?.status === 'done'));
      // OS 알림은 권한이 있을 때만 나간다. 실패해도 아래 인박스 카드로 항상 보인다.
      for (const entry of live) deliver({ title: entry.title, body: entry.body }, entry.record.id);

      setNotifications((prev) => prev.map((r) => (firedIds.has(r.id) ? { ...r, firedAt: now.toISOString() } : r)));
      if (live.length > 0) setInbox((prev) => [...live, ...prev].slice(0, 30));
    };
    tick();
    const timer = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(timer);
  }, [notifications, ready, findOccurrence]);

  // 날씨 갱신: 지역이 바뀌거나 온라인이 되면.
  const refreshWeather = useCallback(
    async (force = false) => {
      if (!settings.weatherEnabled) return;
      const next = await fetchForecast(settings.region, { force });
      setWeather(next);
    },
    [settings.region, settings.weatherEnabled],
  );

  useEffect(() => {
    if (!ready) return;
    void refreshWeather();
  }, [ready, refreshWeather, online]);

  const actions: AppActions = useMemo(
    () => ({
      createSchedule(input) {
        const schedule: Schedule = { ...input, id: uid('sch'), updatedAt: new Date().toISOString() };
        setSchedules((prev) => [...prev, schedule]);
        markDirty();
        return schedule;
      },
      updateSchedule(id, patch) {
        setSchedules((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch, updatedAt: new Date().toISOString() } : s)));
        markDirty();
      },
      deleteSchedule(id) {
        // 동기화 병합을 위해 tombstone으로 남긴다.
        setSchedules((prev) => prev.map((s) => (s.id === id ? { ...s, deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() } : s)));
        markDirty();
      },
      excludeOccurrence(id, date) {
        setSchedules((prev) =>
          prev.map((s) =>
            s.id === id ? { ...s, excludedDates: [...new Set([...(s.excludedDates ?? []), date])], updatedAt: new Date().toISOString() } : s,
          ),
        );
        markDirty();
      },
      setOccurrenceStatus(scheduleId, date, status) {
        setSchedules((prev) =>
          prev.map((s) =>
            s.id === scheduleId
              ? {
                  ...s,
                  status: s.repeatRule.freq === 'none' ? status : s.status,
                  occurrenceStatus: { ...(s.occurrenceStatus ?? {}), [date]: status },
                  updatedAt: new Date().toISOString(),
                }
              : s,
          ),
        );
        markDirty();
      },
      togglePreparation(scheduleId, preparationId) {
        setSchedules((prev) =>
          prev.map((s) =>
            s.id === scheduleId
              ? {
                  ...s,
                  preparations: s.preparations.map((p) => (p.id === preparationId ? { ...p, checked: !p.checked } : p)),
                  updatedAt: new Date().toISOString(),
                }
              : s,
          ),
        );
        markDirty();
      },
      importMail(subject, rawEmail) {
        const now = new Date().toISOString();
        const mail: MailImport = {
          id: uid('mail'),
          subject,
          receivedAt: now,
          rawEmail,
          parsedItems: parseMail(rawEmail, { receivedAt: new Date() }),
          reviewStatus: 'pending',
          createdAt: now,
          updatedAt: now,
        };
        setMails((prev) => [mail, ...prev]);
        markDirty();
        return mail;
      },
      updateMail(id, patch) {
        setMails((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch, updatedAt: new Date().toISOString() } : m)));
        markDirty();
      },
      approveMail(id, items) {
        const now = new Date().toISOString();
        const created = items
          .filter((item) => item.selected)
          .map<Schedule>((item) => {
            const start = item.time ? atTime(item.date, item.time) : atTime(item.date, '09:00');
            const end = new Date(start.getTime() + 60 * 60_000);
            return {
              id: uid('sch'),
              title: item.title,
              institution: item.institution,
              startAt: start.toISOString(),
              endAt: end.toISOString(),
              isAllDay: !item.time,
              repeatRule: { freq: 'none' },
              sourceType: 'mail-ai',
              status: 'planned',
              preparations: item.preparations.map((text) => ({ id: uid('prep'), text, checked: false })),
              updatedAt: now,
            };
          });
        setSchedules((prev) => [...prev, ...created]);
        setMails((prev) =>
          prev.map((m) => (m.id === id ? { ...m, parsedItems: items, reviewStatus: 'approved', updatedAt: now } : m)),
        );
        markDirty();
        return created;
      },
      discardMail(id) {
        setMails((prev) => prev.map((m) => (m.id === id ? { ...m, reviewStatus: 'discarded', updatedAt: new Date().toISOString() } : m)));
        markDirty();
      },
      updateSettings(patch) {
        setSettings((prev) => ({ ...prev, ...patch }));
      },
      toggleInstitution(kind) {
        setSettings((prev) => {
          const has = prev.institutionFilter.includes(kind);
          const next = has ? prev.institutionFilter.filter((k) => k !== kind) : [...prev.institutionFilter, kind];
          return { ...prev, institutionFilter: next };
        });
      },
      refreshWeather,
      resolveInbox(recordId, result) {
        const entry = inboxRef.current.find((e) => e.record.id === recordId);
        const status: ScheduleStatus = result === 'done' ? 'done' : 'missed';
        if (entry?.occurrence) {
          const { scheduleId, date } = entry.occurrence;
          setSchedules((list) =>
            list.map((s) =>
              s.id === scheduleId
                ? {
                    ...s,
                    status: s.repeatRule.freq === 'none' ? status : s.status,
                    occurrenceStatus: { ...(s.occurrenceStatus ?? {}), [date]: status },
                    updatedAt: new Date().toISOString(),
                  }
                : s,
            ),
          );
          markDirty();
        }
        // 미완료 -> 재알림 예약 (기획서 7)
        const snooze = entry && result === 'missed' ? makeSnooze(entry.record, settings) : null;
        setNotifications((list) => {
          const marked = list.map((r) => (r.id === recordId ? { ...r, resolved: true } : r));
          return snooze ? [...marked, snooze] : marked;
        });
        setInbox((prev) => prev.filter((e) => e.record.id !== recordId));
      },
      dismissInbox(recordId) {
        setInbox((prev) => prev.filter((e) => e.record.id !== recordId));
        setNotifications((list) => list.map((r) => (r.id === recordId ? { ...r, resolved: true } : r)));
      },
      loadSampleData() {
        const { schedules: sample, mail } = buildSample();
        setSchedules(sample);
        setMails([mail]);
        markDirty();
      },
      resetAll() {
        db.clearAll();
        setSchedules([]);
        setMails([]);
        setNotifications([]);
        setInbox([]);
        setSettings(db.loadSettings());
      },
    }),
    [markDirty, refreshWeather, settings],
  );

  const value: AppContextValue = {
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
    occurrencesBetween,
    upcomingOccurrences,
    findOccurrence,
    ...actions,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('AppProvider 안에서만 useApp을 쓸 수 있습니다.');
  return ctx;
}

/** 데모용 시드 데이터. 설정 화면에서 수동으로 불러온다. */
function buildSample(): { schedules: Schedule[]; mail: MailImport } {
  const now = new Date();
  const today = new Date(now);
  const iso = (d: Date, h: number, m: number) => {
    const x = new Date(d);
    x.setHours(h, m, 0, 0);
    return x.toISOString();
  };
  const stamp = now.toISOString();

  const schedules: Schedule[] = [
    {
      id: uid('sch'),
      title: '어린이집 등원',
      institution: 'daycare',
      startAt: iso(today, 9, 0),
      endAt: iso(today, 9, 30),
      isAllDay: false,
      repeatRule: { freq: 'weekly', weekdays: [1, 2, 3, 4, 5] },
      sourceType: 'manual',
      status: 'planned',
      preparations: [{ id: uid('prep'), text: '물통', checked: false }],
      updatedAt: stamp,
    },
    {
      id: uid('sch'),
      title: '숲 체험 소풍',
      institution: 'kindergarten',
      startAt: iso(addDays(today, 2), 10, 0),
      endAt: iso(addDays(today, 2), 14, 0),
      isAllDay: false,
      repeatRule: { freq: 'none' },
      sourceType: 'mail-ai',
      status: 'planned',
      preparations: [
        { id: uid('prep'), text: '도시락', checked: false },
        { id: uid('prep'), text: '돗자리', checked: false },
        { id: uid('prep'), text: '여벌 옷', checked: false },
      ],
      memo: '우천 시 실내 활동으로 대체',
      updatedAt: stamp,
    },
    {
      id: uid('sch'),
      title: '가정 학습지 하기',
      institution: 'home',
      startAt: iso(today, 19, 30),
      endAt: iso(today, 20, 0),
      isAllDay: false,
      repeatRule: { freq: 'weekly', weekdays: [1, 3, 5] },
      sourceType: 'manual',
      status: 'planned',
      preparations: [],
      updatedAt: stamp,
    },
  ];

  const mail: MailImport = {
    id: uid('mail'),
    subject: `${now.getMonth() + 1}월 유치원 월간 교육계획표 안내`,
    receivedAt: stamp,
    rawEmail: SAMPLE_MAIL(now),
    parsedItems: parseMail(SAMPLE_MAIL(now), { receivedAt: now }),
    reviewStatus: 'pending',
    createdAt: stamp,
    updatedAt: stamp,
  };

  return { schedules, mail };
}

export const SAMPLE_MAIL = (base: Date): string => {
  const y = base.getFullYear();
  const m = base.getMonth() + 1;
  const day = (offset: number) => {
    const d = addDays(base, offset);
    return { m: d.getMonth() + 1, d: d.getDate(), w: ['일', '월', '화', '수', '목', '금', '토'][d.getDay()] };
  };
  const a = day(1);
  const b = day(3);
  const c = day(6);
  const e = day(10);
  return [
    `${y}년 ${m}월 유치원 월간 교육계획표`,
    '안녕하세요, 한 달 일정 안내드립니다.',
    '',
    `${a.m}월 ${a.d}일(${a.w}) 10:00 텃밭 가꾸기 - 준비물: 장화, 모자`,
    `${b.m}월 ${b.d}일(${b.w}) 09:30 소방 대피 훈련`,
    `${c.m}월 ${c.d}일(${c.w}) 오전 10시 봄 소풍 / 준비물: 도시락, 물통, 돗자리`,
    `${e.m}월 ${e.d}일(${e.w}) 생일 파티 (흰색 상의 준비해 주세요)`,
    '',
    '감사합니다. 원장 올림',
  ].join('\n');
};
