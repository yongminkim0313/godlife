<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import BottomNav from './components/BottomNav.vue';
import NotificationInbox from './components/NotificationInbox.vue';
import { useAppStore } from './stores/app';

const store = useAppStore();
const route = useRoute();

const CHROME_LESS = ['/', '/login', '/widget'];
const bare = computed(() => CHROME_LESS.includes(route.path));

onMounted(() => store.init());
</script>

<template>
  <div class="app" :class="{ 'has-inbox': store.inbox.length > 0 && !bare }">
    <div v-if="!store.online" class="offline-bar">오프라인 · 저장된 일정으로 보고 있어요</div>
    <RouterView />
    <NotificationInbox v-if="!bare" />
    <BottomNav v-if="!bare" />
  </div>
</template>
