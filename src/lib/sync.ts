import type { MailImport, Schedule } from '../types';
import { db, mergeByUpdatedAt } from './db';

/**
 * 백그라운드 동기화 (기획서 3.2).
 *
 * 서버가 아직 없으므로 RemoteAdapter를 인터페이스로 두고, 기본 구현은
 * "로컬 미러"다. 실제 백엔드가 붙으면 이 어댑터만 교체하면 되고, 병합 규칙
 * (마지막 저장 우선)과 온라인 복귀 트리거는 그대로 재사용된다.
 */
export interface RemoteAdapter {
  pull(): Promise<{ schedules: Schedule[]; mails: MailImport[] }>;
  push(payload: { schedules: Schedule[]; mails: MailImport[] }): Promise<void>;
}

const MIRROR_KEY = 'godlife.v1.remoteMirror';

/** 서버 없이도 동기화 흐름을 그대로 태우기 위한 스텁. */
export const localMirrorRemote: RemoteAdapter = {
  async pull() {
    try {
      const raw = localStorage.getItem(MIRROR_KEY);
      return raw ? JSON.parse(raw) : { schedules: [], mails: [] };
    } catch {
      return { schedules: [], mails: [] };
    }
  },
  async push(payload) {
    localStorage.setItem(MIRROR_KEY, JSON.stringify(payload));
  },
};

export class SyncEngine {
  private pending = 0;
  private running = false;
  private timer: number | null = null;

  constructor(
    private remote: RemoteAdapter = localMirrorRemote,
    private onChange?: (state: { pendingCount: number; lastSyncedAt?: string }) => void,
  ) {}

  get pendingCount() {
    return this.pending;
  }

  /** 로컬 변경이 생길 때마다 호출. 오프라인이면 큐에 쌓아두고 온라인 복귀 때 밀어 올린다. */
  markDirty(): void {
    this.pending += 1;
    this.emit();
    if (navigator.onLine) this.scheduleFlush();
  }

  /**
   * markDirty는 보통 상태를 바꾸는 도중에 불린다. 그 시점의 저장소는 아직 이전 값이라,
   * 바로 flush하면 방금 만든 변경을 덮어쓸 수 있다. 한 틱 미뤄 저장이 끝난 뒤에 읽는다.
   */
  private scheduleFlush(): void {
    if (this.timer !== null) return;
    this.timer = window.setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, 0);
  }

  async flush(): Promise<void> {
    if (this.running || !navigator.onLine) return;
    this.running = true;
    try {
      const remote = await this.remote.pull();
      // 저장소는 pull을 기다리는 사이에도 바뀔 수 있으므로 병합 직전에 읽는다.
      const schedules = mergeByUpdatedAt(db.loadSchedules(), remote.schedules);
      const mails = mergeByUpdatedAt(db.loadMails(), remote.mails);
      db.saveSchedules(schedules);
      db.saveMails(mails);
      await this.remote.push({ schedules, mails });
      this.pending = 0;
      db.saveSyncedAt(new Date().toISOString());
      this.emit();
    } catch (error) {
      // 실패해도 로컬 데이터는 그대로 남는다. 다음 온라인 복귀 때 다시 시도.
      console.warn('[sync] 동기화 실패, 로컬 유지', error);
    } finally {
      this.running = false;
    }
  }

  /** 온라인 복귀 감지. 반환값은 해제 함수. */
  watchConnectivity(): () => void {
    const handler = () => void this.flush();
    window.addEventListener('online', handler);
    return () => window.removeEventListener('online', handler);
  }

  private emit() {
    this.onChange?.({ pendingCount: this.pending, lastSyncedAt: db.loadSyncedAt() });
  }
}
