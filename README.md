# 하루동행 (godlife)

어린이집·유치원 일정과 가정 일정을 한곳에서 관리하고, 알림·재알림으로 실천을 돕는 육아 스케줄 앱.

기획서(핵심요구 1~7 + 추가기능 3.1~3.4)를 **React + TypeScript PWA**로 구현했습니다.
서버·계정 없이 온디바이스(localStorage)에서 동작하므로, 클론 후 바로 실행해 전체 흐름을 확인할 수 있습니다.

```bash
npm install
npm run dev        # 개발 서버
npm run build      # 프로덕션 빌드 (tsc + vite)
npm run preview    # 빌드 결과 확인 (서비스 워커·오프라인 동작 포함)
npm test           # 단위 테스트 66개
npm run typecheck  # 타입 검사
```

처음 실행하면 데이터가 비어 있습니다. **설정 → 샘플 불러오기**로 예시 일정과 월 계획표 메일을 넣고 둘러보는 것을 권합니다.

---

## 기획서 → 구현 대응표

| 기획서 | 구현 | 위치 |
|---|---|---|
| 1. 반복 일정 | 매주 반복(요일 다중 선택·종료일·회차별 제외/상태) | `src/lib/repeat.ts`, `src/screens/ScheduleForm.tsx` |
| 2. 메일 자동 등록 (AI) | 월 계획표 본문 파싱 → 일정·준비물 후보 추출 | `src/lib/mailParser.ts`, `src/screens/MailImportScreen.tsx` |
| 3. 다중 알림 | 5·10·30·60분 전, 하루 전 동시 설정 | `src/lib/notifications.ts`, `src/screens/NotificationSettings.tsx` |
| 4. 월간 달력 | 6주 그리드, 기관별 색 점, 날짜별 목록 | `src/screens/CalendarScreen.tsx` |
| 5. 기관 필터 | 유치원/어린이집/가정 토글 (홈·달력 공유) | `src/components/InstitutionFilter.tsx` |
| 6. 위젯 | 다음 일정 + 날씨 + 준비물 위젯 렌더링 | `src/screens/WidgetPreview.tsx` |
| 7. 재알림 | 종료 후 실천 확인 → 미완료 시 스누즈(간격·횟수 설정) | `src/lib/notifications.ts`, `src/components/NotificationInbox.tsx` |
| 3.1 날씨 연동 | Open-Meteo 예보, 홈·달력·상세·위젯 표시, 비/눈 알림 | `src/lib/weather.ts` |
| 3.2 오프라인 캐싱 | 로컬 저장 + 서비스 워커 앱 셸 + 온라인 복귀 시 병합 | `src/lib/db.ts`, `src/lib/sync.ts`, `public/sw.js` |
| 3.3 AI 파싱 검토 화면 | 승인 전 확인·수정·삭제·추가, 신뢰도 낮은 항목 강조 | `src/screens/AiReview.tsx` |
| 3.4 준비물 알림 | 준비물 목록 관리 + 하루 전 알림에 첨부 | `src/components/PreparationList.tsx`, `composeCopy()` |

## 화면 (라우트)

`HashRouter` 기준. 기획서 4장의 화면 이동 흐름을 그대로 따릅니다.

| 화면 | 경로 |
|---|---|
| 스플래시 | `/` |
| 로그인 | `/login` |
| 홈 (다음 일정 + 날씨) | `/home` |
| 월간 달력 | `/calendar` |
| 일정 등록 / 수정 | `/schedule/new`, `/schedule/:id/edit` |
| 일정 상세 (완료 체크·준비물) | `/schedule/:id/:date` |
| 알림 설정 | `/schedule/:id/:date/notifications` |
| 메일 가져오기 | `/mail` |
| AI 파싱 검토 | `/mail/:id/review` |
| 설정 (알림·기관·날씨 지역·데이터) | `/settings` |
| 홈 화면 위젯 | `/widget` |

기관 필터는 별도 화면 대신 홈·달력 상단에 상주하는 칩으로 두었습니다(한 번에 보고 바로 토글하는 쪽이 목적에 맞습니다).
알림 발생 화면은 라우트가 아니라 어느 화면에서든 뜨는 알림 카드(`NotificationInbox`)로 구현했습니다.

## 데이터 모델

기획서 5장 초안을 그대로 두고, 구현하면서 필요한 필드만 더했습니다 (`src/types/index.ts`).

- `Schedule` — 초안 + `occurrenceStatus`(반복 일정의 특정 회차만 완료/미완료), `excludedDates`(회차 제외), `notificationOffsets`(일정별 알림), `updatedAt`/`deletedAt`(동기화 병합용)
- `Occurrence` — 반복 규칙을 펼친 "특정 날짜 1회분". 달력·홈·알림이 모두 이 단위로 동작합니다.
- `NotificationRecord` — 초안 + `weatherAlert`(비/눈 예보와 겹친 알림)
- `MailImport`, `ParsedItem` — `ParsedItem`에 `confidence`와 `sourceLine`을 두어 검토 화면에서 근거를 보여줍니다.
- `WeatherCache`, `Settings`

## 동작 방식 메모

**AI 파싱** — 지금 파서는 규칙 기반입니다. `3월 5일(목)`, `5(수)`, `3/5` 같은 날짜 표기와 `오전 10시`/`14:30` 시각,
`준비물: 도시락, 물통`(명사형)과 `(흰색 상의 준비해 주세요)`(서술형) 준비물을 모두 읽습니다.
본문에 적힌 요일과 실제 요일이 어긋나면 신뢰도를 크게 낮춰 검토 화면에서 **확인 필요**로 뜹니다.
LLM으로 바꿀 때는 `parseMail()`이 `ParsedItem[]`을 돌려주는 계약만 지키면 되고, 검토·승인 흐름은 그대로 재사용됩니다.

**절대 자동 등록하지 않음** — 파싱 결과는 `reviewStatus: 'pending'` 상태로만 저장되고,
사용자가 검토 화면에서 **등록 승인**을 눌러야 `Schedule`이 만들어집니다(기획서 3.3의 안전장치).

**알림** — 앱이 켜져 있는 동안 20초마다 발화 시각을 확인해, 권한이 있으면 OS 알림으로, 없으면 앱 내 카드로 띄웁니다.
사전 알림(5·10분·하루 전)은 아직 일정이 시작되지 않았으므로 완료/미완료를 묻지 않고 확인만 받습니다.
완료 여부는 일정이 끝난 뒤 뜨는 실천 확인 알림에서 묻고, **미완료**를 고르면 설정한 간격·횟수만큼 재알림이 붙습니다.

**오프라인** — 일정·계획표·설정·날씨 캐시가 모두 기기에 있어 네트워크 없이도 조회·등록·수정이 됩니다.
서비스 워커가 앱 셸을 캐시해 오프라인 새로고침도 동작합니다. 온라인이 되면 `SyncEngine`이 백그라운드로 병합합니다
(`updatedAt`이 큰 쪽이 이기는 마지막 저장 우선). 서버가 붙기 전까지는 `RemoteAdapter`의 로컬 미러 구현을 사용합니다.

## 테스트

```bash
npm test
```

반복 규칙 전개, 메일 파서(날짜·시간·준비물·신뢰도), 알림 생성/스누즈/문구, 오프라인 캐시와 동기화 병합, 날씨 조회·캐시까지 66개 테스트가 있습니다.
브라우저 스모크(스플래시 → 로그인 → 샘플 → 검토·승인 → 상세 → 위젯 → 오프라인 새로고침)도 Playwright로 확인했습니다.

## 아직 남은 것 / 다음 단계

- **메일 계정 연동**: 지금은 본문 붙여넣기(공유)로 받습니다. IMAP·Gmail API 연동은 토큰 보관이 필요해 서버 작업과 함께 진행해야 합니다.
- **진짜 홈 화면 위젯**: 웹에서는 OS 홈 화면에 위젯을 붙일 수 없어 `/widget`이 같은 데이터를 그대로 렌더링합니다. 네이티브 셸(WidgetKit / App Widget)에서 같은 저장소를 읽으면 됩니다.
- **백그라운드 푸시**: 앱이 꺼진 상태의 알림은 웹 푸시(VAPID) 서버 또는 네이티브 알림 스케줄러가 필요합니다. 현재는 앱이 떠 있을 때 발화합니다.
- **서버 동기화·계정**: `RemoteAdapter` 구현체만 교체하면 병합 규칙은 그대로 씁니다.
- 기획서 6장(부부 간 일정 공유·당번, 완료 통계, 기관별 알림음)은 이번 범위에서 제외했습니다.
