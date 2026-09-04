import { useNavigate } from 'react-router-dom';
import { useApp } from '../store/AppStore';

/**
 * 알림 발생 화면 (기획서 4장 "알림 발생 (푸시) → 완료/미완료 분기").
 *
 * OS 알림 권한이 없거나 앱이 포그라운드일 때도 같은 분기를 제공해야 해서,
 * 발화된 알림은 항상 여기 카드로도 쌓인다.
 *
 * 분기는 알림 종류에 따라 다르다. 사전 알림(5·10분·하루 전)은 아직 일정이 시작도
 * 안 했으므로 완료/미완료를 물으면 안 된다. 완료 여부는 일정이 끝난 뒤의
 * 실천 확인·재알림에서만 묻는다.
 */
export function NotificationInbox() {
  const navigate = useNavigate();
  const { inbox, resolveInbox, dismissInbox } = useApp();
  if (inbox.length === 0) return null;

  return (
    <div className="inbox" role="region" aria-label="알림">
      {inbox.slice(0, 2).map((entry) => {
        const asksCompletion = entry.record.type === 'snooze';
        return (
          <div key={entry.record.id} className={`toast ${entry.record.type}`}>
            <button className="toast-close" onClick={() => dismissInbox(entry.record.id)} aria-label="알림 닫기">
              ×
            </button>
            <h4>
              {entry.record.type === 'preparation' && '🎒 '}
              {entry.record.type === 'snooze' && '🔁 '}
              {entry.title}
            </h4>
            <p>{entry.body}</p>
            <div className="actions">
              {asksCompletion ? (
                <>
                  <button className="btn primary" onClick={() => resolveInbox(entry.record.id, 'done')}>
                    완료
                  </button>
                  <button className="btn" onClick={() => resolveInbox(entry.record.id, 'missed')}>
                    미완료 · 재알림
                  </button>
                </>
              ) : (
                <>
                  <button className="btn primary" onClick={() => dismissInbox(entry.record.id)}>
                    확인
                  </button>
                  {entry.occurrence && (
                    <button
                      className="btn"
                      onClick={() => {
                        dismissInbox(entry.record.id);
                        navigate(`/schedule/${entry.occurrence!.scheduleId}/${entry.occurrence!.date}`);
                      }}
                    >
                      일정 보기
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}
      {inbox.length > 2 && <p className="inbox-more small muted">알림 {inbox.length - 2}건 더 있음</p>}
    </div>
  );
}
