import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { TopBar } from '../components/TopBar';
import { useApp } from '../store/AppStore';
import { INSTITUTION_LABEL } from '../types';
import type { InstitutionKind, ParsedItem } from '../types';
import { humanDate, uid } from '../lib/date';
import { LOW_CONFIDENCE } from '../lib/mailParser';

const INSTITUTIONS: InstitutionKind[] = ['kindergarten', 'daycare', 'home'];

/**
 * AI 파싱 검토 화면 (기획서 3.3).
 *
 * AI가 뽑은 항목을 자동 등록하지 않고 여기서 반드시 사람이 확인한다.
 * confidence가 낮은 항목은 "확인 필요"로 강조해 오독을 걸러낸다.
 */
export function AiReview() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { mails, updateMail, approveMail, discardMail } = useApp();
  const mail = mails.find((m) => m.id === id);
  const [items, setItems] = useState<ParsedItem[]>(mail?.parsedItems ?? []);
  const [showRaw, setShowRaw] = useState(false);

  if (!mail) {
    return (
      <>
        <TopBar title="AI 파싱 검토" back />
        <div className="screen">
          <div className="empty">메일을 찾을 수 없습니다.</div>
        </div>
      </>
    );
  }

  const patch = (itemId: string, next: Partial<ParsedItem>) =>
    setItems((prev) => prev.map((item) => (item.id === itemId ? { ...item, ...next } : item)));

  const selectedCount = items.filter((i) => i.selected).length;
  const lowCount = items.filter((i) => i.selected && i.confidence < LOW_CONFIDENCE).length;

  const addManual = () =>
    setItems((prev) => [
      ...prev,
      {
        id: uid('item'),
        title: '',
        date: new Date().toISOString().slice(0, 10),
        time: '09:00',
        institution: 'kindergarten',
        preparations: [],
        confidence: 1,
        sourceLine: '직접 추가',
        selected: true,
      },
    ]);

  const approve = () => {
    const invalid = items.find((i) => i.selected && !i.title.trim());
    if (invalid) {
      window.alert('제목이 비어 있는 항목이 있습니다. 확인해 주세요.');
      return;
    }
    const created = approveMail(mail.id, items);
    window.alert(`${created.length}건의 일정을 등록했습니다.`);
    navigate('/home');
  };

  return (
    <>
      <TopBar
        title="AI 파싱 검토"
        subtitle={`${mail.subject} · ${items.length}건 추출`}
        back
        actions={
          <button className="icon-btn" onClick={() => setShowRaw((v) => !v)} aria-label="원문 보기">
            📄
          </button>
        }
      />
      <div className="screen">
        <div className="card" style={{ borderColor: 'var(--primary)' }}>
          <p className="small" style={{ margin: 0 }}>
            AI가 추출한 결과입니다. <strong>승인하기 전까지 일정으로 등록되지 않습니다.</strong>
            <br />
            선택 {selectedCount}건{lowCount > 0 && ` · 확인 필요 ${lowCount}건`}
          </p>
        </div>

        {showRaw && (
          <div className="card">
            <p className="section-title" style={{ margin: '0 0 8px' }}>
              메일 원문
            </p>
            <pre className="src-line" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
              {mail.rawEmail}
            </pre>
          </div>
        )}

        {items.length === 0 && (
          <div className="empty">
            <span className="big">🤖</span>
            일정 후보를 찾지 못했습니다.
            <br />
            직접 추가하거나 다른 본문으로 다시 시도해 보세요.
          </div>
        )}

        {items.map((item) => {
          const low = item.confidence < LOW_CONFIDENCE;
          return (
            <div key={item.id} className={`card review-item ${low ? 'low' : ''} ${item.selected ? '' : 'off'}`}>
              <div className="row between">
                <label className="row" style={{ gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={item.selected}
                    onChange={(e) => patch(item.id, { selected: e.target.checked })}
                    style={{ width: 18, height: 18 }}
                  />
                  <span className="small muted">{humanDate(item.date)}</span>
                </label>
                <span className={`badge ${low ? 'warn' : 'ai'}`}>
                  {low ? '확인 필요' : 'AI'} {Math.round(item.confidence * 100)}%
                </span>
              </div>

              <label className="field" style={{ marginTop: 10 }}>
                <span>일정명</span>
                <input type="text" value={item.title} onChange={(e) => patch(item.id, { title: e.target.value })} />
              </label>

              <div className="grid2">
                <label className="field">
                  <span>날짜</span>
                  <input type="date" value={item.date} onChange={(e) => patch(item.id, { date: e.target.value })} />
                </label>
                <label className="field">
                  <span>시간</span>
                  <input
                    type="time"
                    value={item.time ?? ''}
                    onChange={(e) => patch(item.id, { time: e.target.value || undefined })}
                  />
                </label>
              </div>

              <label className="field">
                <span>기관</span>
                <div className="chip-row">
                  {INSTITUTIONS.map((kind) => (
                    <button
                      key={kind}
                      className={`chip ${item.institution === kind ? 'on' : ''}`}
                      onClick={() => patch(item.id, { institution: kind })}
                    >
                      {INSTITUTION_LABEL[kind]}
                    </button>
                  ))}
                </div>
              </label>

              <label className="field" style={{ marginBottom: 0 }}>
                <span>🎒 준비물 (쉼표로 구분)</span>
                <input
                  type="text"
                  value={item.preparations.join(', ')}
                  onChange={(e) =>
                    patch(item.id, {
                      preparations: e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="예: 도시락, 물통"
                />
              </label>

              <p className="src-line">원문: {item.sourceLine}</p>
              <button
                className="btn danger block"
                style={{ marginTop: 10 }}
                onClick={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}
              >
                이 항목 삭제
              </button>
            </div>
          );
        })}

        <button className="btn block" style={{ marginTop: 12 }} onClick={addManual}>
          + 항목 직접 추가
        </button>

        <div className="row" style={{ marginTop: 18, gap: 8 }}>
          <button
            className="btn grow"
            onClick={() => {
              discardMail(mail.id);
              navigate('/mail');
            }}
          >
            버리기
          </button>
          <button
            className="btn grow"
            onClick={() => {
              updateMail(mail.id, { parsedItems: items, reviewStatus: 'edited' });
              window.alert('수정 내용을 저장했습니다.');
            }}
          >
            임시 저장
          </button>
          <button className="btn primary grow" onClick={approve} disabled={selectedCount === 0}>
            등록 승인 ({selectedCount})
          </button>
        </div>
      </div>
    </>
  );
}
