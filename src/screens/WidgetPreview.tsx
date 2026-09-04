import { useNavigate } from 'react-router-dom';
import { TopBar } from '../components/TopBar';
import { useApp } from '../store/AppStore';
import { humanDate, relativeLabel, toTimeLabel } from '../lib/date';
import { describeWeather, forecastFor } from '../lib/weather';

/**
 * 홈 화면 위젯 (기획서 핵심요구 6).
 *
 * 웹에서는 OS 홈 화면에 붙는 진짜 위젯을 만들 수 없어, 네이티브 위젯이 그릴 화면과
 * 동일한 데이터(다음 일정 + 날씨 + 준비물)를 이 라우트에서 그대로 렌더링한다.
 * 네이티브 셸(WidgetKit / App Widget)은 이 라우트가 쓰는 것과 같은 selector를 읽으면 된다.
 */
export function WidgetPreview() {
  const navigate = useNavigate();
  const { upcomingOccurrences, weather, settings } = useApp();
  const next = upcomingOccurrences(1)[0];
  const forecast = next ? forecastFor(weather, next.date) : undefined;

  return (
    <>
      <TopBar title="홈 화면 위젯" subtitle="네이티브 위젯이 그릴 내용" back />
      <div className="screen">
        <div className="widget-frame">
          <div className="widget" style={{ width: '100%' }} onClick={() => navigate('/home')} role="button" tabIndex={0}>
            <p className="w-label">다음 일정</p>
            {next ? (
              <>
                <p className="w-title">{next.schedule.title}</p>
                <p className="w-when">
                  {humanDate(next.date)} {next.schedule.isAllDay ? '종일' : toTimeLabel(next.startAt)} · {relativeLabel(next.startAt)}
                </p>
                <div className="w-foot">
                  <span>
                    {settings.weatherEnabled && forecast
                      ? `${describeWeather(forecast.code).icon} ${settings.region.name} ${forecast.tempMin}°/${forecast.tempMax}°`
                      : ''}
                  </span>
                  <span>
                    {next.schedule.preparations.length > 0
                      ? `🎒 ${next.schedule.preparations.map((p) => p.text).join(', ')}`
                      : ''}
                  </span>
                </div>
              </>
            ) : (
              <>
                <p className="w-title">예정된 일정 없음</p>
                <p className="w-when">탭해서 일정을 등록하세요</p>
              </>
            )}
          </div>
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <p className="small" style={{ marginTop: 0 }}>
            위젯을 탭하면 앱 홈으로 이동합니다.
          </p>
          <p className="muted small" style={{ marginBottom: 0 }}>
            위젯은 오프라인 캐시(로컬 저장소)의 다음 일정과 마지막으로 받은 날씨 예보를 사용하므로,
            네트워크가 없어도 마지막 상태를 그대로 보여줍니다.
          </p>
        </div>

        <button className="btn primary block" style={{ marginTop: 16 }} onClick={() => navigate('/home')}>
          앱으로 이동
        </button>
      </div>
    </>
  );
}
