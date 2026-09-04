import { useMemo, useState } from 'react';
import { TopBar } from '../components/TopBar';
import { InstitutionFilter } from '../components/InstitutionFilter';
import { ScheduleCard } from '../components/ScheduleCard';
import { useApp } from '../store/AppStore';
import { INSTITUTION_COLOR } from '../types';
import { WEEKDAY_LABEL, addDays, endOfMonth, fromDateKey, humanDate, monthGrid, startOfMonth, toDateKey } from '../lib/date';
import { describeWeather, forecastFor } from '../lib/weather';

/** 월간 달력 (기획서 핵심요구 4). 기관 필터·날씨 아이콘이 셀에 함께 붙는다. */
export function CalendarScreen() {
  const { occurrencesBetween, weather, settings } = useApp();
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState(() => toDateKey(new Date()));

  const grid = useMemo(() => monthGrid(cursor), [cursor]);
  const monthOccurrences = useMemo(
    () => occurrencesBetween(fromDateKey(grid[0][0]), addDays(fromDateKey(grid[5][6]), 1)),
    [occurrencesBetween, grid],
  );

  const byDate = useMemo(() => {
    const map = new Map<string, typeof monthOccurrences>();
    for (const o of monthOccurrences) {
      const list = map.get(o.date) ?? [];
      list.push(o);
      map.set(o.date, list);
    }
    return map;
  }, [monthOccurrences]);

  const today = toDateKey(new Date());
  const selectedList = byDate.get(selected) ?? [];
  const monthLabel = `${cursor.getFullYear()}년 ${cursor.getMonth() + 1}월`;

  return (
    <>
      <TopBar
        title={monthLabel}
        subtitle={`${monthOccurrences.filter((o) => o.date.startsWith(toDateKey(cursor).slice(0, 7))).length}건`}
        actions={
          <div className="row">
            <button className="icon-btn" onClick={() => setCursor(startOfMonth(addDays(startOfMonth(cursor), -1)))} aria-label="이전 달">
              ‹
            </button>
            <button className="icon-btn" onClick={() => setCursor(startOfMonth(addDays(endOfMonth(cursor), 1)))} aria-label="다음 달">
              ›
            </button>
          </div>
        }
      />
      <div className="screen">
        <InstitutionFilter />

        <div className="cal-head" style={{ marginTop: 12 }}>
          {WEEKDAY_LABEL.map((w) => (
            <span key={w}>{w}</span>
          ))}
        </div>
        <div className="cal-grid">
          {grid.flat().map((key) => {
            const date = fromDateKey(key);
            const outside = date.getMonth() !== cursor.getMonth();
            const list = byDate.get(key) ?? [];
            const forecast = forecastFor(weather, key);
            return (
              <button
                key={key}
                className={`cal-cell ${outside ? 'out' : ''} ${key === today ? 'today' : ''} ${key === selected ? 'sel' : ''}`}
                onClick={() => setSelected(key)}
              >
                <span className={`d ${date.getDay() === 0 ? 'sun' : date.getDay() === 6 ? 'sat' : ''}`}>{date.getDate()}</span>
                <span className="cal-dots">
                  {list.slice(0, 6).map((o) => (
                    <span key={o.key} className="cal-dot" style={{ background: INSTITUTION_COLOR[o.schedule.institution] }} />
                  ))}
                </span>
                {settings.weatherEnabled && forecast && <span className="wx">{describeWeather(forecast.code).icon}</span>}
              </button>
            );
          })}
        </div>

        <p className="section-title">
          {humanDate(selected)} <span className="muted small">{selectedList.length}건</span>
        </p>
        {selectedList.length === 0 ? (
          <p className="muted small" style={{ padding: '0 2px' }}>
            선택한 날짜에 일정이 없습니다.
          </p>
        ) : (
          selectedList.map((o) => <ScheduleCard key={o.key} occurrence={o} forecast={forecastFor(weather, o.date)} />)
        )}
      </div>
    </>
  );
}
