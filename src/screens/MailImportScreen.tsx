import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TopBar } from '../components/TopBar';
import { useApp } from '../store/AppStore';
import { SAMPLE_MAIL } from '../store/AppStore';
import { useMailAccount } from '../store/useMailAccount';
import { MailAuthError } from '../lib/mail/types';
import type { MailSummary } from '../lib/mail/types';
import { humanDate, toDateKey } from '../lib/date';

const STATUS_LABEL: Record<string, string> = {
  pending: '검토 대기',
  approved: '등록 완료',
  edited: '수정됨',
  discarded: '버림',
};

type Tab = 'account' | 'paste';

/**
 * 메일 가져오기 (기획서 핵심요구 2).
 *
 * 두 경로를 모두 지원한다.
 *  - 메일 계정 연동: Gmail 읽기 전용 연결 후 계획표 메일을 골라 가져온다.
 *  - 직접 붙여넣기: 연동을 쓰지 않거나 다른 메일함에서 받은 본문을 그대로 넣는다.
 * 어느 쪽이든 이후 흐름(AI 파싱 -> 검토 -> 승인 -> 등록)은 동일하다.
 */
export function MailImportScreen() {
  const navigate = useNavigate();
  const { mails, importMail } = useApp();
  const { provider, account, configured, connecting, error, connect, disconnect, refresh } = useMailAccount();

  // 연동을 설정해 둔 사용자는 계정 탭에서, 아직 안 한 사용자는 붙여넣기에서 시작한다.
  const [tab, setTab] = useState<Tab>(() => (account || configured ? 'account' : 'paste'));
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<MailSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [importingId, setImportingId] = useState('');

  const runPaste = () => {
    if (!body.trim()) return;
    const mail = importMail(subject.trim() || '제목 없는 계획표', body);
    navigate(`/mail/${mail.id}/review`);
  };

  const loadMessages = useCallback(
    async (search?: string) => {
      setLoading(true);
      setListError('');
      try {
        setMessages(await provider.list({ query: search }));
      } catch (cause) {
        if (cause instanceof MailAuthError) {
          disconnect();
          setListError(cause.message);
        } else {
          setListError(cause instanceof Error ? cause.message : '메일을 불러오지 못했습니다.');
        }
      } finally {
        setLoading(false);
      }
    },
    [provider, disconnect],
  );

  // 연결되면 계획표로 보이는 메일을 바로 훑어온다.
  useEffect(() => {
    if (account) void loadMessages();
    else setMessages([]);
  }, [account, loadMessages]);

  const importFromAccount = async (summary: MailSummary) => {
    setImportingId(summary.id);
    setListError('');
    try {
      const message = await provider.fetch(summary.id);
      if (!message.body.trim()) {
        setListError(
          message.attachments.length > 0
            ? `본문이 비어 있고 첨부파일(${message.attachments.join(', ')})만 있는 메일입니다. 첨부 계획표는 아직 읽지 못해요.`
            : '본문이 비어 있어 가져올 내용이 없습니다.',
        );
        return;
      }
      const mail = importMail(message.subject, message.body, { receivedAt: message.receivedAt });
      navigate(`/mail/${mail.id}/review`);
    } catch (cause) {
      if (cause instanceof MailAuthError) disconnect();
      setListError(cause instanceof Error ? cause.message : '메일을 가져오지 못했습니다.');
    } finally {
      setImportingId('');
    }
  };

  return (
    <>
      <TopBar title="메일 가져오기" subtitle="월 계획표를 AI가 읽어 일정 후보를 뽑아냅니다" />
      <div className="screen">
        <div className="chip-row" role="tablist">
          <button className={`chip ${tab === 'account' ? 'on' : ''}`} onClick={() => setTab('account')} role="tab">
            메일 계정
          </button>
          <button className={`chip ${tab === 'paste' ? 'on' : ''}`} onClick={() => setTab('paste')} role="tab">
            직접 붙여넣기
          </button>
        </div>

        {tab === 'account' && (
          <>
            <div className="card" style={{ marginTop: 12 }}>
              {!configured ? (
                <>
                  <strong className="small">메일 계정 연동을 아직 설정하지 않았습니다</strong>
                  <p className="muted small">
                    구글 OAuth 클라이언트 ID를 등록하면 Gmail에서 계획표 메일을 바로 가져올 수 있습니다.
                    등록 전에는 아래 <strong>직접 붙여넣기</strong>로 사용해 주세요.
                  </p>
                  <div className="row" style={{ gap: 8 }}>
                    <button className="btn primary grow" onClick={() => navigate('/settings')}>
                      설정에서 등록
                    </button>
                    <button className="btn grow" onClick={() => setTab('paste')}>
                      붙여넣기로 하기
                    </button>
                  </div>
                </>
              ) : account ? (
                <>
                  <div className="row between">
                    <div className="grow">
                      <strong className="small">{provider.label} 연결됨</strong>
                      <p className="muted small" style={{ margin: '4px 0 0' }}>
                        {account.email} · 읽기 전용
                      </p>
                    </div>
                    <button className="btn" onClick={disconnect}>
                      연결 해제
                    </button>
                  </div>
                  <div className="row" style={{ marginTop: 12 }}>
                    <input
                      type="text"
                      className="grow"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void loadMessages(query);
                      }}
                      placeholder="검색어 (비우면 계획표 메일 자동 검색)"
                    />
                    <button className="btn" onClick={() => void loadMessages(query)} disabled={loading}>
                      {loading ? '조회 중' : '조회'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <strong className="small">{provider.label} 계정 연결</strong>
                  <p className="muted small">
                    받은 편지함에서 계획표로 보이는 메일만 <strong>읽기 전용</strong>으로 가져옵니다.
                    메일 본문은 기기 안에서만 처리되고 외부로 보내지 않습니다.
                  </p>
                  <button className="btn primary block" onClick={() => void connect()} disabled={connecting}>
                    {connecting ? '연결 중…' : '구글 계정으로 연결'}
                  </button>
                </>
              )}
              {error && (
                <p className="small" style={{ color: 'var(--danger)', marginBottom: 0 }}>
                  {error}
                </p>
              )}
            </div>

            {listError && (
              <div className="card" style={{ borderColor: 'var(--warn)' }}>
                <p className="small" style={{ margin: 0 }}>
                  {listError}
                </p>
              </div>
            )}

            {account && (
              <>
                <p className="section-title">
                  받은 계획표 메일 <span className="muted small">{messages.length}건</span>
                </p>
                {loading && messages.length === 0 && <p className="muted small">메일을 불러오는 중…</p>}
                {!loading && messages.length === 0 && !listError && (
                  <div className="empty">
                    <span className="big">🔍</span>
                    계획표로 보이는 메일을 찾지 못했습니다.
                    <br />
                    검색어를 바꾸거나 붙여넣기로 등록해 보세요.
                  </div>
                )}
                {messages.map((message) => (
                  <div className="card" key={message.id}>
                    <strong className="small">{message.subject}</strong>
                    <p className="muted small" style={{ margin: '4px 0 0' }}>
                      {message.from} · {humanDate(toDateKey(new Date(message.receivedAt)))}
                    </p>
                    {message.snippet && (
                      <p className="src-line" style={{ marginBottom: 0 }}>
                        {message.snippet}
                      </p>
                    )}
                    {message.attachments.length > 0 && (
                      <p className="muted small" style={{ margin: '8px 0 0' }}>
                        📎 {message.attachments.join(', ')}
                      </p>
                    )}
                    <button
                      className="btn primary block"
                      style={{ marginTop: 10 }}
                      onClick={() => void importFromAccount(message)}
                      disabled={importingId === message.id}
                    >
                      {importingId === message.id ? '가져오는 중…' : 'AI로 분석'}
                    </button>
                  </div>
                ))}
              </>
            )}
          </>
        )}

        {tab === 'paste' && (
          <div className="card" style={{ marginTop: 12 }}>
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
              <button className="btn primary grow" onClick={runPaste} disabled={!body.trim()}>
                AI로 분석
              </button>
            </div>
          </div>
        )}

        <p className="muted small" style={{ margin: '12px 2px 0' }}>
          분석 결과는 바로 등록되지 않습니다. 다음 화면에서 확인·수정한 뒤 승인해야 일정이 됩니다.
        </p>

        <p className="section-title">
          가져온 메일
          <button className="chip" onClick={refresh}>
            상태 새로고침
          </button>
        </p>
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
