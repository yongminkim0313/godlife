import { ref } from 'vue';
import { gmailProvider } from '../lib/mail/gmail';
import type { MailAccount, MailProvider } from '../lib/mail/types';

/** 메일 계정 연결 상태를 화면 두 곳(메일 가져오기·설정)에서 같이 쓰기 위한 컴포저블. */
export function useMailAccount(provider: MailProvider = gmailProvider) {
  const account = ref<MailAccount | null>(provider.account());
  const configured = ref(provider.isConfigured());
  const connecting = ref(false);
  const error = ref('');

  function refresh(): void {
    account.value = provider.account();
    configured.value = provider.isConfigured();
  }

  async function connect(): Promise<void> {
    connecting.value = true;
    error.value = '';
    try {
      account.value = await provider.connect();
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '메일 계정을 연결하지 못했습니다.';
    } finally {
      connecting.value = false;
      configured.value = provider.isConfigured();
    }
  }

  function disconnect(): void {
    provider.disconnect();
    account.value = null;
    error.value = '';
  }

  return { provider, account, configured, connecting, error, connect, disconnect, refresh };
}
