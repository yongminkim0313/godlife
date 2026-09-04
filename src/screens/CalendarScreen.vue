<script setup lang="ts">
import { computed, ref } from 'vue';
import TopBar from '../components/TopBar.vue';
import InstitutionFilter from '../components/InstitutionFilter.vue';
import ScheduleCard from '../components/ScheduleCard.vue';
import { useAppStore } from '../stores/app';
import { INSTITUTION_COLOR } from '../types';
import type { Occurrence } from '../types';
import { WEEKDAY_LABEL, addDays, endOfMonth, fromDateKey, humanDate, monthGrid, startOfMonth, toDateKey } from '../lib/date';
import { describeWeather, forecastFor } from '../lib/weather';

/** 월간 달력 (기획서 핵심요구 4). 기관 필터·날씨 아이콘이 셀에 함께 붙는다. */
const store = useAppStore();
const cursor = ref(startOfMonth(new Date()));
const selected = ref(toDateKey(new Date()));
const today = toDateKey(new Date());

const grid = computed(() => monthGrid(cursor.value));
const cells = computed(() => grid.value.flat());
const monthLabel = computed(() => `${cursor.value.getFullYear()}년 ${cursor.value.getMonth() + 1}월`);

const monthOccurrences = computed(() =>
  store.occurrencesBetween(fromDateKey(grid.value[0][0]), addDays(fromDateKey(grid.value[5][6]), 1)),
);

const byDate = computed(() => {
  const map = new Map<string, Occurrence[]>();
  for (const occurrence of monthOccurrences.value) {
    const list = map.get(occurrence.date) ?? [];
    list.push(occurrence);
    map.set(occurrence.date, list);
  }
  return map;
});

const monthCount = computed(() => {
  const prefix = toDateKey(cursor.value).slice(0, 7);
  return monthOccurrences.value.filter((o) => o.date.startsWith(prefix)).length;
});

const selectedList = computed(() => byDate.value.get(selected.value) ?? []);

const dayClass = (key: string) => {
  const day = fromDateKey(key).getDay();
  return day === 0 ? 'sun' : day === 6 ? 'sat' : '';
};
</script>

<template>
  <TopBar :title="monthLabel" :subtitle="`${monthCount}건`">
    <template #actions>
      <div class="row">
        <button class="icon-btn" aria-label="이전 달" @click="cursor = startOfMonth(addDays(startOfMonth(cursor), -1))">‹</button>
        <button class="icon-btn" aria-label="다음 달" @click="cursor = startOfMonth(addDays(endOfMonth(cursor), 1))">›</button>
      </div>
    </template>
  </TopBar>

  <div class="screen">
    <InstitutionFilter />

    <div class="cal-head" style="margin-top: 12px">
      <span v-for="label in WEEKDAY_LABEL" :key="label">{{ label }}</span>
    </div>
    <div class="cal-grid">
      <button
        v-for="key in cells"
        :key="key"
        class="cal-cell"
        :class="{
          out: fromDateKey(key).getMonth() !== cursor.getMonth(),
          today: key === today,
          sel: key === selected,
        }"
        @click="selected = key"
      >
        <span class="d" :class="dayClass(key)">{{ fromDateKey(key).getDate() }}</span>
        <span class="cal-dots">
          <span
            v-for="occurrence in (byDate.get(key) ?? []).slice(0, 6)"
            :key="occurrence.key"
            class="cal-dot"
            :style="{ background: INSTITUTION_COLOR[occurrence.schedule.institution] }"
          />
        </span>
        <span v-if="store.settings.weatherEnabled && forecastFor(store.weather, key)" class="wx">
          {{ describeWeather(forecastFor(store.weather, key)!.code).icon }}
        </span>
      </button>
    </div>

    <p class="section-title">
      {{ humanDate(selected) }} <span class="muted small">{{ selectedList.length }}건</span>
    </p>
    <p v-if="selectedList.length === 0" class="muted small" style="padding: 0 2px">선택한 날짜에 일정이 없습니다.</p>
    <ScheduleCard
      v-for="occurrence in selectedList"
      :key="occurrence.key"
      :occurrence="occurrence"
      :forecast="forecastFor(store.weather, occurrence.date)"
    />
  </div>
</template>
