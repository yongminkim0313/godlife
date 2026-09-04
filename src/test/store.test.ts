import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAppStore } from '../stores/app';
import { db } from '../lib/db';
import { atTime, toDateKey } from '../lib/date';
import type { ParsedItem, Schedule } from '../types';

function newStore() {
  const pinia = createPinia();
  setActivePinia(pinia);
  return { store: useAppStore(), pinia };
}

const baseSchedule: Omit<Schedule, 'id' | 'updatedAt'> = {
  title: '봄 소풍',
  institution: 'kindergarten',
  startAt: atTime(toDateKey(new Date()), '10:00').toISOString(),
  endAt: atTime(toDateKey(new Date()), '12:00').toISOString(),
  isAllDay: false,
  repeatRule: { freq: 'none' },
  sourceType: 'manual',
  status: 'planned',
  preparations: [],
};

describe('앱 스토어', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('일정을 만들면 즉시 저장소에 기록된다', () => {
    const { store } = newStore();
    const created = store.createSchedule(baseSchedule);
    expect(store.schedules).toHaveLength(1);
    // 동기화가 저장소를 읽어가므로, 액션이 끝난 시점에 이미 저장돼 있어야 한다.
    expect(db.loadSchedules().map((s) => s.id)).toEqual([created.id]);
  });

  it('삭제는 tombstone으로 남겨 동기화 병합에서 지워지지 않게 한다', () => {
    const { store } = newStore();
    const created = store.createSchedule(baseSchedule);
    store.deleteSchedule(created.id);
    expect(store.schedules[0].deletedAt).toBeTruthy();
    expect(store.occurrencesBetween(atTime(toDateKey(new Date()), '00:00'), atTime(toDateKey(new Date()), '23:59'))).toHaveLength(0);
  });

  it('기관 필터가 조회 결과에 적용된다', () => {
    const { store } = newStore();
    store.createSchedule(baseSchedule);
    store.createSchedule({ ...baseSchedule, title: '가정 학습', institution: 'home' });
    const range = [atTime(toDateKey(new Date()), '00:00'), atTime(toDateKey(new Date()), '23:59')] as const;
    expect(store.occurrencesBetween(...range)).toHaveLength(2);
    store.toggleInstitution('home');
    expect(store.occurrencesBetween(...range).map((o) => o.schedule.title)).toEqual(['봄 소풍']);
  });

  it('반복 일정은 회차별로만 완료 처리된다', () => {
    const { store } = newStore();
    const created = store.createSchedule({ ...baseSchedule, repeatRule: { freq: 'weekly', weekdays: [0, 1, 2, 3, 4, 5, 6] } });
    const today = toDateKey(new Date());
    store.setOccurrenceStatus(created.id, today, 'done');
    expect(store.findOccurrence(created.id, today)?.status).toBe('done');
    expect(store.schedules[0].status).toBe('planned');
  });

  it('메일을 가져오면 검토 대기 상태로만 저장된다', () => {
    const { store } = newStore();
    const mail = store.importMail('3월 계획표', '2026년 3월 유치원\n3월 5일(목) 10:00 봄 소풍 준비물: 도시락', {
      receivedAt: new Date(2026, 2, 1).toISOString(),
    });
    expect(mail.reviewStatus).toBe('pending');
    expect(mail.parsedItems).toHaveLength(1);
    // 승인 전에는 일정이 만들어지지 않는다 (기획서 3.3의 안전장치).
    expect(store.schedules).toHaveLength(0);
    expect(store.pendingMails).toHaveLength(1);
  });

  it('승인한 항목만 일정이 된다', () => {
    const { store } = newStore();
    const mail = store.importMail('계획표', '2026년 3월 유치원\n3월 5일(목) 10:00 봄 소풍\n3월 6일(금) 09:00 소방훈련', {
      receivedAt: new Date(2026, 2, 1).toISOString(),
    });
    const items: ParsedItem[] = mail.parsedItems.map((item, index) => ({ ...item, selected: index === 0 }));
    const created = store.approveMail(mail.id, items);
    expect(created).toHaveLength(1);
    expect(created[0].title).toBe('봄 소풍');
    expect(created[0].sourceType).toBe('mail-ai');
    expect(store.mails[0].reviewStatus).toBe('approved');
  });

  it('미완료로 답하면 재알림이 예약된다', () => {
    const { store } = newStore();
    const created = store.createSchedule(baseSchedule);
    const today = toDateKey(new Date());
    const record = {
      id: 'noti1',
      scheduleId: created.id,
      date: today,
      offset: 0,
      type: 'snooze' as const,
      fireAt: new Date().toISOString(),
      snoozeCount: 0,
      resolved: false,
    };
    store.notifications = [record];
    store.inbox = [{ record, occurrence: store.findOccurrence(created.id, today), title: '', body: '' }];

    store.resolveInbox('noti1', 'missed');

    expect(store.findOccurrence(created.id, today)?.status).toBe('missed');
    expect(store.notifications.some((n) => n.snoozeCount === 1 && !n.resolved)).toBe(true);
    expect(store.inbox).toHaveLength(0);
  });

  it('사전 알림 닫기는 일정 상태를 바꾸지 않는다', () => {
    const { store } = newStore();
    const created = store.createSchedule(baseSchedule);
    const today = toDateKey(new Date());
    const record = {
      id: 'noti2',
      scheduleId: created.id,
      date: today,
      offset: 10,
      type: 'normal' as const,
      fireAt: new Date().toISOString(),
      snoozeCount: 0,
      resolved: false,
    };
    store.notifications = [record];
    store.inbox = [{ record, occurrence: store.findOccurrence(created.id, today), title: '', body: '' }];

    store.dismissInbox('noti2');

    expect(store.findOccurrence(created.id, today)?.status).toBe('planned');
    expect(store.notifications[0].resolved).toBe(true);
    expect(store.inbox).toHaveLength(0);
  });

  it('init은 저장된 데이터를 복원하고 두 번 불러도 덮어쓰지 않는다', () => {
    const first = newStore();
    first.store.createSchedule(baseSchedule);

    const { store } = newStore();
    store.init();
    expect(store.schedules).toHaveLength(1);
    expect(store.ready).toBe(true);

    store.createSchedule({ ...baseSchedule, title: '두 번째' });
    store.init();
    expect(store.schedules).toHaveLength(2);
  });

  it('init이 스토어 스코프 밖에서 경고를 내지 않는다', () => {
    // onScopeDispose를 setup 밖에서 부르면 정리가 등록되지 않아 타이머가 남는다.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { store } = newStore();
    store.init();
    expect(warn.mock.calls.flat().join(' ')).not.toContain('onScopeDispose');
  });

  it('초기화하면 저장소와 상태가 모두 비워진다', () => {
    const { store } = newStore();
    store.createSchedule(baseSchedule);
    store.resetAll();
    expect(store.schedules).toHaveLength(0);
    expect(db.loadSchedules()).toHaveLength(0);
  });
});

describe('알림 루프 정리', () => {
  beforeEach(() => localStorage.clear());

  it('스토어가 사라지면 알림 타이머가 멈춘다', () => {
    vi.useFakeTimers();
    const clearSpy = vi.spyOn(window, 'clearInterval');
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useAppStore();
    store.init();

    // pinia의 effect scope를 정리하면 스토어의 onScopeDispose가 실행된다.
    // _e는 pinia 내부 필드다. 앱 언마운트를 흉내 내는 가장 가벼운 방법이라 테스트에서만 쓴다.
    (pinia as unknown as { _e: { stop(): void } })._e.stop();
    expect(clearSpy).toHaveBeenCalled();

    clearSpy.mockRestore();
    vi.useRealTimers();
  });
});
