<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import TopBar from '../components/TopBar.vue';
import { useAppStore } from '../stores/app';
import { useMailAccount } from '../composables/useMailAccount';
import { MailAuthError } from '../lib/mail/types';
import type { MailSummary } from '../lib/mail/types';
import { SAMPLE_MAIL } from '../lib/sample';
import { humanDate, toDateKey } from '../lib/date';

/**
 * 메일 가져오기 (기획서 핵심요구 2).
 *
 * 두 경로를 모두 지원한다.
 *  - 메일 계정 연동: Gmail 읽기 전용 연결 후 계획표 메일을 골라 가져온다.
 *  - 직접 붙여넣기: 연동을 쓰지 않거나 다른 메일함에서 받은 본문을 그대로 넣는다.
 * 어느 쪽이든 이후 흐름(AI 파싱 -> 검토 -> 승인 -> 등록)은 동일하다.
 */
const store = useAppStore();
const router = useRouter();
const { provider, account, configured, connecting, error, connect, disconnect, refresh } = useMailAccount();

const STATUS_LABEL: Record<string, string> = {
  pending: '검토 대기',
  approved: '등록 완료',
  edited: '수정됨',
  discarded: '버림',
};

// 연동을 설정해 둔 사용자는 계정 탭에서, 아직 안 한 사용자는 붙여넣기에서 시작한다.
const tab = ref<'account' | 'paste'>(account.value || configured.value ? 'account' : 'paste');
const subject = ref('');
const body = ref('');

const query = ref('');
const messages = ref<MailSummary[]>([]);
const loading = ref(false);
const listError = ref('');
const importingId = ref('');

function runPaste(): void {
  if (!body.value.trim()) return;
  const mail = store.importMail(subject.value.trim() || '제목 없는 계획표', body.value);
  void router.push(`/mail/${mail.id}/review`);
}

async function loadMessages(search?: string): Promise<void> {
  loading.value = true;
  listError.value = '';
  try {
    messages.value = await provider.list({ query: search });
  } catch (cause) {
    if (cause instanceof MailAuthError) disconnect();
    listError.value = cause instanceof Error ? cause.message : '메일을 불러오지 못했습니다.';
  } finally {
    loading.value = false;
  }
}

async function importFromAccount(summary: MailSummary): Promise<void> {
  importingId.value = summary.id;
  listError.value = '';
  try {
    const message = await provider.fetch(summary.id);
    if (!message.body.trim()) {
      listError.value =
        message.attachments.length > 0
          ? `본문이 비어 있고 첨부파일(${message.attachments.join(', ')})만 있는 메일입니다. 첨부 계획표는 아직 읽지 못해요.`
          : '본문이 비어 있어 가져올 내용이 없습니다.';
      return;
    }
    const mail = store.importMail(message.subject, message.body, { receivedAt: message.receivedAt });
    void router.push(`/mail/${mail.id}/review`);
  } catch (cause) {
    if (cause instanceof MailAuthError) disconnect();
    listError.value = cause instanceof Error ? cause.message : '메일을 가져오지 못했습니다.';
  } finally {
    importingId.value = '';
  }
}

// 연결되면 계획표로 보이는 메일을 바로 훑어온다.
function syncList(): void {
  if (account.value) void loadMessages();
  else messages.value = [];
}
onMounted(syncList);
watch(account, syncList);
</script>

<template>
  <TopBar title="메일 가져오기" subtitle="월 계획표를 AI가 읽어 일정 후보를 뽑아냅니다" />
  <div class="screen">
    <div class="chip-row" role="tablist">
      <button class="chip" :class="{ on: tab === 'account' }" role="tab" @click="tab = 'account'">메일 계정</button>
      <button class="chip" :class="{ on: tab === 'paste' }" role="tab" @click="tab = 'paste'">직접 붙여넣기</button>
    </div>

    <template v-if="tab === 'account'">
      <div class="card" style="margin-top: 12px">
        <template v-if="!configured">
          <strong class="small">메일 계정 연동을 아직 설정하지 않았습니다</strong>
          <p class="muted small">
            구글 OAuth 클라이언트 ID를 등록하면 Gmail에서 계획표 메일을 바로 가져올 수 있습니다. 등록 전에는 아래
            <strong>직접 붙여넣기</strong>로 사용해 주세요.
          </p>
          <div class="row" style="gap: 8px">
            <button class="btn primary grow" @click="router.push('/settings')">설정에서 등록</button>
            <button class="btn grow" @click="tab = 'paste'">붙여넣기로 하기</button>
          </div>
        </template>

        <template v-else-if="account">
          <div class="row between">
            <div class="grow">
              <strong class="small">{{ provider.label }} 연결됨</strong>
              <p class="muted small" style="margin: 4px 0 0">{{ account.email }} · 읽기 전용</p>
            </div>
            <button class="btn" @click="disconnect">연결 해제</button>
          </div>
          <div class="row" style="margin-top: 12px">
            <input
              v-model="query"
              type="text"
              class="grow"
              placeholder="검색어 (비우면 계획표 메일 자동 검색)"
              @keydown.enter="loadMessages(query)"
            />
            <button class="btn" :disabled="loading" @click="loadMessages(query)">{{ loading ? '조회 중' : '조회' }}</button>
          </div>
        </template>

        <template v-else>
          <strong class="small">{{ provider.label }} 계정 연결</strong>
          <p class="muted small">
            받은 편지함에서 계획표로 보이는 메일만 <strong>읽기 전용</strong>으로 가져옵니다. 메일 본문은 기기 안에서만 처리되고
            외부로 보내지 않습니다.
          </p>
          <button class="btn primary block" :disabled="connecting" @click="connect()">
            {{ connecting ? '연결 중…' : '구글 계정으로 연결' }}
          </button>
        </template>

        <p v-if="error" class="small" style="color: var(--danger); margin-bottom: 0">{{ error }}</p>
      </div>

      <div v-if="listError" class="card" style="border-color: var(--warn)">
        <p class="small" style="margin: 0">{{ listError }}</p>
      </div>

      <template v-if="account">
        <p class="section-title">
          받은 계획표 메일 <span class="muted small">{{ messages.length }}건</span>
        </p>
        <p v-if="loading && messages.length === 0" class="muted small">메일을 불러오는 중…</p>
        <div v-if="!loading && messages.length === 0 && !listError" class="empty">
          <span class="big">🔍</span>
          계획표로 보이는 메일을 찾지 못했습니다.<br />
          검색어를 바꾸거나 붙여넣기로 등록해 보세요.
        </div>
        <div v-for="message in messages" :key="message.id" class="card">
          <strong class="small">{{ message.subject }}</strong>
          <p class="muted small" style="margin: 4px 0 0">
            {{ message.from }} · {{ humanDate(toDateKey(new Date(message.receivedAt))) }}
          </p>
          <p v-if="message.snippet" class="src-line" style="margin-bottom: 0">{{ message.snippet }}</p>
          <p v-if="message.attachments.length > 0" class="muted small" style="margin: 8px 0 0">
            📎 {{ message.attachments.join(', ') }}
          </p>
          <button
            class="btn primary block"
            style="margin-top: 10px"
            :disabled="importingId === message.id"
            @click="importFromAccount(message)"
          >
            {{ importingId === message.id ? '가져오는 중…' : 'AI로 분석' }}
          </button>
        </div>
      </template>
    </template>

    <div v-else class="card" style="margin-top: 12px">
      <label class="field">
        <span>메일 제목</span>
        <input v-model="subject" type="text" placeholder="3월 유치원 월간 교육계획표" />
      </label>
      <label class="field">
        <span>메일 본문</span>
        <textarea v-model="body" placeholder="받은 계획표 본문을 그대로 붙여넣으세요." />
      </label>
      <div class="row">
        <button class="btn grow" @click="body = SAMPLE_MAIL(new Date())">샘플 넣기</button>
        <button class="btn primary grow" :disabled="!body.trim()" @click="runPaste">AI로 분석</button>
      </div>
    </div>

    <p class="muted small" style="margin: 12px 2px 0">
      분석 결과는 바로 등록되지 않습니다. 다음 화면에서 확인·수정한 뒤 승인해야 일정이 됩니다.
    </p>

    <p class="section-title">
      가져온 메일
      <button class="chip" @click="refresh">상태 새로고침</button>
    </p>
    <div v-if="store.mails.length === 0" class="empty">
      <span class="big">📩</span>
      아직 가져온 계획표가 없습니다.
    </div>
    <div v-for="mail in store.mails" :key="mail.id" class="card">
      <div class="row between">
        <div class="grow">
          <strong class="small">{{ mail.subject }}</strong>
          <p class="muted small" style="margin: 4px 0 0">
            {{ new Date(mail.receivedAt).toLocaleDateString('ko-KR') }} · 추출 {{ mail.parsedItems.length }}건
          </p>
        </div>
        <span class="badge" :class="{ warn: mail.reviewStatus === 'pending', ok: mail.reviewStatus === 'approved' }">
          {{ STATUS_LABEL[mail.reviewStatus] }}
        </span>
      </div>
      <button class="btn block" style="margin-top: 10px" @click="router.push(`/mail/${mail.id}/review`)">
        {{ mail.reviewStatus === 'pending' ? '검토하기' : '다시 보기' }}
      </button>
    </div>
  </div>
</template>
