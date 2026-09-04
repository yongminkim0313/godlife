import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TopBar } from '../components/TopBar';
import { useApp } from '../store/AppStore';
import { INSTITUTION_LABEL } from '../types';
import type { InstitutionKind, Region } from '../types';
import { offsetLabel } from '../lib/date';
import { OFFSET_CHOICES, ensurePermission } from '../lib/notifications';
import { PRESET_REGIONS, searchRegion } from '../lib/weather';

const INSTITUTIONS: InstitutionKind[] = ['kindergarten', 'daycare', 'home'];

export function SettingsScreen() {
  const navigate = useNavigate();
  const { settings, updateSettings, toggleInstitution, refreshWeather, loadSampleData, resetAll, online, pendingSync, lastSyncedAt, weather } =
    useApp();
  const [permission, setPermission] = useState(typeof Notification === 'undefined' ? 'denied' : Notification.permission);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Region[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  const pickRegion = (region: Region) => {
    updateSettings({ region });
    setResults([]);
    setQuery('');
    void refreshWeather(true);
  };

  const search = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setSearchError('');
    try {
      setResults(await searchRegion(query.trim()));
    } catch {
      setSearchError('지역을 검색하지 못했습니다. 오프라인이면 아래 목록에서 골라 주세요.');
    } finally {
      setSearching(false);
    }
  };

  return (
    <>
      <TopBar title="설정" />
      <div className="screen">
        <p className="section-title">계정</p>
        <div className="card">
          <label className="field" style={{ marginBottom: 0 }}>
            <span>보호자 이름</span>
            <input
              type="text"
              value={settings.profileName ?? ''}
              onChange={(e) => updateSettings({ profileName: e.target.value })}
              placeholder="보호자"
            />
          </label>
        </div>

        <p className="section-title">알림</p>
        <div className="card">
          <span className="small muted">기본 알림 시점</span>
          <div className="chip-row" style={{ marginTop: 8 }}>
            {OFFSET_CHOICES.map((offset) => (
              <button
                key={offset}
                className={`chip ${settings.defaultOffsets.includes(offset) ? 'on' : ''}`}
                onClick={() =>
                  updateSettings({
                    defaultOffsets: settings.defaultOffsets.includes(offset)
                      ? settings.defaultOffsets.filter((o) => o !== offset)
                      : [...settings.defaultOffsets, offset],
                  })
                }
              >
                {offsetLabel(offset)}
              </button>
            ))}
          </div>

          <div className="toggle" style={{ marginTop: 12 }}>
            <span className="small">하루 전 알림에 준비물 첨부</span>
            <input
              type="checkbox"
              checked={settings.preparationReminder}
              onChange={(e) => updateSettings({ preparationReminder: e.target.checked })}
            />
          </div>

          <div className="grid2" style={{ marginTop: 12 }}>
            <label className="field" style={{ marginBottom: 0 }}>
              <span>재알림 간격(분)</span>
              <input
                type="number"
                min={1}
                max={180}
                value={settings.snoozeMinutes}
                onChange={(e) => updateSettings({ snoozeMinutes: Math.max(1, Number(e.target.value) || 1) })}
              />
            </label>
            <label className="field" style={{ marginBottom: 0 }}>
              <span>재알림 최대 횟수</span>
              <input
                type="number"
                min={0}
                max={10}
                value={settings.maxSnooze}
                onChange={(e) => updateSettings({ maxSnooze: Math.max(0, Number(e.target.value) || 0) })}
              />
            </label>
          </div>

          <div className="row between" style={{ marginTop: 14 }}>
            <span className="small muted">
              기기 알림 권한: {permission === 'granted' ? '허용됨' : permission === 'denied' ? '거부됨' : '미설정'}
            </span>
            {permission !== 'granted' && (
              <button
                className="btn"
                onClick={async () => {
                  setPermission(await ensurePermission());
                }}
              >
                요청
              </button>
            )}
          </div>
        </div>

        <p className="section-title">기관 관리</p>
        <div className="card">
          <div className="chip-row">
            {INSTITUTIONS.map((kind) => (
              <button
                key={kind}
                className={`chip ${settings.institutionFilter.includes(kind) ? 'on' : ''}`}
                onClick={() => toggleInstitution(kind)}
              >
                {INSTITUTION_LABEL[kind]}
              </button>
            ))}
          </div>
          <p className="muted small" style={{ marginBottom: 0, marginTop: 10 }}>
            홈·달력에서 보여줄 기관을 선택합니다.
          </p>
        </div>

        <p className="section-title">날씨</p>
        <div className="card">
          <div className="toggle">
            <span className="small">일정에 날씨 표시</span>
            <input type="checkbox" checked={settings.weatherEnabled} onChange={(e) => updateSettings({ weatherEnabled: e.target.checked })} />
          </div>

          <p className="small" style={{ marginTop: 12, marginBottom: 6 }}>
            현재 지역: <strong>{settings.region.name}</strong>
          </p>
          <div className="row">
            <input
              type="text"
              className="grow"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void search();
              }}
              placeholder="지역 검색 (예: 청주)"
            />
            <button className="btn" onClick={() => void search()} disabled={searching || !online}>
              {searching ? '검색 중' : '검색'}
            </button>
          </div>
          {searchError && (
            <p className="small" style={{ color: 'var(--danger)' }}>
              {searchError}
            </p>
          )}
          {results.length > 0 && (
            <div className="chip-row" style={{ marginTop: 10 }}>
              {results.map((region) => (
                <button key={`${region.latitude},${region.longitude}`} className="chip" onClick={() => pickRegion(region)}>
                  {region.name}
                </button>
              ))}
            </div>
          )}
          <div className="chip-row" style={{ marginTop: 10 }}>
            {PRESET_REGIONS.map((region) => (
              <button
                key={region.name}
                className={`chip ${settings.region.name === region.name ? 'on' : ''}`}
                onClick={() => pickRegion(region)}
              >
                {region.name}
              </button>
            ))}
          </div>
          <button className="btn block" style={{ marginTop: 12 }} onClick={() => void refreshWeather(true)} disabled={!online}>
            예보 새로고침
          </button>
          <p className="muted small" style={{ marginBottom: 0, marginTop: 10 }}>
            {weather ? `마지막 갱신: ${new Date(weather.cachedAt).toLocaleString('ko-KR')}` : '아직 예보를 받지 못했습니다.'}
          </p>
        </div>

        <p className="section-title">동기화 · 데이터</p>
        <div className="card">
          <div className="row between">
            <span className="small">연결 상태</span>
            <span className={`badge ${online ? 'ok' : 'warn'}`}>{online ? '온라인' : '오프라인'}</span>
          </div>
          <div className="row between" style={{ marginTop: 8 }}>
            <span className="small">동기화 대기</span>
            <span className="badge">{pendingSync}건</span>
          </div>
          <div className="row between" style={{ marginTop: 8 }}>
            <span className="small">마지막 동기화</span>
            <span className="badge">{lastSyncedAt ? new Date(lastSyncedAt).toLocaleString('ko-KR') : '없음'}</span>
          </div>
          <p className="muted small" style={{ marginTop: 10 }}>
            일정·계획표·날씨는 기기에 저장되어 오프라인에서도 조회됩니다. 온라인이 되면 마지막 저장 우선으로 병합합니다.
          </p>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn grow" onClick={() => navigate('/widget')}>
              위젯 미리보기
            </button>
            <button
              className="btn grow"
              onClick={() => {
                if (window.confirm('샘플 일정과 계획표 메일로 덮어쓸까요?')) loadSampleData();
              }}
            >
              샘플 불러오기
            </button>
          </div>
          <button
            className="btn danger block"
            style={{ marginTop: 8 }}
            onClick={() => {
              if (window.confirm('저장된 모든 데이터를 삭제할까요?')) {
                resetAll();
                navigate('/login', { replace: true });
              }
            }}
          >
            전체 초기화
          </button>
        </div>
      </div>
    </>
  );
}
