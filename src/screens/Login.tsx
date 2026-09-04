import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../store/AppStore';
import { ensurePermission } from '../lib/notifications';

/**
 * 로그인 화면. 계정 서버가 없는 단계라 "보호자 프로필"을 로컬에 저장하는 형태로 둔다.
 * 실제 인증이 붙으면 이 화면만 교체하면 되고 이후 흐름은 그대로다.
 */
export function Login() {
  const navigate = useNavigate();
  const { updateSettings } = useApp();
  const [name, setName] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    updateSettings({ profileName: name.trim() || '보호자' });
    await ensurePermission();
    navigate('/home', { replace: true });
  };

  return (
    <div className="center-screen">
      <form onSubmit={submit} style={{ width: '100%', maxWidth: 340 }}>
        <div className="logo">🧸</div>
        <p className="brand">하루동행</p>
        <p className="muted small" style={{ marginBottom: 24 }}>
          아이 일정과 준비물을 놓치지 않도록 도와드려요.
        </p>
        <label className="field">
          <span>보호자 이름</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 지우 엄마" />
        </label>
        <button className="btn primary block" type="submit">
          시작하기
        </button>
        <p className="muted small" style={{ marginTop: 12 }}>
          시작하면 알림 권한을 요청합니다. 거부해도 앱 안에서 알림 카드로 받아볼 수 있어요.
        </p>
      </form>
    </div>
  );
}
