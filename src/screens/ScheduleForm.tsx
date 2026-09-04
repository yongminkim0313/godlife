import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { TopBar } from '../components/TopBar';
import { PreparationList } from '../components/PreparationList';
import { useApp } from '../store/AppStore';
import { INSTITUTION_LABEL } from '../types';
import type { InstitutionKind, Preparation, RepeatRule } from '../types';
import { WEEKDAY_LABEL, atTime, offsetLabel, toDateKey, toTimeLabel, uid } from '../lib/date';
import { OFFSET_CHOICES } from '../lib/notifications';

const INSTITUTIONS: InstitutionKind[] = ['kindergarten', 'daycare', 'home'];

/** 일정 등록/수정 (기획서 핵심요구 1: 매주 반복 포함). */
export function ScheduleForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { schedules, settings, createSchedule, updateSchedule } = useApp();
  const editing = schedules.find((s) => s.id === id);

  const [title, setTitle] = useState(editing?.title ?? '');
  const [institution, setInstitution] = useState<InstitutionKind>(editing?.institution ?? 'kindergarten');
  const [date, setDate] = useState(toDateKey(editing ? new Date(editing.startAt) : new Date()));
  const [startTime, setStartTime] = useState(editing ? toTimeLabel(editing.startAt) : '09:00');
  const [endTime, setEndTime] = useState(editing ? toTimeLabel(editing.endAt) : '10:00');
  const [isAllDay, setIsAllDay] = useState(editing?.isAllDay ?? false);
  const [weekly, setWeekly] = useState(editing?.repeatRule.freq === 'weekly');
  const [weekdays, setWeekdays] = useState<number[]>(
    editing?.repeatRule.freq === 'weekly' ? editing.repeatRule.weekdays : [new Date().getDay()],
  );
  const [until, setUntil] = useState(editing?.repeatRule.freq === 'weekly' ? (editing.repeatRule.until ?? '') : '');
  const [offsets, setOffsets] = useState<number[]>(editing?.notificationOffsets ?? settings.defaultOffsets);
  const [preparations, setPreparations] = useState<Preparation[]>(editing?.preparations ?? []);
  const [prepInput, setPrepInput] = useState('');
  const [memo, setMemo] = useState(editing?.memo ?? '');
  const [error, setError] = useState('');

  const addPreparation = () => {
    const text = prepInput.trim();
    if (!text) return;
    setPreparations((prev) => [...prev, { id: uid('prep'), text, checked: false }]);
    setPrepInput('');
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      setError('일정 이름을 입력해 주세요.');
      return;
    }
    if (weekly && weekdays.length === 0) {
      setError('반복할 요일을 하나 이상 선택해 주세요.');
      return;
    }
    const start = isAllDay ? atTime(date, '00:00') : atTime(date, startTime);
    let end = isAllDay ? atTime(date, '23:59') : atTime(date, endTime);
    if (end <= start) end = new Date(start.getTime() + 60 * 60_000);

    const repeatRule: RepeatRule = weekly ? { freq: 'weekly', weekdays, until: until || undefined } : { freq: 'none' };
    const payload = {
      title: title.trim(),
      institution,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      isAllDay,
      repeatRule,
      preparations,
      memo: memo.trim() || undefined,
      notificationOffsets: offsets,
    };

    if (editing) {
      updateSchedule(editing.id, payload);
      navigate(`/schedule/${editing.id}/${toDateKey(start)}`, { replace: true });
    } else {
      const created = createSchedule({ ...payload, sourceType: 'manual', status: 'planned' });
      navigate(`/schedule/${created.id}/${toDateKey(start)}`, { replace: true });
    }
  };

  return (
    <>
      <TopBar title={editing ? '일정 수정' : '일정 등록'} back />
      <form className="screen" onSubmit={submit}>
        <div className="card">
          <label className="field">
            <span>일정 이름</span>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 봄 소풍" />
          </label>

          <label className="field">
            <span>기관</span>
            <div className="chip-row">
              {INSTITUTIONS.map((kind) => (
                <button
                  type="button"
                  key={kind}
                  className={`chip ${institution === kind ? 'on' : ''}`}
                  onClick={() => setInstitution(kind)}
                >
                  {INSTITUTION_LABEL[kind]}
                </button>
              ))}
            </div>
          </label>

          <label className="field">
            <span>날짜</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>

          <div className="toggle">
            <span className="small">종일 일정</span>
            <input type="checkbox" checked={isAllDay} onChange={(e) => setIsAllDay(e.target.checked)} />
          </div>

          {!isAllDay && (
            <div className="grid2" style={{ marginTop: 12 }}>
              <label className="field">
                <span>시작</span>
                <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </label>
              <label className="field">
                <span>종료</span>
                <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </label>
            </div>
          )}
        </div>

        <p className="section-title">반복</p>
        <div className="card">
          <div className="toggle">
            <span className="small">매주 반복</span>
            <input type="checkbox" checked={weekly} onChange={(e) => setWeekly(e.target.checked)} />
          </div>
          {weekly && (
            <>
              <div className="chip-row" style={{ marginTop: 12 }}>
                {WEEKDAY_LABEL.map((label, index) => (
                  <button
                    type="button"
                    key={label}
                    className={`chip ${weekdays.includes(index) ? 'on' : ''}`}
                    onClick={() =>
                      setWeekdays((prev) => (prev.includes(index) ? prev.filter((d) => d !== index) : [...prev, index]))
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
              <label className="field" style={{ marginTop: 12 }}>
                <span>반복 종료일 (선택)</span>
                <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
              </label>
            </>
          )}
        </div>

        <p className="section-title">알림</p>
        <div className="card">
          <div className="chip-row">
            {OFFSET_CHOICES.map((offset) => (
              <button
                type="button"
                key={offset}
                className={`chip ${offsets.includes(offset) ? 'on' : ''}`}
                onClick={() => setOffsets((prev) => (prev.includes(offset) ? prev.filter((o) => o !== offset) : [...prev, offset]))}
              >
                {offsetLabel(offset)}
              </button>
            ))}
          </div>
          <p className="muted small" style={{ marginTop: 10, marginBottom: 0 }}>
            하루 전 알림에는 준비물 메모가 함께 전달됩니다.
          </p>
        </div>

        <p className="section-title">준비물</p>
        <div className="card">
          <PreparationList
            preparations={preparations}
            onRemove={(prepId) => setPreparations((prev) => prev.filter((p) => p.id !== prepId))}
          />
          <div className="row" style={{ marginTop: 10 }}>
            <input
              type="text"
              className="grow"
              value={prepInput}
              onChange={(e) => setPrepInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addPreparation();
                }
              }}
              placeholder="예: 물통"
            />
            <button type="button" className="btn" onClick={addPreparation}>
              추가
            </button>
          </div>
        </div>

        <p className="section-title">메모</p>
        <div className="card">
          <textarea value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="기관 안내사항 등" style={{ minHeight: 80 }} />
        </div>

        {error && (
          <p className="small" style={{ color: 'var(--danger)', marginTop: 12 }}>
            {error}
          </p>
        )}

        <button className="btn primary block" type="submit" style={{ marginTop: 18 }}>
          {editing ? '수정 저장' : '일정 등록'}
        </button>
      </form>
    </>
  );
}
