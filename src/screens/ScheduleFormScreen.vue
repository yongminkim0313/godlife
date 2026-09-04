<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import TopBar from '../components/TopBar.vue';
import PreparationList from '../components/PreparationList.vue';
import { useAppStore } from '../stores/app';
import { INSTITUTION_LABEL } from '../types';
import type { InstitutionKind, Preparation, RepeatRule } from '../types';
import { WEEKDAY_LABEL, atTime, offsetLabel, toDateKey, toTimeLabel, uid } from '../lib/date';
import { OFFSET_CHOICES } from '../lib/notifications';

/** 일정 등록/수정 (기획서 핵심요구 1: 매주 반복 포함). */
const store = useAppStore();
const route = useRoute();
const router = useRouter();
const institutions: InstitutionKind[] = ['kindergarten', 'daycare', 'home'];

const editing = computed(() => store.schedules.find((s) => s.id === route.params.id));

const source = editing.value;
const title = ref(source?.title ?? '');
const institution = ref<InstitutionKind>(source?.institution ?? 'kindergarten');
const date = ref(toDateKey(source ? new Date(source.startAt) : new Date()));
const startTime = ref(source ? toTimeLabel(source.startAt) : '09:00');
const endTime = ref(source ? toTimeLabel(source.endAt) : '10:00');
const isAllDay = ref(source?.isAllDay ?? false);
const weekly = ref(source?.repeatRule.freq === 'weekly');
const weekdays = ref<number[]>(source?.repeatRule.freq === 'weekly' ? [...source.repeatRule.weekdays] : [new Date().getDay()]);
const until = ref(source?.repeatRule.freq === 'weekly' ? (source.repeatRule.until ?? '') : '');
const offsets = ref<number[]>([...(source?.notificationOffsets ?? store.settings.defaultOffsets)]);
const preparations = ref<Preparation[]>(source ? [...source.preparations] : []);
const prepInput = ref('');
const memo = ref(source?.memo ?? '');
const error = ref('');

function toggleWeekday(day: number): void {
  weekdays.value = weekdays.value.includes(day) ? weekdays.value.filter((d) => d !== day) : [...weekdays.value, day];
}

function toggleOffset(offset: number): void {
  offsets.value = offsets.value.includes(offset) ? offsets.value.filter((o) => o !== offset) : [...offsets.value, offset];
}

function addPreparation(): void {
  const text = prepInput.value.trim();
  if (!text) return;
  preparations.value = [...preparations.value, { id: uid('prep'), text, checked: false }];
  prepInput.value = '';
}

function submit(): void {
  if (!title.value.trim()) {
    error.value = '일정 이름을 입력해 주세요.';
    return;
  }
  if (weekly.value && weekdays.value.length === 0) {
    error.value = '반복할 요일을 하나 이상 선택해 주세요.';
    return;
  }

  const start = isAllDay.value ? atTime(date.value, '00:00') : atTime(date.value, startTime.value);
  let end = isAllDay.value ? atTime(date.value, '23:59') : atTime(date.value, endTime.value);
  if (end <= start) end = new Date(start.getTime() + 60 * 60_000);

  const repeatRule: RepeatRule = weekly.value
    ? { freq: 'weekly', weekdays: weekdays.value, until: until.value || undefined }
    : { freq: 'none' };

  const payload = {
    title: title.value.trim(),
    institution: institution.value,
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    isAllDay: isAllDay.value,
    repeatRule,
    preparations: preparations.value,
    memo: memo.value.trim() || undefined,
    notificationOffsets: offsets.value,
  };

  const id = editing.value?.id;
  if (id) {
    store.updateSchedule(id, payload);
    void router.replace(`/schedule/${id}/${toDateKey(start)}`);
  } else {
    const created = store.createSchedule({ ...payload, sourceType: 'manual', status: 'planned' });
    void router.replace(`/schedule/${created.id}/${toDateKey(start)}`);
  }
}
</script>

<template>
  <TopBar :title="editing ? '일정 수정' : '일정 등록'" back />
  <form class="screen" @submit.prevent="submit">
    <div class="card">
      <label class="field">
        <span>일정 이름</span>
        <input v-model="title" type="text" placeholder="예: 봄 소풍" />
      </label>

      <label class="field">
        <span>기관</span>
        <div class="chip-row">
          <button
            v-for="kind in institutions"
            :key="kind"
            type="button"
            class="chip"
            :class="{ on: institution === kind }"
            @click="institution = kind"
          >
            {{ INSTITUTION_LABEL[kind] }}
          </button>
        </div>
      </label>

      <label class="field">
        <span>날짜</span>
        <input v-model="date" type="date" />
      </label>

      <div class="toggle">
        <span class="small">종일 일정</span>
        <input v-model="isAllDay" type="checkbox" />
      </div>

      <div v-if="!isAllDay" class="grid2" style="margin-top: 12px">
        <label class="field">
          <span>시작</span>
          <input v-model="startTime" type="time" />
        </label>
        <label class="field">
          <span>종료</span>
          <input v-model="endTime" type="time" />
        </label>
      </div>
    </div>

    <p class="section-title">반복</p>
    <div class="card">
      <div class="toggle">
        <span class="small">매주 반복</span>
        <input v-model="weekly" type="checkbox" />
      </div>
      <template v-if="weekly">
        <div class="chip-row" style="margin-top: 12px">
          <button
            v-for="(label, index) in WEEKDAY_LABEL"
            :key="label"
            type="button"
            class="chip"
            :class="{ on: weekdays.includes(index) }"
            @click="toggleWeekday(index)"
          >
            {{ label }}
          </button>
        </div>
        <label class="field" style="margin-top: 12px">
          <span>반복 종료일 (선택)</span>
          <input v-model="until" type="date" />
        </label>
      </template>
    </div>

    <p class="section-title">알림</p>
    <div class="card">
      <div class="chip-row">
        <button
          v-for="offset in OFFSET_CHOICES"
          :key="offset"
          type="button"
          class="chip"
          :class="{ on: offsets.includes(offset) }"
          @click="toggleOffset(offset)"
        >
          {{ offsetLabel(offset) }}
        </button>
      </div>
      <p class="muted small" style="margin: 10px 0 0">하루 전 알림에는 준비물 메모가 함께 전달됩니다.</p>
    </div>

    <p class="section-title">준비물</p>
    <div class="card">
      <PreparationList
        :preparations="preparations"
        removable
        @remove="(id) => (preparations = preparations.filter((p) => p.id !== id))"
      />
      <div class="row" style="margin-top: 10px">
        <input v-model="prepInput" type="text" class="grow" placeholder="예: 물통" @keydown.enter.prevent="addPreparation" />
        <button type="button" class="btn" @click="addPreparation">추가</button>
      </div>
    </div>

    <p class="section-title">메모</p>
    <div class="card">
      <textarea v-model="memo" placeholder="기관 안내사항 등" style="min-height: 80px" />
    </div>

    <p v-if="error" class="small" style="color: var(--danger); margin-top: 12px">{{ error }}</p>

    <button class="btn primary block" type="submit" style="margin-top: 18px">
      {{ editing ? '수정 저장' : '일정 등록' }}
    </button>
  </form>
</template>
