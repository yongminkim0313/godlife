<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import TopBar from '../components/TopBar.vue';
import InstitutionFilter from '../components/InstitutionFilter.vue';
import ScheduleCard from '../components/ScheduleCard.vue';
import { useAppStore } from '../stores/app';
import { addDays, humanDate, relativeLabel, toDateKey, toTimeLabel } from '../lib/date';
import { describeWeather, forecastFor, isWetForecast } from '../lib/weather';

/** 홈 = 중심 허브. 다음 일정 + 날씨 + 오늘/다가오는 일정. */
const store = useAppStore();
const router = useRouter();

const today = computed(() => toDateKey(new Date()));
const upcomingList = computed(() => store.upcomingOccurrences(12));
const next = computed(() => upcomingList.value[0]);
const todayList = computed(() => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return store.occurrencesBetween(start, end);
});
const later = computed(() => upcomingList.value.filter((o) => o.date !== today.value));
const nextForecast = computed(() => (next.value ? forecastFor(store.weather, next.value.date) : undefined));
const nextWeather = computed(() => (nextForecast.value ? describeWeather(nextForecast.value.code) : null));

const wetSoon = computed(() =>
  upcomingList.value
    .slice(0, 6)
    .map((occurrence) => ({ occurrence, forecast: forecastFor(store.weather, occurrence.date) }))
    .find((x) => x.forecast && isWetForecast(x.forecast)),
);

const horizonLabel = computed(() => toDateKey(addDays(new Date(), 21)));
</script>

<template>
  <TopBar
    :title="`안녕하세요, ${store.settings.profileName ?? '보호자'}님`"
    :subtitle="store.online ? (store.pendingSync > 0 ? `동기화 대기 ${store.pendingSync}건` : '동기화 완료') : '오프라인 · 로컬 데이터'"
  >
    <template #actions>
      <button class="icon-btn" aria-label="위젯 미리보기" @click="router.push('/widget')">🔲</button>
    </template>
  </TopBar>

  <div class="screen">
    <InstitutionFilter />

    <div v-if="next" class="hero" style="margin-top: 14px">
      <p class="label">다음 일정 · {{ relativeLabel(next.startAt) }}</p>
      <h2>{{ next.schedule.title }}</h2>
      <p class="when">{{ humanDate(next.date) }} {{ next.schedule.isAllDay ? '종일' : toTimeLabel(next.startAt) }}</p>
      <div v-if="store.settings.weatherEnabled && nextForecast && nextWeather" class="weather">
        <span style="font-size: 20px">{{ nextWeather.icon }}</span>
        <span>
          {{ store.settings.region.name }} · {{ nextWeather.label }} {{ nextForecast.tempMin }}°/{{ nextForecast.tempMax }}°<template
            v-if="nextForecast.precipProbability > 0"
          >
            · 강수 {{ nextForecast.precipProbability }}%</template
          >
        </span>
      </div>
      <p v-if="next.schedule.preparations.length > 0" class="preps">
        🎒 {{ next.schedule.preparations.map((p) => p.text).join(', ') }}
      </p>
    </div>

    <div v-else class="card" style="margin-top: 14px">
      <div class="empty">
        <span class="big">🗓️</span>
        다가오는 일정이 없습니다.<br />
        일정을 등록하거나 월 계획표 메일을 가져와 보세요.
        <div class="row" style="margin-top: 16px; gap: 8px">
          <button class="btn primary grow" @click="router.push('/schedule/new')">일정 등록</button>
          <button class="btn grow" @click="router.push('/mail')">메일 가져오기</button>
        </div>
      </div>
    </div>

    <div v-if="store.settings.weatherEnabled && wetSoon" class="card" style="margin-top: 10px; border-color: var(--warn)">
      <div class="row">
        <span style="font-size: 20px">☔</span>
        <span class="grow small">
          <strong>{{ humanDate(wetSoon.occurrence.date) }}</strong> {{ wetSoon.occurrence.schedule.title }} 날 비/눈 예보가 있어요.
          우비·여벌 옷을 준비물에 추가해 두세요.
        </span>
      </div>
    </div>

    <template v-if="store.pendingMails.length > 0">
      <p class="section-title">AI 검토 대기</p>
      <div v-for="mail in store.pendingMails" :key="mail.id" class="card">
        <div class="row between">
          <div class="grow">
            <strong class="small">{{ mail.subject }}</strong>
            <p class="muted small" style="margin: 4px 0 0">추출 {{ mail.parsedItems.length }}건 · 승인 전</p>
          </div>
          <button class="btn primary" @click="router.push(`/mail/${mail.id}/review`)">검토</button>
        </div>
      </div>
    </template>

    <p class="section-title">
      오늘 <span class="muted small">{{ todayList.length }}건</span>
    </p>
    <p v-if="todayList.length === 0" class="muted small" style="padding: 0 2px">오늘은 등록된 일정이 없습니다.</p>
    <ScheduleCard
      v-for="occurrence in todayList"
      :key="occurrence.key"
      :occurrence="occurrence"
      :forecast="forecastFor(store.weather, occurrence.date)"
      show-relative
    />

    <template v-if="later.length > 0">
      <p class="section-title">
        다가오는 일정
        <button class="chip" @click="router.push('/calendar')">달력 보기</button>
      </p>
      <ScheduleCard
        v-for="occurrence in later"
        :key="occurrence.key"
        :occurrence="occurrence"
        :forecast="forecastFor(store.weather, occurrence.date)"
      />
    </template>

    <p class="muted small" style="margin-top: 24px; text-align: center">
      {{
        store.weather
          ? `날씨 기준: ${store.weather.region.name} · ${new Date(store.weather.cachedAt).toLocaleString('ko-KR')} 저장`
          : '날씨 정보를 아직 받지 못했습니다.'
      }}
      <br />
      최대 {{ horizonLabel }}까지의 일정을 보여줍니다.
    </p>
  </div>
</template>
