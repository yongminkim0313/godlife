import { useNavigate, useParams } from 'react-router-dom';
import { TopBar } from '../components/TopBar';
import { PreparationList } from '../components/PreparationList';
import { WeatherBadge } from '../components/WeatherBadge';
import { useApp } from '../store/AppStore';
import { INSTITUTION_LABEL } from '../types';
import { humanDate, offsetLabel, toTimeLabel } from '../lib/date';
import { repeatLabel } from '../lib/repeat';
import { forecastFor, isWetForecast } from '../lib/weather';

/** 일정 상세 (완료 체크, 준비물 메모, 알림 설정 진입). */
export function ScheduleDetail() {
  const { id = '', date = '' } = useParams();
  const navigate = useNavigate();
  const { findOccurrence, weather, settings, setOccurrenceStatus, togglePreparation, deleteSchedule, excludeOccurrence, notifications } =
    useApp();

  const occurrence = findOccurrence(id, date);
  if (!occurrence) {
    return (
      <>
        <TopBar title="일정" back />
        <div className="screen">
          <div className="empty">
            <span className="big">🔍</span>
            일정을 찾을 수 없습니다.
          </div>
        </div>
      </>
    );
  }

  const { schedule } = occurrence;
  const forecast = forecastFor(weather, occurrence.date);
  const scheduled = notifications
    .filter((n) => n.scheduleId === schedule.id && n.date === occurrence.date && n.offset > 0)
    .sort((a, b) => b.offset - a.offset);

  const remove = () => {
    if (schedule.repeatRule.freq === 'weekly') {
      if (window.confirm('이 반복 일정 전체를 삭제할까요? (취소를 누르면 이 날짜만 제외합니다)')) deleteSchedule(schedule.id);
      else excludeOccurrence(schedule.id, occurrence.date);
    } else if (window.confirm('이 일정을 삭제할까요?')) {
      deleteSchedule(schedule.id);
    }
    navigate('/home');
  };

  return (
    <>
      <TopBar
        title={schedule.title}
        subtitle={`${humanDate(occurrence.date)} · ${schedule.isAllDay ? '종일' : `${toTimeLabel(occurrence.startAt)} – ${toTimeLabel(occurrence.endAt)}`}`}
        back
        actions={
          <button className="icon-btn" onClick={() => navigate(`/schedule/${schedule.id}/edit`)} aria-label="수정">
            ✏️
          </button>
        }
      />
      <div className="screen">
        <div className="card">
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            <span className="badge">{INSTITUTION_LABEL[schedule.institution]}</span>
            <span className="badge">{repeatLabel(schedule.repeatRule)}</span>
            <span className="badge ai">{schedule.sourceType === 'mail-ai' ? '메일 AI 등록' : '직접 등록'}</span>
            {occurrence.status === 'done' && <span className="badge ok">완료</span>}
            {occurrence.status === 'missed' && <span className="badge danger">미완료</span>}
            {settings.weatherEnabled && <WeatherBadge forecast={forecast} />}
          </div>
          {schedule.memo && <p className="small" style={{ marginBottom: 0, marginTop: 12 }}>{schedule.memo}</p>}
          {settings.weatherEnabled && forecast && isWetForecast(forecast) && (
            <p className="small" style={{ marginBottom: 0, marginTop: 10, color: 'var(--warn)' }}>
              ☔ 비/눈 예보가 있습니다. 야외 활동이라면 우비·여벌 옷을 챙겨 주세요.
            </p>
          )}
        </div>

        <p className="section-title">실천 체크</p>
        <div className="card">
          <div className="row">
            <button
              className={`btn grow ${occurrence.status === 'done' ? 'primary' : ''}`}
              onClick={() => setOccurrenceStatus(schedule.id, occurrence.date, occurrence.status === 'done' ? 'planned' : 'done')}
            >
              {occurrence.status === 'done' ? '완료됨' : '완료로 표시'}
            </button>
            <button
              className={`btn grow ${occurrence.status === 'missed' ? 'danger' : ''}`}
              onClick={() => setOccurrenceStatus(schedule.id, occurrence.date, occurrence.status === 'missed' ? 'planned' : 'missed')}
            >
              미완료
            </button>
          </div>
          <p className="muted small" style={{ marginTop: 10, marginBottom: 0 }}>
            미완료로 두면 {settings.snoozeMinutes}분 뒤 재알림이 옵니다 (최대 {settings.maxSnooze}회).
          </p>
        </div>

        <p className="section-title">🎒 준비물</p>
        <div className="card">
          <PreparationList preparations={schedule.preparations} onToggle={(prepId) => togglePreparation(schedule.id, prepId)} />
        </div>

        <p className="section-title">
          알림
          <button className="chip" onClick={() => navigate(`/schedule/${schedule.id}/${occurrence.date}/notifications`)}>
            설정
          </button>
        </p>
        <div className="card">
          {scheduled.length === 0 ? (
            <p className="muted small" style={{ margin: 0 }}>
              설정된 알림이 없습니다.
            </p>
          ) : (
            scheduled.map((n) => (
              <div key={n.id} className="row between" style={{ padding: '6px 0' }}>
                <span className="small">
                  {offsetLabel(n.offset)}
                  {n.type === 'preparation' && ' · 준비물 포함'}
                  {n.weatherAlert && ' · ☔ 우천'}
                </span>
                <span className="badge">{n.firedAt ? '발송됨' : new Date(n.fireAt).toLocaleString('ko-KR')}</span>
              </div>
            ))
          )}
        </div>

        <button className="btn danger block" onClick={remove} style={{ marginTop: 20 }}>
          일정 삭제
        </button>
      </div>
    </>
  );
}
