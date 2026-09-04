import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { TopBar } from '../components/TopBar';
import { useApp } from '../store/AppStore';
import { offsetLabel } from '../lib/date';
import { OFFSET_CHOICES, ensurePermission } from '../lib/notifications';

/** 일정별 알림 설정 (기획서 4장 '알림 설정' 화면). */
export function NotificationSettings() {
  const { id = '', date = '' } = useParams();
  const navigate = useNavigate();
  const { schedules, settings, updateSchedule } = useApp();
  const schedule = schedules.find((s) => s.id === id);
  const [offsets, setOffsets] = useState<number[]>(schedule?.notificationOffsets ?? settings.defaultOffsets);
  const [permission, setPermission] = useState(typeof Notification === 'undefined' ? 'denied' : Notification.permission);

  if (!schedule) {
    return (
      <>
        <TopBar title="알림 설정" back />
        <div className="screen">
          <div className="empty">일정을 찾을 수 없습니다.</div>
        </div>
      </>
    );
  }

  const save = () => {
    updateSchedule(schedule.id, { notificationOffsets: offsets });
    navigate(`/schedule/${schedule.id}/${date}`, { replace: true });
  };

  return (
    <>
      <TopBar title="알림 설정" subtitle={schedule.title} back />
      <div className="screen">
        <div className="card">
          <p className="small muted" style={{ marginTop: 0 }}>
            여러 개를 함께 켤 수 있습니다. 하루 전 알림에는 준비물이 자동으로 첨부됩니다.
          </p>
          <div className="chip-row">
            {OFFSET_CHOICES.map((offset) => (
              <button
                key={offset}
                className={`chip ${offsets.includes(offset) ? 'on' : ''}`}
                onClick={() => setOffsets((prev) => (prev.includes(offset) ? prev.filter((o) => o !== offset) : [...prev, offset]))}
              >
                {offsetLabel(offset)}
              </button>
            ))}
          </div>
        </div>

        <p className="section-title">기기 알림 권한</p>
        <div className="card">
          <div className="row between">
            <span className="small">
              {permission === 'granted' ? '허용됨 · OS 알림으로 전달됩니다.' : '미허용 · 앱 안에서 알림 카드로 표시됩니다.'}
            </span>
            {permission !== 'granted' && (
              <button
                className="btn"
                onClick={async () => {
                  setPermission(await ensurePermission());
                }}
              >
                권한 요청
              </button>
            )}
          </div>
        </div>

        <button className="btn primary block" onClick={save} style={{ marginTop: 20 }}>
          저장
        </button>
      </div>
    </>
  );
}
