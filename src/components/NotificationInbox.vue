<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useAppStore } from '../stores/app';

/**
 * 알림 발생 화면 (기획서 4장 "알림 발생 (푸시) → 완료/미완료 분기").
 *
 * 분기는 알림 종류에 따라 다르다. 사전 알림(5·10분·하루 전)은 아직 일정이 시작도
 * 안 했으므로 완료/미완료를 물으면 안 된다. 완료 여부는 일정이 끝난 뒤의
 * 실천 확인·재알림에서만 묻는다.
 */
const store = useAppStore();
const router = useRouter();

function openSchedule(recordId: string, scheduleId: string, date: string): void {
  store.dismissInbox(recordId);
  void router.push(`/schedule/${scheduleId}/${date}`);
}
</script>

<template>
  <div v-if="store.inbox.length > 0" class="inbox" role="region" aria-label="알림">
    <div v-for="entry in store.inbox.slice(0, 2)" :key="entry.record.id" class="toast" :class="entry.record.type">
      <button class="toast-close" aria-label="알림 닫기" @click="store.dismissInbox(entry.record.id)">×</button>
      <h4>
        <template v-if="entry.record.type === 'preparation'">🎒 </template>
        <template v-if="entry.record.type === 'snooze'">🔁 </template>
        {{ entry.title }}
      </h4>
      <p>{{ entry.body }}</p>
      <div class="actions">
        <template v-if="entry.record.type === 'snooze'">
          <button class="btn primary" @click="store.resolveInbox(entry.record.id, 'done')">완료</button>
          <button class="btn" @click="store.resolveInbox(entry.record.id, 'missed')">미완료 · 재알림</button>
        </template>
        <template v-else>
          <button class="btn primary" @click="store.dismissInbox(entry.record.id)">확인</button>
          <button
            v-if="entry.occurrence"
            class="btn"
            @click="openSchedule(entry.record.id, entry.occurrence.scheduleId, entry.occurrence.date)"
          >
            일정 보기
          </button>
        </template>
      </div>
    </div>
    <p v-if="store.inbox.length > 2" class="inbox-more small muted">알림 {{ store.inbox.length - 2 }}건 더 있음</p>
  </div>
</template>
