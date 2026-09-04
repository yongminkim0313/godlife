<script setup lang="ts">
import type { Preparation } from '../types';

/** 준비물 목록 (기획서 3.4). 상세 화면에서 체크하고, 하루 전 알림에 첨부된다. */
defineProps<{ preparations: Preparation[]; toggleable?: boolean; removable?: boolean }>();
defineEmits<{ toggle: [id: string]; remove: [id: string] }>();
</script>

<template>
  <p v-if="preparations.length === 0" class="muted small">등록된 준비물이 없습니다.</p>
  <div v-else>
    <div v-for="prep in preparations" :key="prep.id" class="prep" :class="{ checked: prep.checked }">
      <input
        type="checkbox"
        :checked="prep.checked"
        :disabled="!toggleable"
        :aria-label="`${prep.text} 준비 완료`"
        @change="$emit('toggle', prep.id)"
      />
      <span class="grow">{{ prep.text }}</span>
      <button v-if="removable" class="icon-btn" :aria-label="`${prep.text} 삭제`" @click="$emit('remove', prep.id)">×</button>
    </div>
  </div>
</template>
