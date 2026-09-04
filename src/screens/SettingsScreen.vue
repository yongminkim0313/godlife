<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import TopBar from '../components/TopBar.vue';
import { useAppStore } from '../stores/app';
import { useMailAccount } from '../composables/useMailAccount';
import { INSTITUTION_LABEL } from '../types';
import type { InstitutionKind, Region } from '../types';
import { offsetLabel } from '../lib/date';
import { OFFSET_CHOICES, ensurePermission } from '../lib/notifications';
import { PRESET_REGIONS, searchRegion } from '../lib/weather';
import { getGoogleClientId, setGoogleClientId } from '../lib/mail/gmail';

const store = useAppStore();
const router = useRouter();
const mail = useMailAccount();
const institutions: InstitutionKind[] = ['kindergarten', 'daycare', 'home'];

const permission = ref(typeof Notification === 'undefined' ? 'denied' : Notification.permission);
const query = ref('');
const results = ref<Region[]>([]);
const searching = ref(false);
const searchError = ref('');
const clientId = ref(getGoogleClientId());
const clientIdSaved = ref(false);

function toggleOffset(offset: number): void {
  const current = store.settings.defaultOffsets;
  store.updateSettings({
    defaultOffsets: current.includes(offset) ? current.filter((o) => o !== offset) : [...current, offset],
  });
}

function pickRegion(region: Region): void {
  store.updateSettings({ region });
  results.value = [];
  query.value = '';
  void store.refreshWeather(true);
}

async function search(): Promise<void> {
  if (!query.value.trim()) return;
  searching.value = true;
  searchError.value = '';
  try {
    results.value = await searchRegion(query.value.trim());
  } catch {
    searchError.value = '지역을 검색하지 못했습니다. 오프라인이면 아래 목록에서 골라 주세요.';
  } finally {
    searching.value = false;
  }
}

function saveClientId(): void {
  setGoogleClientId(clientId.value);
  clientIdSaved.value = true;
  mail.refresh();
  window.setTimeout(() => (clientIdSaved.value = false), 2000);
}

function loadSample(): void {
  if (window.confirm('샘플 일정과 계획표 메일로 덮어쓸까요?')) store.loadSampleData();
}

function reset(): void {
  if (!window.confirm('저장된 모든 데이터를 삭제할까요?')) return;
  store.resetAll();
  void router.replace('/login');
}
</script>

<template>
  <TopBar title="설정" />
  <div class="screen">
    <p class="section-title">계정</p>
    <div class="card">
      <label class="field" style="margin-bottom: 0">
        <span>보호자 이름</span>
        <input
          :value="store.settings.profileName ?? ''"
          type="text"
          placeholder="보호자"
          @input="store.updateSettings({ profileName: ($event.target as HTMLInputElement).value })"
        />
      </label>
    </div>

    <p class="section-title">메일 계정</p>
    <div class="card">
      <div v-if="mail.account.value" class="row between">
        <div class="grow">
          <strong class="small">{{ mail.provider.label }} 연결됨</strong>
          <p class="muted small" style="margin: 4px 0 0">{{ mail.account.value.email }} · 읽기 전용</p>
        </div>
        <button class="btn" @click="mail.disconnect">연결 해제</button>
      </div>
      <div v-else class="row between">
        <span class="small">{{ mail.provider.label }} 연결 안 됨</span>
        <button class="btn" :disabled="!mail.configured.value || mail.connecting.value" @click="mail.connect()">
          {{ mail.connecting.value ? '연결 중…' : '연결' }}
        </button>
      </div>
      <p v-if="mail.error.value" class="small" style="color: var(--danger)">{{ mail.error.value }}</p>

      <label class="field" style="margin: 14px 0 0">
        <span>구글 OAuth 클라이언트 ID</span>
        <input v-model="clientId" type="text" placeholder="000000-xxxx.apps.googleusercontent.com" />
      </label>
      <button class="btn block" style="margin-top: 8px" @click="saveClientId">
        {{ clientIdSaved ? '저장됨' : '클라이언트 ID 저장' }}
      </button>
      <p class="muted small" style="margin: 10px 0 0">
        Google Cloud 콘솔에서 <strong>웹 애플리케이션</strong> OAuth 클라이언트를 만들고, 승인된 자바스크립트 원본에 이 앱 주소를
        넣은 뒤 클라이언트 ID를 붙여넣으세요. 클라이언트 ID는 비밀값이 아니며 기기에만 저장됩니다. Gmail 읽기 권한만 요청하고,
        메일 본문은 기기 안에서만 처리됩니다.
      </p>
    </div>

    <p class="section-title">알림</p>
    <div class="card">
      <span class="small muted">기본 알림 시점</span>
      <div class="chip-row" style="margin-top: 8px">
        <button
          v-for="offset in OFFSET_CHOICES"
          :key="offset"
          class="chip"
          :class="{ on: store.settings.defaultOffsets.includes(offset) }"
          @click="toggleOffset(offset)"
        >
          {{ offsetLabel(offset) }}
        </button>
      </div>

      <div class="toggle" style="margin-top: 12px">
        <span class="small">하루 전 알림에 준비물 첨부</span>
        <input
          :checked="store.settings.preparationReminder"
          type="checkbox"
          @change="store.updateSettings({ preparationReminder: ($event.target as HTMLInputElement).checked })"
        />
      </div>

      <div class="grid2" style="margin-top: 12px">
        <label class="field" style="margin-bottom: 0">
          <span>재알림 간격(분)</span>
          <input
            :value="store.settings.snoozeMinutes"
            type="number"
            min="1"
            max="180"
            @input="store.updateSettings({ snoozeMinutes: Math.max(1, Number(($event.target as HTMLInputElement).value) || 1) })"
          />
        </label>
        <label class="field" style="margin-bottom: 0">
          <span>재알림 최대 횟수</span>
          <input
            :value="store.settings.maxSnooze"
            type="number"
            min="0"
            max="10"
            @input="store.updateSettings({ maxSnooze: Math.max(0, Number(($event.target as HTMLInputElement).value) || 0) })"
          />
        </label>
      </div>

      <div class="row between" style="margin-top: 14px">
        <span class="small muted">
          기기 알림 권한: {{ permission === 'granted' ? '허용됨' : permission === 'denied' ? '거부됨' : '미설정' }}
        </span>
        <button v-if="permission !== 'granted'" class="btn" @click="ensurePermission().then((p) => (permission = p))">
          요청
        </button>
      </div>
    </div>

    <p class="section-title">기관 관리</p>
    <div class="card">
      <div class="chip-row">
        <button
          v-for="kind in institutions"
          :key="kind"
          class="chip"
          :class="{ on: store.settings.institutionFilter.includes(kind) }"
          @click="store.toggleInstitution(kind)"
        >
          {{ INSTITUTION_LABEL[kind] }}
        </button>
      </div>
      <p class="muted small" style="margin: 10px 0 0">홈·달력에서 보여줄 기관을 선택합니다.</p>
    </div>

    <p class="section-title">날씨</p>
    <div class="card">
      <div class="toggle">
        <span class="small">일정에 날씨 표시</span>
        <input
          :checked="store.settings.weatherEnabled"
          type="checkbox"
          @change="store.updateSettings({ weatherEnabled: ($event.target as HTMLInputElement).checked })"
        />
      </div>

      <p class="small" style="margin: 12px 0 6px">
        현재 지역: <strong>{{ store.settings.region.name }}</strong>
      </p>
      <div class="row">
        <input v-model="query" type="text" class="grow" placeholder="지역 검색 (예: 청주)" @keydown.enter="search" />
        <button class="btn" :disabled="searching || !store.online" @click="search">{{ searching ? '검색 중' : '검색' }}</button>
      </div>
      <p v-if="searchError" class="small" style="color: var(--danger)">{{ searchError }}</p>
      <div v-if="results.length > 0" class="chip-row" style="margin-top: 10px">
        <button v-for="region in results" :key="`${region.latitude},${region.longitude}`" class="chip" @click="pickRegion(region)">
          {{ region.name }}
        </button>
      </div>
      <div class="chip-row" style="margin-top: 10px">
        <button
          v-for="region in PRESET_REGIONS"
          :key="region.name"
          class="chip"
          :class="{ on: store.settings.region.name === region.name }"
          @click="pickRegion(region)"
        >
          {{ region.name }}
        </button>
      </div>
      <button class="btn block" style="margin-top: 12px" :disabled="!store.online" @click="store.refreshWeather(true)">
        예보 새로고침
      </button>
      <p class="muted small" style="margin: 10px 0 0">
        {{
          store.weather ? `마지막 갱신: ${new Date(store.weather.cachedAt).toLocaleString('ko-KR')}` : '아직 예보를 받지 못했습니다.'
        }}
      </p>
    </div>

    <p class="section-title">동기화 · 데이터</p>
    <div class="card">
      <div class="row between">
        <span class="small">연결 상태</span>
        <span class="badge" :class="store.online ? 'ok' : 'warn'">{{ store.online ? '온라인' : '오프라인' }}</span>
      </div>
      <div class="row between" style="margin-top: 8px">
        <span class="small">동기화 대기</span>
        <span class="badge">{{ store.pendingSync }}건</span>
      </div>
      <div class="row between" style="margin-top: 8px">
        <span class="small">마지막 동기화</span>
        <span class="badge">{{ store.lastSyncedAt ? new Date(store.lastSyncedAt).toLocaleString('ko-KR') : '없음' }}</span>
      </div>
      <p class="muted small" style="margin-top: 10px">
        일정·계획표·날씨는 기기에 저장되어 오프라인에서도 조회됩니다. 온라인이 되면 마지막 저장 우선으로 병합합니다.
      </p>
      <div class="row" style="gap: 8px">
        <button class="btn grow" @click="router.push('/widget')">위젯 미리보기</button>
        <button class="btn grow" @click="loadSample">샘플 불러오기</button>
      </div>
      <button class="btn danger block" style="margin-top: 8px" @click="reset">전체 초기화</button>
    </div>
  </div>
</template>
