import { MailAuthError } from './types';
import type { ListOptions, MailAccount, MailMessage, MailProvider, MailSummary } from './types';

/**
 * Gmail 읽기 전용 연동.
 *
 * 브라우저 단독으로 동작한다. Google Identity Services의 토큰 클라이언트로 액세스 토큰만 받고
 * (클라이언트 시크릿이 필요 없는 방식), Gmail REST API를 직접 호출한다.
 * 토큰은 sessionStorage에만 두고 탭을 닫으면 사라진다. 메일 본문은 기기 밖으로 나가지 않는다.
 */

const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const GIS_SRC = 'https://accounts.google.com/gsi/client';
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const TOKEN_KEY = 'godlife.v1.gmailToken';
const CLIENT_ID_KEY = 'godlife.v1.googleClientId';

/** 어린이집·유치원 계획표로 보이는 메일을 좁혀서 가져오는 기본 검색어. */
export const DEFAULT_QUERY =
  '(계획표 OR 월간계획 OR 교육계획 OR 보육계획 OR 가정통신문 OR 알림장 OR 유치원 OR 어린이집) newer_than:120d';

export function buildSearchQuery(extra?: string): string {
  const keyword = extra?.trim();
  if (!keyword) return DEFAULT_QUERY;
  // 사용자가 검색어를 직접 넣으면 그대로 존중하되, 오래된 메일까지 훑지는 않는다.
  return /newer_than|older_than|after:|before:/.test(keyword) ? keyword : `${keyword} newer_than:365d`;
}

export function getGoogleClientId(): string {
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(CLIENT_ID_KEY) : null;
  return (stored ?? import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '').trim();
}

export function setGoogleClientId(clientId: string): void {
  const value = clientId.trim();
  if (value) localStorage.setItem(CLIENT_ID_KEY, value);
  else localStorage.removeItem(CLIENT_ID_KEY);
}

/* ------------------------------------------------------------------ */
/* 본문 해석 — 네트워크와 무관한 순수 함수라 단위 테스트로 검증한다.        */
/* ------------------------------------------------------------------ */

/** Gmail은 본문을 base64url로 준다. 한글이 깨지지 않게 UTF-8로 디코드한다. */
export function decodeBase64Url(data: string): string {
  if (!data) return '';
  const padded = data.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  return new TextDecoder('utf-8').decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
};

/**
 * HTML 계획표를 파서가 읽을 수 있는 평문으로 바꾼다.
 * 표 칸은 ' | '로, 행은 줄바꿈으로 남겨야 "5(수) | 봄나들이" 형태를 그대로 파싱할 수 있다.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(td|th)\s*>/gi, ' | ')
    .replace(/<\/(tr|p|div|li|h[1-6])\s*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&[a-z]+;|&#39;/gi, (entity) => ENTITIES[entity.toLowerCase()] ?? entity)
    .split('\n')
    .map((line) => line.replace(/\s*\|\s*$/, '').replace(/[ \t ]+/g, ' ').trim())
    .filter((line, index, all) => line.length > 0 || all[index - 1]?.length > 0)
    .join('\n')
    .trim();
}

export interface GmailPart {
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GmailPart[];
}

/** multipart 트리에서 본문을 찾는다. text/plain을 우선하고 없으면 HTML을 평문화한다. */
export function extractPlainText(payload: GmailPart | undefined): string {
  if (!payload) return '';
  const plain = findPart(payload, 'text/plain');
  if (plain) return decodeBase64Url(plain).trim();
  const html = findPart(payload, 'text/html');
  return html ? htmlToText(decodeBase64Url(html)) : '';
}

function findPart(part: GmailPart, mimeType: string): string | null {
  // 첨부는 본문이 아니다.
  if (!part.filename && part.mimeType?.startsWith(mimeType) && part.body?.data) return part.body.data;
  for (const child of part.parts ?? []) {
    const found = findPart(child, mimeType);
    if (found) return found;
  }
  return null;
}

export function collectAttachments(payload: GmailPart | undefined): string[] {
  if (!payload) return [];
  const names: string[] = [];
  const walk = (part: GmailPart) => {
    if (part.filename) names.push(part.filename);
    for (const child of part.parts ?? []) walk(child);
  };
  walk(payload);
  return names;
}

export function headerValue(headers: { name: string; value: string }[] | undefined, name: string): string {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
}

/* ------------------------------------------------------------------ */
/* API 클라이언트 — 토큰을 주입받아 fetch만 담당한다.                     */
/* ------------------------------------------------------------------ */

interface GmailListResponse {
  messages?: { id: string }[];
}

interface GmailMessageResponse {
  id: string;
  internalDate?: string;
  snippet?: string;
  payload?: GmailPart;
}

export class GmailClient {
  constructor(private getToken: () => string) {}

  private async call<T>(path: string): Promise<T> {
    const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${this.getToken()}` } });
    if (res.status === 401 || res.status === 403) {
      throw new MailAuthError('Gmail 접근 권한이 만료됐습니다. 계정을 다시 연결해 주세요.');
    }
    if (!res.ok) throw new Error(`Gmail 요청 실패 (${res.status})`);
    return (await res.json()) as T;
  }

  async profileEmail(): Promise<string> {
    const profile = await this.call<{ emailAddress?: string }>('/profile');
    return profile.emailAddress ?? '';
  }

  async list(options: ListOptions = {}): Promise<MailSummary[]> {
    const max = Math.min(Math.max(options.maxResults ?? 15, 1), 50);
    const query = encodeURIComponent(buildSearchQuery(options.query));
    const listed = await this.call<GmailListResponse>(`/messages?q=${query}&maxResults=${max}`);
    const ids = (listed.messages ?? []).map((m) => m.id);
    // 목록에도 제목·날짜가 필요해 메타데이터만 따로 받아온다.
    return Promise.all(ids.map((id) => this.summary(id)));
  }

  private async summary(id: string): Promise<MailSummary> {
    const message = await this.call<GmailMessageResponse>(
      `/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
    );
    return toSummary(message);
  }

  async fetch(id: string): Promise<MailMessage> {
    const message = await this.call<GmailMessageResponse>(`/messages/${id}?format=full`);
    return { ...toSummary(message), body: extractPlainText(message.payload) };
  }
}

export function toSummary(message: GmailMessageResponse): MailSummary {
  const headers = message.payload?.headers;
  const received = message.internalDate ? new Date(Number(message.internalDate)) : new Date();
  return {
    id: message.id,
    subject: headerValue(headers, 'Subject') || '(제목 없음)',
    from: headerValue(headers, 'From'),
    receivedAt: received.toISOString(),
    snippet: (message.snippet ?? '').trim(),
    attachments: collectAttachments(message.payload),
  };
}

/* ------------------------------------------------------------------ */
/* 인증 + 제공자                                                        */
/* ------------------------------------------------------------------ */

interface TokenState {
  accessToken: string;
  expiresAt: number;
  email: string;
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string }): void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (response: TokenResponse) => void;
            error_callback?: (error: { type?: string; message?: string }) => void;
          }): TokenClient;
          revoke(token: string, done?: () => void): void;
        };
      };
    };
  }
}

let gisPromise: Promise<void> | null = null;

/** 스크립트가 끝내 응답하지 않을 때 화면이 "연결 중"에 갇히지 않도록 두는 상한. */
export const GIS_LOAD_TIMEOUT_MS = 10_000;

export function loadIdentityServices(timeoutMs = GIS_LOAD_TIMEOUT_MS): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisPromise) return gisPromise;

  gisPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    let timer = 0;

    const fail = (message: string) => {
      window.clearTimeout(timer);
      gisPromise = null;
      // 실패한 스크립트를 남겨두면 다음 시도에서 다시 붙일 수 없다.
      script.remove();
      reject(new Error(message));
    };

    script.src = GIS_SRC;
    script.async = true;
    script.onload = () => {
      window.clearTimeout(timer);
      resolve();
    };
    script.onerror = () => fail('구글 로그인 스크립트를 불러오지 못했습니다. 네트워크를 확인해 주세요.');
    timer = window.setTimeout(
      () => fail('구글 로그인 스크립트 응답이 없습니다. 네트워크 상태를 확인한 뒤 다시 시도해 주세요.'),
      timeoutMs,
    );
    document.head.appendChild(script);
  });
  return gisPromise;
}

function loadToken(): TokenState | null {
  try {
    const raw = sessionStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const token = JSON.parse(raw) as TokenState;
    return token.expiresAt > Date.now() ? token : null;
  } catch {
    return null;
  }
}

function saveToken(token: TokenState | null): void {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, JSON.stringify(token));
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // 세션 저장이 막혀도 메모리 토큰으로 이번 세션은 동작한다.
  }
}

export class GmailProvider implements MailProvider {
  readonly id = 'gmail';
  readonly label = 'Gmail';

  private token: TokenState | null = loadToken();
  private client = new GmailClient(() => {
    if (!this.token) throw new MailAuthError('연결된 메일 계정이 없습니다.');
    return this.token.accessToken;
  });

  isConfigured(): boolean {
    return getGoogleClientId().length > 0;
  }

  account(): MailAccount | null {
    if (!this.token || this.token.expiresAt <= Date.now()) return null;
    return { email: this.token.email, expiresAt: this.token.expiresAt };
  }

  async connect(): Promise<MailAccount> {
    const clientId = getGoogleClientId();
    if (!clientId) throw new Error('구글 OAuth 클라이언트 ID가 없습니다. 설정에서 먼저 등록해 주세요.');
    await loadIdentityServices();

    const response = await new Promise<TokenResponse>((resolve, reject) => {
      const tokenClient = window.google!.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        callback: resolve,
        error_callback: (error) => reject(new MailAuthError(error.message ?? '구글 인증이 취소됐습니다.')),
      });
      tokenClient.requestAccessToken({ prompt: this.token ? '' : 'consent' });
    });

    if (!response.access_token) {
      throw new MailAuthError(response.error_description ?? response.error ?? '토큰을 받지 못했습니다.');
    }

    this.token = {
      accessToken: response.access_token,
      // 만료 직전 요청이 실패하지 않도록 1분 여유를 둔다.
      expiresAt: Date.now() + ((response.expires_in ?? 3600) - 60) * 1000,
      email: '',
    };
    this.token.email = await this.client.profileEmail();
    saveToken(this.token);
    return { email: this.token.email, expiresAt: this.token.expiresAt };
  }

  disconnect(): void {
    const token = this.token?.accessToken;
    this.token = null;
    saveToken(null);
    if (token) {
      try {
        window.google?.accounts.oauth2.revoke(token);
      } catch {
        // 취소 실패해도 로컬 토큰은 이미 지웠다.
      }
    }
  }

  list(options?: ListOptions): Promise<MailSummary[]> {
    return this.client.list(options);
  }

  fetch(id: string): Promise<MailMessage> {
    return this.client.fetch(id);
  }
}

export const gmailProvider = new GmailProvider();
