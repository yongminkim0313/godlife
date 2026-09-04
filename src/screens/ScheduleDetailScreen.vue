<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import TopBar from '../components/TopBar.vue';
import PreparationList from '../components/PreparationList.vue';
import WeatherBadge from '../components/WeatherBadge.vue';
import { useAppStore } from '../stores/app';
import { INSTITUTION_LABEL } from '../types';
import { humanDate, offsetLabel, toTimeLabel } from '../lib/date';
import { repeatLabel } from '../lib/repeat';
import { forecastFor, isWetForecast } from '../lib/weather';

/** 일정 상세 (완료 체크, 준비물 메모, 알림 설정 진입). */
const store = useAppStore();
const route = useRoute();
const router = useRouter();

const id = computed(() => String(route.params.id));
const date = computed(() => String(route.params.date));
const occurrence = computed(() => store.findOccurrence(id.value, date.value));
const schedule = computed(() => occurrence.value?.schedule);
const forecast = computed(() => (occurrence.value ? forecastFor(store.weather, occurrence.value.date) : undefined));
const wet = computed(() => (forecast.value ? isWetForecast(forecast.value) : false));

const scheduled = computed(() =>
  store.notifications
    .filter((n) => n.scheduleId === id.value && n.date === date.value && n.offset > 0)
    .sort((a, b) => b.offset - a.offset),
);

const subtitle = computed(() => {
  if (!occurrence.value || !schedule.value) return '';
  const time = schedule.value.isAllDay
    ? '종일'
    : `${toTimeLabel(occurrence.value.startAt)} – ${toTimeLabel(occurrence.value.endAt)}`;
  return `${humanDate(occurrence.value.date)} · ${time}`;
});

function toggleStatus(target: 'done' | 'missed'): void {
  if (!occurrence.value) return;
  const next = occurrence.value.status === target ? 'planned' : target;
  store.setOccurrenceStatus(id.value, date.value, next);
}

function remove(): void {
  if (!schedule.value) return;
  if (schedule.value.repeatRule.freq === 'weekly') {
    if (window.confirm('이 반복 일정 전체를 삭제할까요? (취소를 누르면 이 날짜만 제외합니다)')) store.deleteSchedule(id.value);
    else store.excludeOccurrence(id.value, date.value);
  } else if (window.confirm('이 일정을 삭제할까요?')) {
    store.deleteSchedule(id.value);
  }
  void router.push('/home');
}
</script>

<template>
  <template v-if="occurrence && schedule">
    <TopBar :title="schedule.title" :subtitle="subtitle" back>
      <template #actions>
        <button class="icon-btn" aria-label="수정" @click="router.push(`/schedule/${id}/edit`)">✏️</button>
      </template>
    </TopBar>
    <div class="screen">
      <div class="card">
        <div class="row" style="flex-wrap: wrap; gap: 6px">
          <span class="badge">{{ INSTITUTION_LABEL[schedule.institution] }}</span>
          <span class="badge">{{ repeatLabel(schedule.repeatRule) }}</span>
          <span class="badge ai">{{ schedule.sourceType === 'mail-ai' ? '메일 AI 등록' : '직접 등록' }}</span>
          <span v-if="occurrence.status === 'done'" class="badge ok">완료</span>
          <span v-if="occurrence.status === 'missed'" class="badge danger">미완료</span>
          <WeatherBadge v-if="store.settings.weatherEnabled" :forecast="forecast" />
        </div>
        <p v-if="schedule.memo" class="small" style="margin: 12px 0 0">{{ schedule.memo }}</p>
        <p v-if="store.settings.weatherEnabled && wet" class="small" style="margin: 10px 0 0; color: var(--warn)">
          ☔ 비/눈 예보가 있습니다. 야외 활동이라면 우비·여벌 옷을 챙겨 주세요.
        </p>
      </div>

      <p class="section-title">실천 체크</p>
      <div class="card">
        <div class="row">
          <button class="btn grow" :class="{ primary: occurrence.status === 'done' }" @click="toggleStatus('done')">
            {{ occurrence.status === 'done' ? '완료됨' : '완료로 표시' }}
          </button>
          <button class="btn grow" :class="{ danger: occurrence.status === 'missed' }" @click="toggleStatus('missed')">
            미완료
          </button>
        </div>
        <p class="muted small" style="margin: 10px 0 0">
          미완료로 두면 {{ store.settings.snoozeMinutes }}분 뒤 재알림이 옵니다 (최대 {{ store.settings.maxSnooze }}회).
        </p>
      </div>

      <p class="section-title">🎒 준비물</p>
      <div class="card">
        <PreparationList :preparations="schedule.preparations" toggleable @toggle="(pid) => store.togglePreparation(id, pid)" />
      </div>

      <p class="section-title">
        알림
        <button class="chip" @click="router.push(`/schedule/${id}/${date}/notifications`)">설정</button>
      </p>
      <div class="card">
        <p v-if="scheduled.length === 0" class="muted small" style="margin: 0">설정된 알림이 없습니다.</p>
        <div v-for="notification in scheduled" :key="notification.id" class="row between" style="padding: 6px 0">
          <span class="small">
            {{ offsetLabel(notification.offset) }}
            <template v-if="notification.type === 'preparation'"> · 준비물 포함</template>
            <template v-if="notification.weatherAlert"> · ☔ 우천</template>
          </span>
          <span class="badge">
            {{ notification.firedAt ? '발송됨' : new Date(notification.fireAt).toLocaleString('ko-KR') }}
          </span>
        </div>
      </div>

      <button class="btn danger block" style="margin-top: 20px" @click="remove">일정 삭제</button>
    </div>
  </template>

  <template v-else>
    <TopBar title="일정" back />
    <div class="screen">
      <div class="empty"><span class="big">🔍</span> 일정을 찾을 수 없습니다.</div>
    </div>
  </template>
</template>
