<script setup lang="ts">
const tabs = [
  { to: '/home', icon: '🏠', label: '홈' },
  { to: '/calendar', icon: '📅', label: '달력' },
  { to: '/schedule/new', icon: '➕', label: '등록' },
  { to: '/mail', icon: '📩', label: '메일' },
  { to: '/settings', icon: '⚙️', label: '설정' },
];
</script>

<template>
  <nav class="nav">
    <RouterLink v-for="tab in tabs" :key="tab.to" :to="tab.to" active-class="active">
      <span class="ic">{{ tab.icon }}</span>
      <span>{{ tab.label }}</span>
    </RouterLink>
  </nav>
</template>
