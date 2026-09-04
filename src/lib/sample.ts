import type { MailImport, Schedule } from '../types';
import { addDays, uid } from './date';
import { parseMail } from './mailParser';

/** 데모용 시드 데이터. 설정 화면에서 수동으로 불러온다. */

export const SAMPLE_MAIL = (base: Date): string => {
  const y = base.getFullYear();
  const m = base.getMonth() + 1;
  const day = (offset: number) => {
    const d = addDays(base, offset);
    return { m: d.getMonth() + 1, d: d.getDate(), w: ['일', '월', '화', '수', '목', '금', '토'][d.getDay()] };
  };
  const a = day(1);
  const b = day(3);
  const c = day(6);
  const e = day(10);
  return [
    `${y}년 ${m}월 유치원 월간 교육계획표`,
    '안녕하세요, 한 달 일정 안내드립니다.',
    '',
    `${a.m}월 ${a.d}일(${a.w}) 10:00 텃밭 가꾸기 - 준비물: 장화, 모자`,
    `${b.m}월 ${b.d}일(${b.w}) 09:30 소방 대피 훈련`,
    `${c.m}월 ${c.d}일(${c.w}) 오전 10시 봄 소풍 / 준비물: 도시락, 물통, 돗자리`,
    `${e.m}월 ${e.d}일(${e.w}) 생일 파티 (흰색 상의 준비해 주세요)`,
    '',
    '감사합니다. 원장 올림',
  ].join('\n');
};

export function buildSample(now = new Date()): { schedules: Schedule[]; mail: MailImport } {
  const iso = (d: Date, h: number, m: number) => {
    const x = new Date(d);
    x.setHours(h, m, 0, 0);
    return x.toISOString();
  };
  const stamp = now.toISOString();

  const schedules: Schedule[] = [
    {
      id: uid('sch'),
      title: '어린이집 등원',
      institution: 'daycare',
      startAt: iso(now, 9, 0),
      endAt: iso(now, 9, 30),
      isAllDay: false,
      repeatRule: { freq: 'weekly', weekdays: [1, 2, 3, 4, 5] },
      sourceType: 'manual',
      status: 'planned',
      preparations: [{ id: uid('prep'), text: '물통', checked: false }],
      updatedAt: stamp,
    },
    {
      id: uid('sch'),
      title: '숲 체험 소풍',
      institution: 'kindergarten',
      startAt: iso(addDays(now, 2), 10, 0),
      endAt: iso(addDays(now, 2), 14, 0),
      isAllDay: false,
      repeatRule: { freq: 'none' },
      sourceType: 'mail-ai',
      status: 'planned',
      preparations: [
        { id: uid('prep'), text: '도시락', checked: false },
        { id: uid('prep'), text: '돗자리', checked: false },
        { id: uid('prep'), text: '여벌 옷', checked: false },
      ],
      memo: '우천 시 실내 활동으로 대체',
      updatedAt: stamp,
    },
    {
      id: uid('sch'),
      title: '가정 학습지 하기',
      institution: 'home',
      startAt: iso(now, 19, 30),
      endAt: iso(now, 20, 0),
      isAllDay: false,
      repeatRule: { freq: 'weekly', weekdays: [1, 3, 5] },
      sourceType: 'manual',
      status: 'planned',
      preparations: [],
      updatedAt: stamp,
    },
  ];

  const raw = SAMPLE_MAIL(now);
  const mail: MailImport = {
    id: uid('mail'),
    subject: `${now.getMonth() + 1}월 유치원 월간 교육계획표 안내`,
    receivedAt: stamp,
    rawEmail: raw,
    parsedItems: parseMail(raw, { receivedAt: now }),
    reviewStatus: 'pending',
    createdAt: stamp,
    updatedAt: stamp,
  };

  return { schedules, mail };
}
