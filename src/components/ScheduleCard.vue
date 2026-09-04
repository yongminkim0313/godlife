<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import type { DailyForecast, Occurrence } from '../types';
import { INSTITUTION_COLOR, INSTITUTION_LABEL } from '../types';
import { relativeLabel, toTimeLabel } from '../lib/date';
import WeatherBadge from './WeatherBadge.vue';

const props = defineProps<{ occurrence: Occurrence; forecast?: DailyForecast; showRelative?: boolean }>();
const router = useRouter();

const schedule = computed(() => props.occurrence.schedule);
const remaining = computed(() => schedule.value.preparations.filter((p) => !p.checked).length);
</script>

<template>
  <div class="card">
    <button
      class="sched"
      :class="{ done: occurrence.status === 'done' }"
      style="background: none; border: none; padding: 0"
      @click="router.push(`/schedule/${schedule.id}/${occurrence.date}`)"
    >
      <span class="bar" :style="{ background: INSTITUTION_COLOR[schedule.institution] }" />
      <span class="grow">
        <span class="time">
          {{ schedule.isAllDay ? '종일' : `${toTimeLabel(occurrence.startAt)} – ${toTimeLabel(occurrence.endAt)}` }}
          <template v-if="showRelative && occurrence.status === 'planned'"> · {{ relativeLabel(occurrence.startAt) }}</template>
        </span>
        <p class="title">{{ schedule.title }}</p>
        <span class="meta">
          <span class="badge">{{ INSTITUTION_LABEL[schedule.institution] }}</span>
          <span v-if="schedule.sourceType === 'mail-ai'" class="badge ai">AI 등록</span>
          <span v-if="occurrence.status === 'done'" class="badge ok">완료</span>
          <span v-if="occurrence.status === 'missed'" class="badge danger">미완료</span>
          <span v-if="schedule.preparations.length > 0" class="badge">
            🎒 준비물 {{ remaining }}/{{ schedule.preparations.length }}
          </span>
          <WeatherBadge :forecast="forecast" />
        </span>
      </span>
    </button>
  </div>
</template>
