/** 메일 계정 연동 공통 타입. 제공자(Gmail 등)가 늘어도 화면은 이 인터페이스만 본다. */

export interface MailSummary {
  id: string;
  subject: string;
  from: string;
  /** ISO 8601 */
  receivedAt: string;
  /** 목록에 보여줄 미리보기 */
  snippet: string;
  /** 첨부파일 이름들. 본문 없이 첨부만 온 계획표를 구분하는 데 쓴다. */
  attachments: string[];
}

export interface MailMessage extends MailSummary {
  /** 파서에 넘길 평문 본문 */
  body: string;
}

export interface MailAccount {
  /** 연결된 계정 주소 */
  email: string;
  /** 토큰 만료 시각(ms). 만료되면 다시 연결해야 한다. */
  expiresAt: number;
}

export interface ListOptions {
  /** 추가 검색어. 비우면 기본 계획표 검색어를 쓴다. */
  query?: string;
  maxResults?: number;
}

export interface MailProvider {
  readonly id: string;
  readonly label: string;
  /** OAuth 클라이언트 ID 등 사전 설정이 끝났는지 */
  isConfigured(): boolean;
  /** 연결(=유효한 토큰 보유) 여부 */
  account(): MailAccount | null;
  connect(): Promise<MailAccount>;
  disconnect(): void;
  list(options?: ListOptions): Promise<MailSummary[]>;
  fetch(id: string): Promise<MailMessage>;
}

export class MailAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MailAuthError';
  }
}
