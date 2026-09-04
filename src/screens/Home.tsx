import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { TopBar } from '../components/TopBar';
import { InstitutionFilter } from '../components/InstitutionFilter';
import { ScheduleCard } from '../components/ScheduleCard';
import { useApp } from '../store/AppStore';
import { addDays, humanDate, relativeLabel, toDateKey, toTimeLabel } from '../lib/date';
import { describeWeather, forecastFor, isWetForecast } from '../lib/weather';

/** 홈 = 중심 허브. 다음 일정 + 날씨 + 오늘/다가오는 일정. */
export function Home() {
  const navigate = useNavigate();
  const { settings, weather, upcomingOccurrences, occurrencesBetween, mails, online, pendingSync } = useApp();

  const upcomingList = upcomingOccurrences(12);
  const next = upcomingList[0];
  const today = toDateKey(new Date());
  const todayList = useMemo(
    () => occurrencesBetween(new Date(new Date().setHours(0, 0, 0, 0)), new Date(new Date().setHours(23, 59, 59, 999))),
    [occurrencesBetween],
  );
  const later = upcomingList.filter((o) => o.date !== today);
  const pendingMails = mails.filter((m) => m.reviewStatus === 'pending');

  const nextForecast = next ? forecastFor(weather, next.date) : undefined;
  const wetSoon = useMemo(
    () =>
      upcomingList
        .slice(0, 6)
        .map((o) => ({ occurrence: o, forecast: forecastFor(weather, o.date) }))
        .find((x) => x.forecast && isWetForecast(x.forecast)),
    [upcomingList, weather],
  );

  return (
    <>
      <TopBar
        title={`안녕하세요, ${settings.profileName ?? '보호자'}님`}
        subtitle={online ? (pendingSync > 0 ? `동기화 대기 ${pendingSync}건` : '동기화 완료') : '오프라인 · 로컬 데이터'}
        actions={
          <button className="icon-btn" onClick={() => navigate('/widget')} aria-label="위젯 미리보기">
            🔲
          </button>
        }
      />
      <div className="screen">
        <InstitutionFilter />

        {next ? (
          <div className="hero" style={{ marginTop: 14 }}>
            <p className="label">다음 일정 · {relativeLabel(next.startAt)}</p>
            <h2>{next.schedule.title}</h2>
            <p className="when">
              {humanDate(next.date)} {next.schedule.isAllDay ? '종일' : toTimeLabel(next.startAt)}
            </p>
            {settings.weatherEnabled && nextForecast && (
              <div className="weather">
                <span style={{ fontSize: 20 }}>{describeWeather(nextForecast.code).icon}</span>
                <span>
                  {settings.region.name} · {describeWeather(nextForecast.code).label} {nextForecast.tempMin}°/{nextForecast.tempMax}°
                  {nextForecast.precipProbability > 0 && ` · 강수 ${nextForecast.precipProbability}%`}
                </span>
              </div>
            )}
            {next.schedule.preparations.length > 0 && (
              <p className="preps">🎒 {next.schedule.preparations.map((p) => p.text).join(', ')}</p>
            )}
          </div>
        ) : (
          <div className="card" style={{ marginTop: 14 }}>
            <div className="empty">
              <span className="big">🗓️</span>
              다가오는 일정이 없습니다.
              <br />
              일정을 등록하거나 월 계획표 메일을 가져와 보세요.
              <div className="row" style={{ marginTop: 16, gap: 8 }}>
                <button className="btn primary grow" onClick={() => navigate('/schedule/new')}>
                  일정 등록
                </button>
                <button className="btn grow" onClick={() => navigate('/mail')}>
                  메일 가져오기
                </button>
              </div>
            </div>
          </div>
        )}

        {settings.weatherEnabled && wetSoon?.forecast && (
          <div className="card" style={{ marginTop: 10, borderColor: 'var(--warn)' }}>
            <div className="row">
              <span style={{ fontSize: 20 }}>☔</span>
              <span className="grow small">
                <strong>{humanDate(wetSoon.occurrence.date)}</strong> {wetSoon.occurrence.schedule.title} 날 비/눈 예보가 있어요.
                우비·여벌 옷을 준비물에 추가해 두세요.
              </span>
            </div>
          </div>
        )}

        {pendingMails.length > 0 && (
          <>
            <p className="section-title">AI 검토 대기</p>
            {pendingMails.map((mail) => (
              <div className="card" key={mail.id}>
                <div className="row between">
                  <div className="grow">
                    <strong className="small">{mail.subject}</strong>
                    <p className="muted small" style={{ margin: '4px 0 0' }}>
                      추출 {mail.parsedItems.length}건 · 승인 전
                    </p>
                  </div>
                  <button className="btn primary" onClick={() => navigate(`/mail/${mail.id}/review`)}>
                    검토
                  </button>
                </div>
              </div>
            ))}
          </>
        )}

        <p className="section-title">
          오늘 <span className="muted small">{todayList.length}건</span>
        </p>
        {todayList.length === 0 ? (
          <p className="muted small" style={{ padding: '0 2px' }}>
            오늘은 등록된 일정이 없습니다.
          </p>
        ) : (
          todayList.map((o) => <ScheduleCard key={o.key} occurrence={o} forecast={forecastFor(weather, o.date)} showRelative />)
        )}

        {later.length > 0 && (
          <>
            <p className="section-title">
              다가오는 일정
              <button className="chip" onClick={() => navigate('/calendar')}>
                달력 보기
              </button>
            </p>
            {later.map((o) => (
              <ScheduleCard key={o.key} occurrence={o} forecast={forecastFor(weather, o.date)} />
            ))}
          </>
        )}

        <p className="muted small" style={{ marginTop: 24, textAlign: 'center' }}>
          {weather
            ? `날씨 기준: ${weather.region.name} · ${new Date(weather.cachedAt).toLocaleString('ko-KR')} 저장`
            : '날씨 정보를 아직 받지 못했습니다.'}
          <br />
          최대 {toDateKey(addDays(new Date(), 21))}까지의 일정을 보여줍니다.
        </p>
      </div>
    </>
  );
}
