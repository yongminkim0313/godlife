<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAppStore } from '../stores/app';

const store = useAppStore();
const router = useRouter();
let timer = 0;

function go(): void {
  if (!store.ready || timer) return;
  timer = window.setTimeout(() => {
    void router.replace(store.settings.profileName ? '/home' : '/login');
  }, 900);
}

onMounted(go);
watch(() => store.ready, go);
onUnmounted(() => window.clearTimeout(timer));
</script>

<template>
  <div class="center-screen">
    <div>
      <div class="logo">🧸</div>
      <p class="brand">하루동행</p>
      <p class="muted small">어린이집·유치원 일정을 한곳에서</p>
    </div>
  </div>
</template>
