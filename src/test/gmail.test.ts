import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_QUERY,
  GmailClient,
  buildSearchQuery,
  collectAttachments,
  decodeBase64Url,
  extractPlainText,
  headerValue,
  htmlToText,
  loadIdentityServices,
  toSummary,
} from '../lib/mail/gmail';
import type { GmailPart } from '../lib/mail/gmail';
import { MailAuthError } from '../lib/mail/types';
import { parseMail } from '../lib/mailParser';

function b64url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

describe('decodeBase64Url', () => {
  it('한글 본문을 깨지지 않게 디코드한다', () => {
    expect(decodeBase64Url(b64url('3월 유치원 계획표 · 준비물: 도시락'))).toBe('3월 유치원 계획표 · 준비물: 도시락');
  });

  it('패딩이 없어도 디코드된다', () => {
    expect(decodeBase64Url(b64url('abcde'))).toBe('abcde');
    expect(decodeBase64Url('')).toBe('');
  });
});

describe('htmlToText', () => {
  it('표의 칸은 구분자로, 행은 줄바꿈으로 남긴다', () => {
    const html = '<table><tr><td>5(수)</td><td>봄나들이</td></tr><tr><td>7(금)</td><td>소방훈련</td></tr></table>';
    expect(htmlToText(html)).toBe('5(수) | 봄나들이\n7(금) | 소방훈련');
  });

  it('br·p 태그를 줄바꿈으로 바꾼다', () => {
    expect(htmlToText('<p>안녕하세요</p>3월 5일<br/>봄 소풍')).toBe('안녕하세요\n3월 5일\n봄 소풍');
  });

  it('script·style과 엔티티를 정리한다', () => {
    expect(htmlToText('<style>p{color:red}</style><p>도시락&nbsp;&amp;&nbsp;물통</p>')).toBe('도시락 & 물통');
    expect(htmlToText('<p>&#54620;&#44544;</p>')).toBe('한글');
  });

  it('평문화한 결과를 그대로 파싱할 수 있다', () => {
    const html = '<h3>2026년 3월 유치원 계획표</h3><table><tr><td>3월 5일(목)</td><td>봄 소풍</td><td>준비물: 도시락, 물통</td></tr></table>';
    const items = parseMail(htmlToText(html), { receivedAt: new Date(2026, 2, 1) });
    expect(items).toHaveLength(1);
    expect(items[0].date).toBe('2026-03-05');
    expect(items[0].title).toBe('봄 소풍');
    expect(items[0].preparations).toEqual(['도시락', '물통']);
  });
});

describe('extractPlainText', () => {
  const plainPart: GmailPart = { mimeType: 'text/plain', body: { data: b64url('평문 본문') } };
  const htmlPart: GmailPart = { mimeType: 'text/html', body: { data: b64url('<p>HTML 본문</p>') } };

  it('중첩된 multipart에서 text/plain을 우선한다', () => {
    const payload: GmailPart = {
      mimeType: 'multipart/mixed',
      parts: [{ mimeType: 'multipart/alternative', parts: [plainPart, htmlPart] }],
    };
    expect(extractPlainText(payload)).toBe('평문 본문');
  });

  it('text/plain이 없으면 HTML을 평문화한다', () => {
    expect(extractPlainText({ mimeType: 'multipart/alternative', parts: [htmlPart] })).toBe('HTML 본문');
  });

  it('첨부파일은 본문으로 쓰지 않는다', () => {
    const payload: GmailPart = {
      mimeType: 'multipart/mixed',
      parts: [{ mimeType: 'text/plain', filename: '계획표.txt', body: { data: b64url('첨부 내용') } }, htmlPart],
    };
    expect(extractPlainText(payload)).toBe('HTML 본문');
  });

  it('본문이 없으면 빈 문자열', () => {
    expect(extractPlainText(undefined)).toBe('');
    expect(extractPlainText({ mimeType: 'multipart/mixed', parts: [] })).toBe('');
  });
});

describe('collectAttachments', () => {
  it('첨부 이름을 모은다', () => {
    const payload: GmailPart = {
      mimeType: 'multipart/mixed',
      parts: [
        { mimeType: 'text/plain', body: { data: b64url('본문') } },
        { mimeType: 'application/pdf', filename: '3월계획표.pdf', body: { attachmentId: 'a1' } },
      ],
    };
    expect(collectAttachments(payload)).toEqual(['3월계획표.pdf']);
  });
});

describe('headerValue', () => {
  it('대소문자 구분 없이 헤더를 찾는다', () => {
    const headers = [{ name: 'subject', value: '3월 계획표' }];
    expect(headerValue(headers, 'Subject')).toBe('3월 계획표');
    expect(headerValue(headers, 'From')).toBe('');
  });
});

describe('buildSearchQuery', () => {
  it('검색어가 없으면 계획표 기본 검색어를 쓴다', () => {
    expect(buildSearchQuery()).toBe(DEFAULT_QUERY);
    expect(buildSearchQuery('  ')).toBe(DEFAULT_QUERY);
  });

  it('사용자 검색어에는 기간 제한을 덧붙인다', () => {
    expect(buildSearchQuery('from:kinder@school.kr')).toBe('from:kinder@school.kr newer_than:365d');
  });

  it('이미 기간 조건이 있으면 그대로 둔다', () => {
    expect(buildSearchQuery('계획표 newer_than:7d')).toBe('계획표 newer_than:7d');
  });
});

describe('toSummary', () => {
  it('헤더와 수신시각을 요약으로 바꾼다', () => {
    const summary = toSummary({
      id: 'm1',
      internalDate: String(Date.UTC(2026, 2, 1, 1, 0, 0)),
      snippet: '  3월 계획표입니다  ',
      payload: { headers: [{ name: 'Subject', value: '3월 계획표' }, { name: 'From', value: '원장 <a@b.kr>' }] },
    });
    expect(summary.subject).toBe('3월 계획표');
    expect(summary.from).toBe('원장 <a@b.kr>');
    expect(summary.snippet).toBe('3월 계획표입니다');
    expect(summary.receivedAt).toBe(new Date(Date.UTC(2026, 2, 1, 1, 0, 0)).toISOString());
  });

  it('제목이 없으면 대체 문구를 넣는다', () => {
    expect(toSummary({ id: 'm1' }).subject).toBe('(제목 없음)');
  });
});

describe('GmailClient', () => {
  afterEach(() => vi.restoreAllMocks());

  const client = new GmailClient(() => 'test-token');

  it('목록 조회 시 검색어와 토큰을 함께 보낸다', async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.includes('/messages?')) return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'm1' }] }) };
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: 'm1', payload: { headers: [{ name: 'Subject', value: '3월 계획표' }] } }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const list = await client.list({ query: '계획표 newer_than:7d', maxResults: 5 });
    expect(list).toHaveLength(1);
    expect(list[0].subject).toBe('3월 계획표');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain(`q=${encodeURIComponent('계획표 newer_than:7d')}`);
    expect(url).toContain('maxResults=5');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer test-token');
  });

  it('maxResults를 1~50으로 제한한다', async () => {
    const fetchMock = vi.fn(async (_url: string) => ({ ok: true, status: 200, json: async () => ({}) }));
    vi.stubGlobal('fetch', fetchMock);
    await client.list({ maxResults: 500 });
    expect(fetchMock.mock.calls[0][0]).toContain('maxResults=50');
  });

  it('본문 조회는 payload를 평문으로 돌려준다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'm1',
          payload: {
            mimeType: 'multipart/alternative',
            headers: [{ name: 'Subject', value: '3월 계획표' }],
            parts: [{ mimeType: 'text/plain', body: { data: b64url('3월 5일(목) 봄 소풍') } }],
          },
        }),
      })),
    );
    const message = await client.fetch('m1');
    expect(message.body).toBe('3월 5일(목) 봄 소풍');
  });

  it('401·403은 재연결이 필요한 오류로 구분한다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) })));
    await expect(client.fetch('m1')).rejects.toBeInstanceOf(MailAuthError);
  });

  it('그 밖의 실패는 상태코드를 알려준다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })));
    await expect(client.fetch('m1')).rejects.toThrow('500');
  });
});

describe('loadIdentityServices', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.querySelectorAll('script').forEach((s) => s.remove());
  });

  it('스크립트가 응답하지 않으면 안내와 함께 실패한다', async () => {
    // jsdom은 외부 스크립트를 실제로 받지 않으므로 onload·onerror가 오지 않는 상황이 그대로 재현된다.
    vi.useFakeTimers();
    const pending = loadIdentityServices(50);
    const assertion = expect(pending).rejects.toThrow('응답이 없습니다');
    await vi.advanceTimersByTimeAsync(60);
    await assertion;
  });

  it('실패한 스크립트 태그는 남기지 않아 다시 시도할 수 있다', async () => {
    vi.useFakeTimers();
    const first = loadIdentityServices(50);
    const assertion = expect(first).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(60);
    await assertion;
    expect(document.querySelectorAll('script[src*="gsi/client"]')).toHaveLength(0);

    const second = loadIdentityServices(50);
    const secondAssertion = expect(second).rejects.toThrow();
    expect(document.querySelectorAll('script[src*="gsi/client"]')).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(60);
    await secondAssertion;
  });

  it('스크립트가 로드되면 통과한다', async () => {
    const promise = loadIdentityServices(1000);
    const script = document.querySelector('script[src*="gsi/client"]') as HTMLScriptElement;
    script.onload?.(new Event('load'));
    await expect(promise).resolves.toBeUndefined();
  });
});
