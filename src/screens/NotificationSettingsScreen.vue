<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import TopBar from '../components/TopBar.vue';
import { useAppStore } from '../stores/app';
import { offsetLabel } from '../lib/date';
import { OFFSET_CHOICES, ensurePermission } from '../lib/notifications';

/** 일정별 알림 설정 (기획서 4장 '알림 설정' 화면). */
const store = useAppStore();
const route = useRoute();
const router = useRouter();

const id = computed(() => String(route.params.id));
const date = computed(() => String(route.params.date));
const schedule = computed(() => store.schedules.find((s) => s.id === id.value));
const offsets = ref<number[]>([...(schedule.value?.notificationOffsets ?? store.settings.defaultOffsets)]);
const permission = ref(typeof Notification === 'undefined' ? 'denied' : Notification.permission);

function toggle(offset: number): void {
  offsets.value = offsets.value.includes(offset) ? offsets.value.filter((o) => o !== offset) : [...offsets.value, offset];
}

function save(): void {
  store.updateSchedule(id.value, { notificationOffsets: offsets.value });
  void router.replace(`/schedule/${id.value}/${date.value}`);
}
</script>

<template>
  <template v-if="schedule">
    <TopBar title="알림 설정" :subtitle="schedule.title" back />
    <div class="screen">
      <div class="card">
        <p class="small muted" style="margin-top: 0">
          여러 개를 함께 켤 수 있습니다. 하루 전 알림에는 준비물이 자동으로 첨부됩니다.
        </p>
        <div class="chip-row">
          <button
            v-for="offset in OFFSET_CHOICES"
            :key="offset"
            class="chip"
            :class="{ on: offsets.includes(offset) }"
            @click="toggle(offset)"
          >
            {{ offsetLabel(offset) }}
          </button>
        </div>
      </div>

      <p class="section-title">기기 알림 권한</p>
      <div class="card">
        <div class="row between">
          <span class="small">
            {{ permission === 'granted' ? '허용됨 · OS 알림으로 전달됩니다.' : '미허용 · 앱 안에서 알림 카드로 표시됩니다.' }}
          </span>
          <button v-if="permission !== 'granted'" class="btn" @click="ensurePermission().then((p) => (permission = p))">
            권한 요청
          </button>
        </div>
      </div>

      <button class="btn primary block" style="margin-top: 20px" @click="save">저장</button>
    </div>
  </template>

  <template v-else>
    <TopBar title="알림 설정" back />
    <div class="screen"><div class="empty">일정을 찾을 수 없습니다.</div></div>
  </template>
</template>
