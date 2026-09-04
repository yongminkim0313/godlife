import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TopBar } from '../components/TopBar';
import { useApp } from '../store/AppStore';
import { SAMPLE_MAIL } from '../store/AppStore';

const STATUS_LABEL: Record<string, string> = {
  pending: '검토 대기',
  approved: '등록 완료',
  edited: '수정됨',
  discarded: '버림',
};

/**
 * 메일 가져오기 (기획서 핵심요구 2).
 *
 * 메일 계정 연동(IMAP/Gmail API)은 서버가 필요해 다음 단계로 두고, 지금은
 * 본문 붙여넣기·공유로 받은 원문을 그대로 파싱한다. 어느 쪽이든 파싱 이후
 * 흐름(AI 검토 -> 승인 -> 등록)은 동일하다.
 */
export function MailImportScreen() {
  const navigate = useNavigate();
  const { mails, importMail } = useApp();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const run = () => {
    if (!body.trim()) return;
    const mail = importMail(subject.trim() || '제목 없는 계획표', body);
    navigate(`/mail/${mail.id}/review`);
  };

  return (
    <>
      <TopBar title="메일 가져오기" subtitle="월 계획표를 붙여넣으면 AI가 일정 후보를 뽑아냅니다" />
      <div className="screen">
        <div className="card">
          <label className="field">
            <span>메일 제목</span>
            <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="3월 유치원 월간 교육계획표" />
          </label>
          <label className="field">
            <span>메일 본문</span>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="받은 계획표 본문을 그대로 붙여넣으세요." />
          </label>
          <div className="row">
            <button className="btn grow" onClick={() => setBody(SAMPLE_MAIL(new Date()))}>
              샘플 넣기
            </button>
            <button className="btn primary grow" onClick={run} disabled={!body.trim()}>
              AI로 분석
            </button>
          </div>
          <p className="muted small" style={{ marginBottom: 0, marginTop: 12 }}>
            분석 결과는 바로 등록되지 않습니다. 다음 화면에서 확인·수정한 뒤 승인해야 일정이 됩니다.
          </p>
        </div>

        <p className="section-title">가져온 메일</p>
        {mails.length === 0 ? (
          <div className="empty">
            <span className="big">📩</span>
            아직 가져온 계획표가 없습니다.
          </div>
        ) : (
          mails.map((mail) => (
            <div className="card" key={mail.id}>
              <div className="row between">
                <div className="grow">
                  <strong className="small">{mail.subject}</strong>
                  <p className="muted small" style={{ margin: '4px 0 0' }}>
                    {new Date(mail.receivedAt).toLocaleDateString('ko-KR')} · 추출 {mail.parsedItems.length}건
                  </p>
                </div>
                <span className={`badge ${mail.reviewStatus === 'pending' ? 'warn' : mail.reviewStatus === 'approved' ? 'ok' : ''}`}>
                  {STATUS_LABEL[mail.reviewStatus]}
                </span>
              </div>
              <button className="btn block" style={{ marginTop: 10 }} onClick={() => navigate(`/mail/${mail.id}/review`)}>
                {mail.reviewStatus === 'pending' ? '검토하기' : '다시 보기'}
              </button>
            </div>
          ))
        )}
      </div>
    </>
  );
}
