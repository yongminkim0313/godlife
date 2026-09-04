import { useNavigate } from 'react-router-dom';
import type { DailyForecast, Occurrence } from '../types';
import { INSTITUTION_COLOR, INSTITUTION_LABEL } from '../types';
import { relativeLabel, toTimeLabel } from '../lib/date';
import { WeatherBadge } from './WeatherBadge';

interface Props {
  occurrence: Occurrence;
  forecast?: DailyForecast;
  showRelative?: boolean;
}

export function ScheduleCard({ occurrence, forecast, showRelative }: Props) {
  const navigate = useNavigate();
  const { schedule } = occurrence;
  const done = occurrence.status === 'done';

  return (
    <div className="card">
      <button
        className={`sched ${done ? 'done' : ''}`}
        style={{ background: 'none', border: 'none', padding: 0 }}
        onClick={() => navigate(`/schedule/${schedule.id}/${occurrence.date}`)}
      >
        <span className="bar" style={{ background: INSTITUTION_COLOR[schedule.institution] }} />
        <span className="grow">
          <span className="time">
            {schedule.isAllDay ? '종일' : `${toTimeLabel(occurrence.startAt)} – ${toTimeLabel(occurrence.endAt)}`}
            {showRelative && occurrence.status === 'planned' && ` · ${relativeLabel(occurrence.startAt)}`}
          </span>
          <p className="title">{schedule.title}</p>
          <span className="meta">
            <span className="badge">{INSTITUTION_LABEL[schedule.institution]}</span>
            {schedule.sourceType === 'mail-ai' && <span className="badge ai">AI 등록</span>}
            {occurrence.status === 'done' && <span className="badge ok">완료</span>}
            {occurrence.status === 'missed' && <span className="badge danger">미완료</span>}
            {schedule.preparations.length > 0 && (
              <span className="badge">🎒 준비물 {schedule.preparations.filter((p) => !p.checked).length}/{schedule.preparations.length}</span>
            )}
            <WeatherBadge forecast={forecast} />
          </span>
        </span>
      </button>
    </div>
  );
}
