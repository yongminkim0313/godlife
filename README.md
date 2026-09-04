# 하루동행 (godlife)

어린이집·유치원 일정과 가정 일정을 한곳에서 관리하고, 알림·재알림으로 실천을 돕는 육아 스케줄 앱.

기획서(핵심요구 1~7 + 추가기능 3.1~3.4)를 **Vue 3 + Pinia + TypeScript PWA**로 구현했습니다.
서버·계정 없이 온디바이스(localStorage)에서 동작하므로, 클론 후 바로 실행해 전체 흐름을 확인할 수 있습니다.

```bash
npm install
npm run dev        # 개발 서버
npm run build      # 프로덕션 빌드 (tsc + vite)
npm run preview    # 빌드 결과 확인 (서비스 워커·오프라인 동작 포함)
npm test           # 단위 테스트 103개
npm run typecheck  # 타입 검사
```

처음 실행하면 데이터가 비어 있습니다. **설정 → 샘플 불러오기**로 예시 일정과 월 계획표 메일을 넣고 둘러보는 것을 권합니다.

---

## 기획서 → 구현 대응표

| 기획서 | 구현 | 위치 |
|---|---|---|
| 1. 반복 일정 | 매주 반복(요일 다중 선택·종료일·회차별 제외/상태) | `src/lib/repeat.ts`, `src/screens/ScheduleFormScreen.vue` |
| 2. 메일 자동 등록 (AI) | Gmail 계정 연동 또는 본문 붙여넣기 → 일정·준비물 후보 추출 | `src/lib/mail/`, `src/lib/mailParser.ts`, `src/screens/MailImportScreen.vue` |
| 3. 다중 알림 | 5·10·30·60분 전, 하루 전 동시 설정 | `src/lib/notifications.ts`, `src/screens/NotificationSettingsScreen.vue` |
| 4. 월간 달력 | 6주 그리드, 기관별 색 점, 날짜별 목록 | `src/screens/CalendarScreen.vue` |
| 5. 기관 필터 | 유치원/어린이집/가정 토글 (홈·달력 공유) | `src/components/InstitutionFilter.vue` |
| 6. 위젯 | 다음 일정 + 날씨 + 준비물 위젯 렌더링 | `src/screens/WidgetPreviewScreen.vue` |
| 7. 재알림 | 종료 후 실천 확인 → 미완료 시 스누즈(간격·횟수 설정) | `src/lib/notifications.ts`, `src/components/NotificationInbox.vue` |
| 3.1 날씨 연동 | Open-Meteo 예보, 홈·달력·상세·위젯 표시, 비/눈 알림 | `src/lib/weather.ts` |
| 3.2 오프라인 캐싱 | 로컬 저장 + 서비스 워커 앱 셸 + 온라인 복귀 시 병합 | `src/lib/db.ts`, `src/lib/sync.ts`, `public/sw.js` |
| 3.3 AI 파싱 검토 화면 | 승인 전 확인·수정·삭제·추가, 신뢰도 낮은 항목 강조 | `src/screens/AiReviewScreen.vue` |
| 3.4 준비물 알림 | 준비물 목록 관리 + 하루 전 알림에 첨부 | `src/components/PreparationList.vue`, `composeCopy()` |

## 메일 계정 연동 (Gmail)

**메일 가져오기** 화면에서 계정을 연결하면 계획표로 보이는 메일을 골라 바로 가져올 수 있습니다.
브라우저 단독으로 동작하며(서버·클라이언트 시크릿 없음), **읽기 전용**(`gmail.readonly`) 권한만 요청합니다.
메일 본문은 기기 안에서만 처리되고 외부로 전송되지 않습니다.

### 준비 (한 번만)

1. [Google Cloud 콘솔](https://console.cloud.google.com/)에서 프로젝트를 만들고 **Gmail API**를 사용 설정합니다.
2. **OAuth 동의 화면**을 구성하고, 본인 계정을 *테스트 사용자*로 추가합니다.
3. **사용자 인증 정보 → OAuth 클라이언트 ID → 웹 애플리케이션**을 만들고,
   *승인된 자바스크립트 원본*에 앱 주소(예: `http://localhost:5173`)를 넣습니다.
4. 발급된 클라이언트 ID를 **설정 → 메일 계정**에 붙여넣습니다. (또는 `.env`에 `VITE_GOOGLE_CLIENT_ID=` 로 넣고 빌드)

클라이언트 ID는 비밀값이 아니며 브라우저에 노출되는 것이 정상입니다. 액세스 토큰은 `sessionStorage`에만 두어 탭을 닫으면 사라집니다.

### 동작

- 기본 검색어로 `계획표 / 월간계획 / 교육계획 / 가정통신문 / 알림장 / 유치원 / 어린이집` 이 포함된 최근 120일 메일을 찾습니다. 검색어는 직접 바꿀 수 있습니다.
- 본문은 `text/plain`을 우선하고, 없으면 HTML을 평문으로 바꿔 파싱합니다. 이때 **표의 칸은 `|`, 행은 줄바꿈**으로 남겨 `5(수) | 봄나들이` 형태의 월간계획표 표를 그대로 읽습니다.
- 가져온 메일도 자동 등록되지 않습니다. 똑같이 **AI 파싱 검토 → 등록 승인**을 거칩니다.

### 제약

- 액세스 토큰은 약 1시간 뒤 만료됩니다(리프레시 토큰 없음). 만료되면 다시 연결하면 됩니다.
- `gmail.readonly`는 구글의 제한된 범위라, 테스트 사용자를 넘어 **일반 배포하려면 앱 검증(CASA 보안 평가)** 이 필요합니다. 개인·가족 사용은 테스트 사용자 등록만으로 충분합니다.
- **첨부파일(PDF·이미지) 계획표는 아직 읽지 못합니다.** 본문이 비고 첨부만 있는 메일은 그 사실을 화면에 알려 줍니다.
- IMAP은 브라우저에서 직접 연결할 수 없어(원시 TCP 불가) 지원하지 않습니다. 다른 메일함은 붙여넣기를 사용하세요.
- 제공자는 `MailProvider` 인터페이스 뒤에 있어, 다른 메일 서비스를 붙일 때 화면은 그대로 둡니다.

## 화면 (라우트)

`vue-router`의 해시 모드 기준. 화면은 라우트 단위로 지연 로딩됩니다. 기획서 4장의 화면 이동 흐름을 그대로 따릅니다.

| 화면 | 경로 |
|---|---|
| 스플래시 | `/` |
| 로그인 | `/login` |
| 홈 (다음 일정 + 날씨) | `/home` |
| 월간 달력 | `/calendar` |
| 일정 등록 / 수정 | `/schedule/new`, `/schedule/:id/edit` |
| 일정 상세 (완료 체크·준비물) | `/schedule/:id/:date` |
| 알림 설정 | `/schedule/:id/:date/notifications` |
| 메일 가져오기 (계정 연동 / 붙여넣기) | `/mail` |
| AI 파싱 검토 | `/mail/:id/review` |
| 설정 (알림·기관·날씨 지역·데이터) | `/settings` |
| 홈 화면 위젯 | `/widget` |

기관 필터는 별도 화면 대신 홈·달력 상단에 상주하는 칩으로 두었습니다(한 번에 보고 바로 토글하는 쪽이 목적에 맞습니다).
알림 발생 화면은 라우트가 아니라 어느 화면에서든 뜨는 알림 카드(`NotificationInbox`)로 구현했습니다.

## 구조

```
src/lib/      도메인 로직 (프레임워크 무관, 순수 TypeScript)
src/types/    데이터 모델
src/stores/   Pinia 스토어 (앱 상태 · 액션)
src/composables/  메일 계정 연결 상태
src/screens/  화면 SFC (라우트 단위 지연 로딩)
src/components/  공용 SFC
src/router/   라우트 정의
```

도메인 로직(`src/lib`)과 타입은 Vue에 의존하지 않습니다. 화면을 다시 만들어도 파서·알림 엔진·
동기화·테스트는 그대로 재사용됩니다. 실제로 React로 만들었던 초기 버전을 Vue로 옮길 때
이 계층과 91개 테스트는 한 줄도 고치지 않았습니다.

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

**상태 저장 시점** — 스토어 액션은 상태를 바꾼 뒤 *같은 호출 안에서* 저장소에 기록하고 나서 동기화를 깨웁니다.
저장을 감시자(watch)에 맡기면 동기화가 아직 반영되지 않은 저장소를 읽어 방금 만든 변경을 덮어쓸 수 있습니다.

**오프라인** — 일정·계획표·설정·날씨 캐시가 모두 기기에 있어 네트워크 없이도 조회·등록·수정이 됩니다.
서비스 워커는 빌드 산출물 전체를 precache 합니다(`src/build/precache-plugin.ts`가 빌드 후 실제 파일 목록을
`sw.js`에 주입). 손으로 적은 셸 목록만 캐시하면 해시가 붙은 엔트리 JS·CSS와 라우트 청크가 빠져,
첫 방문 직후 오프라인이 되면 빈 화면이 뜹니다. 캐시 조회는 `ignoreVary`로 합니다 — 정적 서버가 붙이는
`Vary: Origin` 때문에, Origin 없이 저장된 precache 응답이 Origin을 보내는 모듈 스크립트 요청과 매칭되지 않습니다. 온라인이 되면 `SyncEngine`이 백그라운드로 병합합니다
(`updatedAt`이 큰 쪽이 이기는 마지막 저장 우선). 서버가 붙기 전까지는 `RemoteAdapter`의 로컬 미러 구현을 사용합니다.

## 배포 (Docker + HTTPS)

상시 서버에 컨테이너로 올립니다. 빌드가 이미지 안에서 일어나므로 서버에 Node가 필요 없고,
Caddy가 인증서 발급·갱신까지 맡습니다. 기본 배포 위치는 도메인 아래 **`/godlife`** 입니다
(예: `https://youthvision.co.kr/godlife/`).

```bash
git clone https://github.com/yongminkim0313/godlife.git
cd godlife
cp .env.docker.example .env     # 값 채우기
docker compose up -d --build
```

### 경로 설정

| 값 | 기본 | 설명 |
|---|---|---|
| `BASE_PATH` | `/godlife/` | 번들에 구워지는 base. **끝에 슬래시 필수**, 바꾸면 `--build` 재빌드 |
| `APP_PATH` | `/godlife` | Caddy가 받는 경로. 끝 슬래시 없음 |

둘은 같은 경로를 가리켜야 합니다. 루트로 옮기려면 `BASE_PATH=/`, `APP_PATH=""` 로 두고 재빌드합니다.

### TLS 방식

| 상황 | `SITE_ADDRESS` | `CADDY_TLS` |
|---|---|---|
| 이 컨테이너가 도메인을 직접 받음 (80·443 개방) | `youthvision.co.kr` | `tls you@youthvision.co.kr` |
| 앞단 웹서버가 도메인을 받고 프록시 | `:80` | (비움) + `HTTP_PORT=8080` |
| LAN 전용 | `church-server.local` | `tls internal` |
| 포트포워딩 불가 | `:80` | (비움) + `--profile tunnel` |

LAN 모드에서 브라우저 경고를 없애려면 루트 CA를 꺼내 접속 기기에 신뢰시킵니다.

```bash
docker compose cp web:/data/caddy/pki/authorities/local/root.crt .
```

### 앞단 웹서버가 이미 도메인을 받고 있다면

`/godlife/` 를 **경로를 자르지 말고 그대로** 이 컨테이너로 넘겨야 합니다. 컨테이너의 Caddy가
`/godlife` 를 직접 처리하기 때문에, 앞단에서 경로를 벗겨 보내면 404가 납니다.

nginx:

```nginx
location /godlife/ {
    proxy_pass http://127.0.0.1:8080;   # 끝에 경로를 붙이지 않아야 원본 URI가 유지됩니다
    proxy_set_header Host              $host;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Apache:

```apache
ProxyPass        /godlife/ http://127.0.0.1:8080/godlife/
ProxyPassReverse /godlife/ http://127.0.0.1:8080/godlife/
```

### HTTPS가 필요한 이유

브라우저는 아래 기능을 보안 컨텍스트(HTTPS 또는 localhost)에서만 허용합니다. http로 열면
일정 관리는 되지만 이 셋이 빠집니다.

- **서비스 워커** — 오프라인 조회·새로고침
- **알림 권한** — OS 알림 (없으면 앱 내 알림 카드로만)
- **Gmail 연동** — 구글이 https가 아닌 원본을 OAuth에 허용하지 않음

Gmail을 쓰려면 `https://youthvision.co.kr` 을 Google Cloud 콘솔의 **승인된 자바스크립트 원본**에
추가하세요.

### 운영

```bash
docker compose logs -f web                        # 로그 (인증서 발급 과정 포함)
docker compose up -d --build                      # 새 버전 배포
docker compose down                               # 중지 (인증서 볼륨은 유지)
curl -sf https://youthvision.co.kr/godlife/healthz # 상태 확인
```

배포 후 새 버전이 바로 전파되도록 `index.html`·`sw.js`는 `no-cache`,
해시가 붙은 `/assets/*`는 1년 `immutable`로 응답합니다.
서비스 워커 scope는 `/godlife/` 로 한정되어 같은 도메인의 다른 앱과 충돌하지 않습니다.

## 테스트

```bash
npm test
```

반복 규칙 전개, 메일 파서(날짜·시간·준비물·신뢰도), Gmail 본문 디코딩·HTML 표 평문화·API 클라이언트, 알림 생성/스누즈/문구, 오프라인 캐시와 동기화 병합, 날씨 조회·캐시, Pinia 스토어(저장 시점·승인 전 등록 금지·재알림·스코프 정리)까지 103개 테스트가 있습니다.
브라우저 스모크(스플래시 → 로그인 → 샘플 → 검토·승인 → 상세 → 위젯 → 오프라인 새로고침)도 Playwright로 확인했습니다.

## 아직 남은 것 / 다음 단계

- **첨부 계획표 파싱**: PDF·이미지로 온 계획표는 아직 읽지 못합니다. PDF 텍스트 추출 또는 OCR이 필요합니다.
- **토큰 갱신**: 브라우저 단독 방식이라 리프레시 토큰이 없어 약 1시간마다 재연결이 필요합니다. 서버가 생기면 오프라인 액세스로 바꿀 수 있습니다.
- **진짜 홈 화면 위젯**: 웹에서는 OS 홈 화면에 위젯을 붙일 수 없어 `/widget`이 같은 데이터를 그대로 렌더링합니다. 네이티브 셸(WidgetKit / App Widget)에서 같은 저장소를 읽으면 됩니다.
- **백그라운드 푸시**: 앱이 꺼진 상태의 알림은 웹 푸시(VAPID) 서버 또는 네이티브 알림 스케줄러가 필요합니다. 현재는 앱이 떠 있을 때 발화합니다.
- **서버 동기화·계정**: `RemoteAdapter` 구현체만 교체하면 병합 규칙은 그대로 씁니다.
- 기획서 6장(부부 간 일정 공유·당번, 완료 통계, 기관별 알림음)은 이번 범위에서 제외했습니다.
