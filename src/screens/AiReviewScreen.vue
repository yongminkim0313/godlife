<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import TopBar from '../components/TopBar.vue';
import { useAppStore } from '../stores/app';
import { INSTITUTION_LABEL } from '../types';
import type { InstitutionKind, ParsedItem } from '../types';
import { humanDate, uid } from '../lib/date';
import { LOW_CONFIDENCE } from '../lib/mailParser';

/**
 * AI 파싱 검토 화면 (기획서 3.3).
 *
 * AI가 뽑은 항목을 자동 등록하지 않고 여기서 반드시 사람이 확인한다.
 * confidence가 낮은 항목은 "확인 필요"로 강조해 오독을 걸러낸다.
 */
const store = useAppStore();
const route = useRoute();
const router = useRouter();
const institutions: InstitutionKind[] = ['kindergarten', 'daycare', 'home'];

const mail = computed(() => store.mails.find((m) => m.id === route.params.id));
const items = ref<ParsedItem[]>(mail.value ? mail.value.parsedItems.map((item) => ({ ...item })) : []);
const showRaw = ref(false);

const selectedCount = computed(() => items.value.filter((i) => i.selected).length);
const lowCount = computed(() => items.value.filter((i) => i.selected && i.confidence < LOW_CONFIDENCE).length);

function setPreparations(item: ParsedItem, value: string): void {
  item.preparations = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function addManual(): void {
  items.value = [
    ...items.value,
    {
      id: uid('item'),
      title: '',
      date: new Date().toISOString().slice(0, 10),
      time: '09:00',
      institution: 'kindergarten',
      preparations: [],
      confidence: 1,
      sourceLine: '직접 추가',
      selected: true,
    },
  ];
}

function approve(): void {
  if (!mail.value) return;
  if (items.value.some((i) => i.selected && !i.title.trim())) {
    window.alert('제목이 비어 있는 항목이 있습니다. 확인해 주세요.');
    return;
  }
  const created = store.approveMail(mail.value.id, items.value);
  window.alert(`${created.length}건의 일정을 등록했습니다.`);
  void router.push('/home');
}

function saveDraft(): void {
  if (!mail.value) return;
  store.updateMail(mail.value.id, { parsedItems: items.value, reviewStatus: 'edited' });
  window.alert('수정 내용을 저장했습니다.');
}

function discard(): void {
  if (!mail.value) return;
  store.discardMail(mail.value.id);
  void router.push('/mail');
}
</script>

<template>
  <template v-if="mail">
    <TopBar title="AI 파싱 검토" :subtitle="`${mail.subject} · ${items.length}건 추출`" back>
      <template #actions>
        <button class="icon-btn" aria-label="원문 보기" @click="showRaw = !showRaw">📄</button>
      </template>
    </TopBar>

    <div class="screen">
      <div class="card" style="border-color: var(--primary)">
        <p class="small" style="margin: 0">
          AI가 추출한 결과입니다. <strong>승인하기 전까지 일정으로 등록되지 않습니다.</strong><br />
          선택 {{ selectedCount }}건<template v-if="lowCount > 0"> · 확인 필요 {{ lowCount }}건</template>
        </p>
      </div>

      <div v-if="showRaw" class="card">
        <p class="section-title" style="margin: 0 0 8px">메일 원문</p>
        <pre class="src-line" style="white-space: pre-wrap; margin: 0">{{ mail.rawEmail }}</pre>
      </div>

      <div v-if="items.length === 0" class="empty">
        <span class="big">🤖</span>
        일정 후보를 찾지 못했습니다.<br />
        직접 추가하거나 다른 본문으로 다시 시도해 보세요.
      </div>

      <div
        v-for="item in items"
        :key="item.id"
        class="card review-item"
        :class="{ low: item.confidence < LOW_CONFIDENCE, off: !item.selected }"
      >
        <div class="row between">
          <label class="row" style="gap: 8px">
            <input v-model="item.selected" type="checkbox" style="width: 18px; height: 18px" />
            <span class="small muted">{{ humanDate(item.date) }}</span>
          </label>
          <span class="badge" :class="item.confidence < LOW_CONFIDENCE ? 'warn' : 'ai'">
            {{ item.confidence < LOW_CONFIDENCE ? '확인 필요' : 'AI' }} {{ Math.round(item.confidence * 100) }}%
          </span>
        </div>

        <label class="field" style="margin-top: 10px">
          <span>일정명</span>
          <input v-model="item.title" type="text" />
        </label>

        <div class="grid2">
          <label class="field">
            <span>날짜</span>
            <input v-model="item.date" type="date" />
          </label>
          <label class="field">
            <span>시간</span>
            <input
              :value="item.time ?? ''"
              type="time"
              @input="item.time = ($event.target as HTMLInputElement).value || undefined"
            />
          </label>
        </div>

        <label class="field">
          <span>기관</span>
          <div class="chip-row">
            <button
              v-for="kind in institutions"
              :key="kind"
              class="chip"
              :class="{ on: item.institution === kind }"
              @click="item.institution = kind"
            >
              {{ INSTITUTION_LABEL[kind] }}
            </button>
          </div>
        </label>

        <label class="field" style="margin-bottom: 0">
          <span>🎒 준비물 (쉼표로 구분)</span>
          <input
            :value="item.preparations.join(', ')"
            type="text"
            placeholder="예: 도시락, 물통"
            @input="setPreparations(item, ($event.target as HTMLInputElement).value)"
          />
        </label>

        <p class="src-line">원문: {{ item.sourceLine }}</p>
        <button class="btn danger block" style="margin-top: 10px" @click="items = items.filter((i) => i.id !== item.id)">
          이 항목 삭제
        </button>
      </div>

      <button class="btn block" style="margin-top: 12px" @click="addManual">+ 항목 직접 추가</button>

      <div class="row" style="margin-top: 18px; gap: 8px">
        <button class="btn grow" @click="discard">버리기</button>
        <button class="btn grow" @click="saveDraft">임시 저장</button>
        <button class="btn primary grow" :disabled="selectedCount === 0" @click="approve">등록 승인 ({{ selectedCount }})</button>
      </div>
    </div>
  </template>

  <template v-else>
    <TopBar title="AI 파싱 검토" back />
    <div class="screen"><div class="empty">메일을 찾을 수 없습니다.</div></div>
  </template>
</template>
