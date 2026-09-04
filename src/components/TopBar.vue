<script setup lang="ts">
import { useRouter } from 'vue-router';

defineProps<{ title: string; subtitle?: string; back?: boolean }>();
const router = useRouter();
</script>

<template>
  <header class="topbar">
    <button v-if="back" class="icon-btn" aria-label="뒤로" @click="router.back()">←</button>
    <div class="grow">
      <h1>{{ title }}</h1>
      <p v-if="subtitle" class="sub">{{ subtitle }}</p>
    </div>
    <slot name="actions" />
  </header>
</template>
