<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAppStore } from '../stores/app';
import { ensurePermission } from '../lib/notifications';

/**
 * 로그인 화면. 계정 서버가 없는 단계라 "보호자 프로필"을 로컬에 저장하는 형태로 둔다.
 * 실제 인증이 붙으면 이 화면만 교체하면 되고 이후 흐름은 그대로다.
 */
const store = useAppStore();
const router = useRouter();
const name = ref('');

async function submit(): Promise<void> {
  store.updateSettings({ profileName: name.value.trim() || '보호자' });
  await ensurePermission();
  void router.replace('/home');
}
</script>

<template>
  <div class="center-screen">
    <form style="width: 100%; max-width: 340px" @submit.prevent="submit">
      <div class="logo">🧸</div>
      <p class="brand">하루동행</p>
      <p class="muted small" style="margin-bottom: 24px">아이 일정과 준비물을 놓치지 않도록 도와드려요.</p>
      <label class="field">
        <span>보호자 이름</span>
        <input v-model="name" type="text" placeholder="예: 지우 엄마" />
      </label>
      <button class="btn primary block" type="submit">시작하기</button>
      <p class="muted small" style="margin-top: 12px">
        시작하면 알림 권한을 요청합니다. 거부해도 앱 안에서 알림 카드로 받아볼 수 있어요.
      </p>
    </form>
  </div>
</template>
