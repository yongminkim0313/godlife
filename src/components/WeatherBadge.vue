<script setup lang="ts">
import { computed } from 'vue';
import type { DailyForecast } from '../types';
import { describeWeather, isWetForecast } from '../lib/weather';

const props = defineProps<{ forecast?: DailyForecast }>();
const info = computed(() => (props.forecast ? describeWeather(props.forecast.code) : null));
const wet = computed(() => (props.forecast ? isWetForecast(props.forecast) : false));
</script>

<template>
  <span v-if="forecast && info" class="badge" :class="{ warn: wet }">
    {{ info.icon }} {{ info.label }} {{ forecast.tempMin }}°/{{ forecast.tempMax }}°<template
      v-if="forecast.precipProbability > 0"
    >
      · 강수 {{ forecast.precipProbability }}%</template
    >
  </span>
</template>
