import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../store/AppStore';

export function Splash() {
  const navigate = useNavigate();
  const { ready, settings } = useApp();

  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => {
      navigate(settings.profileName ? '/home' : '/login', { replace: true });
    }, 900);
    return () => window.clearTimeout(timer);
  }, [ready, settings.profileName, navigate]);

  return (
    <div className="center-screen">
      <div>
        <div className="logo">🧸</div>
        <p className="brand">하루동행</p>
        <p className="muted small">어린이집·유치원 일정을 한곳에서</p>
      </div>
    </div>
  );
}
