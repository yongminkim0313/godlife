/** 기관 구분. 기획서 5장 데이터 모델의 institution 필드. */
export type InstitutionKind = 'kindergarten' | 'daycare' | 'home';

export const INSTITUTION_LABEL: Record<InstitutionKind, string> = {
  kindergarten: '유치원',
  daycare: '어린이집',
  home: '가정',
};

export const INSTITUTION_COLOR: Record<InstitutionKind, string> = {
  kindergarten: '#f2994a',
  daycare: '#3d7dff',
  home: '#27ae60',
};

/** 반복 규칙. 이번 범위는 "매주 반복"이 필수라 요일 기반으로 둔다. */
export type RepeatRule =
  | { freq: 'none' }
  | {
      freq: 'weekly';
      /** 0=일 ~ 6=토 */
      weekdays: number[];
      /** 반복 종료일(YYYY-MM-DD). 없으면 무기한. */
      until?: string;
    };

export type ScheduleStatus = 'planned' | 'done' | 'missed';

export interface Preparation {
  id: string;
  /** 준비물 내용. 예: "흰 티셔츠", "물통" */
  text: string;
  checked: boolean;
}

export type SourceType = 'manual' | 'mail-ai';

export interface Schedule {
  id: string;
  title: string;
  institution: InstitutionKind;
  /** ISO 8601 (로컬 타임존 기준으로 생성). */
  startAt: string;
  endAt: string;
  isAllDay: boolean;
  repeatRule: RepeatRule;
  sourceType: SourceType;
  status: ScheduleStatus;
  preparations: Preparation[];
  memo?: string;
  /** 이 일정에 적용할 알림 오프셋(분). 없으면 설정의 기본값을 사용. */
  notificationOffsets?: number[];
  /** 반복 일정에서 특정 회차만 상태가 바뀐 경우 (YYYY-MM-DD -> status) */
  occurrenceStatus?: Record<string, ScheduleStatus>;
  /** 반복 일정에서 제외한 날짜 (YYYY-MM-DD) */
  excludedDates?: string[];
  updatedAt: string;
  deletedAt?: string;
}

/** 달력/홈에서 다루는 "특정 날짜에 실제로 열리는 1회분" 일정. */
export interface Occurrence {
  /** `${scheduleId}@${date}` */
  key: string;
  scheduleId: string;
  /** YYYY-MM-DD */
  date: string;
  startAt: string;
  endAt: string;
  schedule: Schedule;
  status: ScheduleStatus;
}

export type NotificationType = 'normal' | 'preparation' | 'snooze';

export interface NotificationRecord {
  id: string;
  scheduleId: string;
  /** 반복 일정의 특정 회차 (YYYY-MM-DD) */
  date: string;
  /** 일정 시작 기준 몇 분 전인지. 5 / 10 / 1440(하루 전) */
  offset: number;
  type: NotificationType;
  /** 실제로 울려야 하는 시각(ISO) */
  fireAt: string;
  firedAt?: string;
  snoozeCount: number;
  /** 사용자가 알림에서 완료/미완료를 선택했는지 */
  resolved: boolean;
  /** 비/눈 예보가 겹친 알림 (기획서 3.1) */
  weatherAlert?: boolean;
}

export interface ParsedItem {
  id: string;
  title: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm, 종일 일정이면 undefined */
  time?: string;
  institution: InstitutionKind;
  preparations: string[];
  /** 0~1. 낮으면 검토 화면에서 "확인 필요"로 표시. */
  confidence: number;
  /** 파싱 근거가 된 원문 줄 */
  sourceLine: string;
  /** 사용자가 검토 화면에서 체크 해제하면 등록 대상에서 빠진다. */
  selected: boolean;
}

export type ReviewStatus = 'pending' | 'approved' | 'edited' | 'discarded';

export interface MailImport {
  id: string;
  subject: string;
  receivedAt: string;
  rawEmail: string;
  parsedItems: ParsedItem[];
  reviewStatus: ReviewStatus;
  createdAt: string;
  updatedAt: string;
}

export interface DailyForecast {
  /** YYYY-MM-DD */
  date: string;
  /** WMO weather code */
  code: number;
  tempMin: number;
  tempMax: number;
  /** 강수확률 % */
  precipProbability: number;
}

export interface WeatherCache {
  region: Region;
  forecast: DailyForecast[];
  cachedAt: string;
}

export interface Region {
  name: string;
  latitude: number;
  longitude: number;
}

export interface Settings {
  /** 기본 알림 오프셋(분). 5 / 10 / 1440 */
  defaultOffsets: number[];
  /** 준비물 알림을 하루 전 알림에 첨부할지 */
  preparationReminder: boolean;
  /** 미완료 시 재알림 간격(분) */
  snoozeMinutes: number;
  /** 재알림 최대 횟수 */
  maxSnooze: number;
  region: Region;
  weatherEnabled: boolean;
  /** 홈/달력에서 보여줄 기관 필터 */
  institutionFilter: InstitutionKind[];
  /** 로그인한 보호자 이름 (로컬 프로필) */
  profileName?: string;
}

export interface SyncState {
  lastSyncedAt?: string;
  pendingCount: number;
  online: boolean;
}
