<script setup lang="ts">
import { INSTITUTION_LABEL } from '../types';
import type { InstitutionKind } from '../types';
import { useAppStore } from '../stores/app';

/** 기관 필터 (기획서 핵심요구 5). 홈·달력이 같은 필터 상태를 공유한다. */
const store = useAppStore();
const order: InstitutionKind[] = ['kindergarten', 'daycare', 'home'];
</script>

<template>
  <div class="chip-row" role="group" aria-label="기관 필터">
    <button
      v-for="kind in order"
      :key="kind"
      class="chip"
      :class="{ on: store.settings.institutionFilter.includes(kind) }"
      :aria-pressed="store.settings.institutionFilter.includes(kind)"
      @click="store.toggleInstitution(kind)"
    >
      {{ INSTITUTION_LABEL[kind] }}
    </button>
  </div>
</template>
