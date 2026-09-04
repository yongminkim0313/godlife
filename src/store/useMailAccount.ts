import { useCallback, useState } from 'react';
import { gmailProvider } from '../lib/mail/gmail';
import type { MailAccount, MailProvider } from '../lib/mail/types';

/** 메일 계정 연결 상태를 화면 두 곳(메일 가져오기·설정)에서 같이 쓰기 위한 훅. */
export function useMailAccount(provider: MailProvider = gmailProvider) {
  const [account, setAccount] = useState<MailAccount | null>(() => provider.account());
  const [configured, setConfigured] = useState(() => provider.isConfigured());
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(() => {
    setAccount(provider.account());
    setConfigured(provider.isConfigured());
  }, [provider]);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError('');
    try {
      setAccount(await provider.connect());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '메일 계정을 연결하지 못했습니다.');
    } finally {
      setConnecting(false);
      setConfigured(provider.isConfigured());
    }
  }, [provider]);

  const disconnect = useCallback(() => {
    provider.disconnect();
    setAccount(null);
    setError('');
  }, [provider]);

  return { provider, account, configured, connecting, error, connect, disconnect, refresh };
}
