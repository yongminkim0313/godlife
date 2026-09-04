<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import TopBar from '../components/TopBar.vue';
import { useAppStore } from '../stores/app';
import { humanDate, relativeLabel, toTimeLabel } from '../lib/date';
import { describeWeather, forecastFor } from '../lib/weather';

/**
 * 홈 화면 위젯 (기획서 핵심요구 6).
 *
 * 웹에서는 OS 홈 화면에 붙는 진짜 위젯을 만들 수 없어, 네이티브 위젯이 그릴 화면과
 * 동일한 데이터(다음 일정 + 날씨 + 준비물)를 이 라우트에서 그대로 렌더링한다.
 */
const store = useAppStore();
const router = useRouter();

const next = computed(() => store.upcomingOccurrences(1)[0]);
const forecast = computed(() => (next.value ? forecastFor(store.weather, next.value.date) : undefined));
const weather = computed(() => (forecast.value ? describeWeather(forecast.value.code) : null));
</script>

<template>
  <TopBar title="홈 화면 위젯" subtitle="네이티브 위젯이 그릴 내용" back />
  <div class="screen">
    <div class="widget-frame">
      <div class="widget" style="width: 100%" role="button" tabindex="0" @click="router.push('/home')">
        <p class="w-label">다음 일정</p>
        <template v-if="next">
          <p class="w-title">{{ next.schedule.title }}</p>
          <p class="w-when">
            {{ humanDate(next.date) }} {{ next.schedule.isAllDay ? '종일' : toTimeLabel(next.startAt) }} ·
            {{ relativeLabel(next.startAt) }}
          </p>
          <div class="w-foot">
            <span>
              {{
                store.settings.weatherEnabled && forecast && weather
                  ? `${weather.icon} ${store.settings.region.name} ${forecast.tempMin}°/${forecast.tempMax}°`
                  : ''
              }}
            </span>
            <span>
              {{ next.schedule.preparations.length > 0 ? `🎒 ${next.schedule.preparations.map((p) => p.text).join(', ')}` : '' }}
            </span>
          </div>
        </template>
        <template v-else>
          <p class="w-title">예정된 일정 없음</p>
          <p class="w-when">탭해서 일정을 등록하세요</p>
        </template>
      </div>
    </div>

    <div class="card" style="margin-top: 16px">
      <p class="small" style="margin-top: 0">위젯을 탭하면 앱 홈으로 이동합니다.</p>
      <p class="muted small" style="margin-bottom: 0">
        위젯은 오프라인 캐시(로컬 저장소)의 다음 일정과 마지막으로 받은 날씨 예보를 사용하므로, 네트워크가 없어도 마지막 상태를
        그대로 보여줍니다.
      </p>
    </div>

    <button class="btn primary block" style="margin-top: 16px" @click="router.push('/home')">앱으로 이동</button>
  </div>
</template>
