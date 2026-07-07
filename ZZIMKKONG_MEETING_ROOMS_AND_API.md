# 찜꽁 회의실 데이터 + API 명세 (모바일 연동용)

업데이트: 2026-03-08

> 공개 저장소용 문서입니다. 실제 공유 맵 ID, 계정 토큰, 비밀번호, 개인/팀 식별자는 `.env` 또는 비공개 문서에만 보관하고 이 문서에는 placeholder만 남깁니다.

## 1) 문서 목적 / 근거 레벨

이 문서는 **origin이 다른 모바일 웹/앱**에서 찜꽁 API를 붙이기 위해 필요한 수준으로 정리한 API 명세다.

근거 레벨:

- `Confirmed-Live`: 실제 운영 API 호출로 확인
- `Confirmed-Source`: 공개 소스(`/tmp/2021-zzimkkong`)의 Controller/DTO 기준
- `Confirmed-PublicRef`: 공개 GitHub 코드/테스트/이슈 본문으로 교차 검증
- `Observed-Artifact`: 로컬 캡처 로그/테스트 산출물 기준
- `Estimated`: 강한 근거가 부족한 추정 (이 문서에서는 최소화)

## 2) 기준 컨텍스트

- 서비스: `https://zzimkkong.com`
- 운영 API host(현재 웹에서 관찰): `https://k8s.zzimkkong.com`
- 과거/대체 API host(공개 소스 상수): `https://api.zzimkkong.com`
- 기준 guest 링크 ID: `YOUR_SHARING_MAP_ID`
- 기준 맵: `mapId=234`, `mapName=판교 캠퍼스`

## 3) CORS / 다른 Origin 연동 가능성 (핵심)

### 3.1 실측 결과

| Probe | Result | 근거 |
|---|---|---|
| `GET https://k8s.zzimkkong.com/api/guests/maps?...` with `Origin: https://zzimkkong.com` | `200`, `Access-Control-Allow-Origin: https://zzimkkong.com` | Confirmed-Live |
| 동일 요청 with `Origin: https://example-mobile.com` | `403`, body: `Invalid CORS request` | Confirmed-Live |
| `OPTIONS https://k8s.zzimkkong.com/api/guests/maps/234/spaces/263/reservations` with foreign origin preflight | `403` | Confirmed-Live |
| `GET https://api.zzimkkong.com/api/members/me` with foreign origin | `401` + `Access-Control-Allow-Origin: https://example-mobile.com` | Confirmed-Live |

### 3.2 결론

- **`k8s.zzimkkong.com`는 다른 origin 브라우저 호출을 차단**한다.
- 즉, 별도 모바일 웹(`https://m.example.com`)에서 브라우저가 직접 `k8s.zzimkkong.com`을 치는 방식은 기본적으로 불가.
- 현실적인 방식:
  1. 모바일 도메인 BFF/프록시를 두고 서버-서버 호출
  2. 같은 origin으로 reverse proxy 구성
  3. (호스트 전환 시) `api.zzimkkong.com` 사용 가능성 재검증 (데이터/동작 차이 확인 필수)

### 3.3 모바일 연동 의사결정 가이드

| 접근 | 브라우저 CORS | 구현 난이도 | 운영 리스크 | 권장도 |
|---|---|---|---|---|
| 모바일 웹 -> `k8s.zzimkkong.com` 직접 호출 | 불가(실측 403) | 낮음 | 매우 높음(실패) | 비권장 |
| 모바일 웹 -> 자체 BFF -> `k8s.zzimkkong.com` | 가능 | 중간 | 중간(토큰/보안 관리 필요) | 권장 |
| 모바일 웹 -> reverse proxy로 same-origin화 | 가능 | 중간 | 중간(인프라 라우팅 필요) | 권장 |
| 모바일 웹 -> `api.zzimkkong.com` 직접 호출 | 가능성 있음(일부 실측 ACAO) | 낮음 | 높음(기능/데이터 일치 미확정) | 조건부 |

모바일 사이트를 바로 구현해야 한다면, **BFF 또는 reverse proxy를 기본 아키텍처**로 잡는 것이 가장 안전하다.

## 4) 공통 규칙

### 4.1 인증

- 멤버/마이페이지 계열은 `Authorization: Bearer <accessToken>` 필요 (`Confirmed-Live` + `Confirmed-Source`)
- 게스트 맵/공간 조회 계열은 토큰 없이도 동작 가능 (`Confirmed-Live`)

### 4.2 날짜/시간 형식

`Confirmed-Source` (`ValidatorMessage` 기준)

- `DATE_FORMAT`: `yyyy-MM-dd`
- `DATETIME_FORMAT`: `yyyy-MM-dd'T'HH:mm:ssxxx`
- `TIME_FORMAT`: `HH:mm:ss`

주의:

- 서버 응답 datetime은 `+00:00`(UTC) 형태로 내려오는 케이스가 있음 (`Confirmed-Live`)
- 클라이언트는 로컬 타임존 변환 로직 필수

### 4.3 페이지네이션

- `GET /api/guests/reservations?page=0`
- `GET /api/guests/reservations/history?page=0`
- 응답: `hasNext`, `pageNumber`, `data[]` (`Confirmed-Source`, `Observed-Artifact`)

필드 의미:

- `hasNext`: 다음 페이지 존재 여부 (`true`면 `page=현재+1` 요청 가능)
- `pageNumber`: 현재 페이지 번호(0 기반)

예) `hasNext=false`, `pageNumber=0`이면 **첫 페이지가 마지막 페이지**라는 뜻.

### 4.4 에러 바디

엔드포인트별로 에러 바디 shape가 완전히 통일되지 않음 (`Confirmed-Live`):

- 예시 A (`/api/members/me` 401):
  - `{ "timestamp", "status", "error", "path" }`
- 예시 B (`/api/guests/reservations?page=0` 401):
  - `{ "message" }`

## 5) 홈페이지 시작하기 -> 마이페이지 API 시퀀스

### 5.1 로그인된 상태에서 시작하기 (`Observed-Artifact`)

근거: `guest_transition_requests.txt`

1. `GET /api/members/me`
2. `GET /api/guests/reservations?page=0`
3. `GET /api/guests/reservations/history?page=0`

추가로 지난 예약에서 특정 예약 진입 시:

4. `GET /api/guests/maps?sharingMapId=...`
5. `GET /api/guests/maps/{mapId}/spaces`
6. `GET /api/guests/maps/{mapId}/spaces/{spaceId}/reservations?date=...`

### 5.2 비로그인 상태에서 시작하기 (`Confirmed-Source`, OSS 기준)

공개 프론트 코드 기준:

- `POST /api/members/token` (토큰 유효성 체크)
- `POST /api/members/login/token` (로그인)

### 5.3 마이페이지에서 예약 삭제 시 (`Confirmed-Live` + `Confirmed-Source` + `Confirmed-PublicRef`)

로그인 사용자가 마이페이지(`GuestMain`)에서 예약 삭제 버튼을 누를 때:

1. `DELETE /api/guests/maps/{mapId}/spaces/{spaceId}/reservations/{reservationId}`
2. Request body: `{ "password": null }`
3. Response: `204 No Content`
4. 프론트에서 `GET /api/guests/reservations?page=0` 재조회(목록 갱신)

참고:

- 비로그인 예약 검색 화면에서는 동일 endpoint에 `{ "password": "YOUR_GUEST_PASSWORD" }`로 삭제 호출.
- `guest_transition_requests.txt`에는 DELETE가 없지만, DevTools 실측으로 아래 케이스 확인:
  - `DELETE https://k8s.zzimkkong.com/api/guests/maps/234/spaces/262/reservations/48800`
  - body: `{ "password": null }`
  - response: `204 No Content` (response body 없음)

## 6) 엔드포인트 상세 명세

아래는 모바일 클라이언트 구현용으로 `request parameter / request body / response body`를 최대한 명시했다.

---

### 6.1 Auth / Member

#### 6.1.1 `POST /api/members/login/token`

- 근거: Confirmed-Source
- Auth: 불필요
- Query param: 없음
- Request body:

```json
{
  "email": "user@example.com",
  "password": "YOUR_PASSWORD"
}
```

- Response body (`200`):

```json
{
  "accessToken": "<jwt>"
}
```

- Validation:
  - `email`: email 형식
  - `password`: `^(?=.*[a-zA-Z])(?=.*[0-9]).{8,20}$`

#### 6.1.2 `POST /api/members/token`

- 근거: Confirmed-Source
- Auth: 토큰 기반 (헤더 필요)
- Query param: 없음
- Request body: 없음
- Response: 소스상 `200 OK` + empty body

#### 6.1.3 `GET /api/members/me`

- 근거: Confirmed-Live + Confirmed-Source
- Auth: `Authorization: Bearer <token>`
- Query param: 없음
- Request body: 없음
- Response body (`200`):

```json
{
  "id": 1,
  "email": "user@example.com",
  "userName": "애니",
  "emoji": {
    "name": "MAN_LIGHT_SKIN_TONE_TECHNOLOGIST",
    "code": "🧑🏻‍💻"
  },
  "organization": "woowa",
  "oauthProvider": "GOOGLE",
  "group": "NONE"
}
```

- 에러(`401`) 예시:

```json
{
  "timestamp": "2026-03-02T09:33:27.713+00:00",
  "status": 401,
  "error": "Unauthorized",
  "path": "/api/members/me"
}
```

---

### 6.2 마이페이지 예약 목록

#### 6.2.1 `GET /api/guests/reservations?page={page}`

- 근거: Observed-Artifact + Confirmed-Source
- Auth: 필요
- Query param:
  - `page`: `int` (0 기반)
- Request body: 없음
- Response body (`200`) schema:

```json
{
  "data": [
    {
      "id": 48798,
      "startDateTime": "2026-03-03T01:10:00+00:00",
      "endDateTime": "2026-03-03T01:30:00+00:00",
      "memberId": 123,
      "name": "애니",
      "description": "연극연습t",
      "mapId": 234,
      "sharingMapId": "YOUR_SHARING_MAP_ID",
      "mapName": "판교 캠퍼스",
      "spaceId": 263,
      "spaceName": "수성",
      "spaceColor": "#EB3933"
    }
  ],
  "hasNext": false,
  "pageNumber": 0
}
```

#### 6.2.2 `GET /api/guests/reservations/history?page={page}`

- 근거: Observed-Artifact + Confirmed-Source
- Auth: 필요
- Query param: `page`
- Request body: 없음
- Response body: `6.2.1`과 동일 shape (`data`, `hasNext`, `pageNumber`)

#### 6.2.3 `GET /api/guests/non-login/reservations`

- 근거: Confirmed-Source
- Auth: 불필요
- Query param:
  - `userName`: string
  - `searchStartTime`: datetime (`yyyy-MM-dd'T'HH:mm:ssxxx`)
  - `page`: int
- Request body: 없음
- Response body: `6.2.1`과 동일 shape

#### 6.2.4 마이페이지 예약 삭제(로그인 멤버)

- 근거: Confirmed-Live + Confirmed-Source + Confirmed-PublicRef
- 실제 호출 API:
  - `DELETE /api/guests/maps/{mapId}/spaces/{spaceId}/reservations/{reservationId}`
- Auth: 필요(마이페이지 자체가 로그인 전제)
- Query param: 없음
- Request body:

```json
{ "password": null }
```

- Response:
  - `204 No Content`
  - body 없음
- 후속 동작(프론트): `GET /api/guests/reservations?page=0` 재호출

참고: backend controller는 `@LoginEmail(isOptional = true)`라 guest/non-guest 공용 endpoint이며, mypage에서는 로그인 컨텍스트 + `password: null` 패턴으로 사용된다.

---

### 6.3 Guest 맵/공간/가용성/예약 조회

#### 6.3.1 `GET /api/guests/maps?sharingMapId={id}`

- 근거: Confirmed-Live + Confirmed-Source
- 추가 geometry 샘플: Observed-Artifact (실응답 발췌)
- Auth: 불필요
- Query param:
  - `sharingMapId`: string
- Request body: 없음
- Response body (`200`) 주요 필드:

```json
{
  "mapId": 234,
  "mapName": "판교 캠퍼스",
  "mapDrawing": "{...}",
  "thumbnail": "<svg...>",
  "sharingMapId": "YOUR_SHARING_MAP_ID",
  "slackUrl": "https://hooks.slack.com/services/...",
  "notice": "...",
  "managerEmail": null
}
```

- geometry 관련 추가 확인 사항 (`Observed-Artifact`):
  - `mapDrawing`은 JSON 문자열이며, 최소한 아래 구조를 포함한다.

```json
{
  "width": "850",
  "height": "1630",
  "mapElements": ["..."]
}
```

  - 즉, 맵 전체는 **고정 좌표계 캔버스**를 가지며, 기준 크기는 `850 x 1630`이다.
  - `thumbnail`은 같은 좌표계를 그대로 반영한 SVG 문자열이다.
  - 실응답 예시 일부:

```svg
<svg xmlns='http://www.w3.org/2000/svg' version='1.1' width='850px' height='1630px' viewBox='0 0 850 1630'>
  <g>
    <rect x='560' y='100' width='80' height='70' fill='#EB3933' opacity='0.3' />
  </g>
</svg>
```

해석 메모:

- `mapDrawing.width` / `mapDrawing.height`와 `thumbnail`의 `width` / `height` / `viewBox` 값이 같은 좌표계를 공유한다.
- 모바일/웹 렌더러는 이 값을 기준으로 비율 축소/확대하면 된다.
- `thumbnail`은 즉시 표시용 미리보기로 쓸 수 있고, 실제 상호작용 hitbox는 `spaces[].area`를 사용하는 편이 안전하다.

#### 6.3.2 `GET /api/guests/maps/{mapId}/spaces`

- 근거: Confirmed-Live + Confirmed-Source
- 추가 geometry 샘플: Observed-Artifact (실응답 발췌)
- Auth: 불필요
- Query param: 없음
- Request body: 없음
- Response body (`200`):

```json
{
  "spaces": [
    {
      "id": 262,
      "name": "금성",
      "color": "#EB3933",
      "area": "{\"shape\":\"rect\",...}",
      "reservationEnable": true,
      "settings": [
        {
          "settingId": 649,
          "settingStartTime": "07:00:00",
          "settingEndTime": "23:00:00",
          "reservationTimeUnit": 10,
          "reservationMinimumTimeUnit": 10,
          "reservationMaximumTimeUnit": 60,
          "enabledDayOfWeek": {
            "monday": true,
            "tuesday": true,
            "wednesday": true,
            "thursday": true,
            "friday": true,
            "saturday": true,
            "sunday": true
          }
        }
      ],
      "allowedGroups": []
    }
  ]
}
```

- `area` 필드는 문자열화된 JSON이며, 실응답 기준 최소 schema는 아래와 같다.

```json
{
  "shape": "rect",
  "x": 560,
  "y": 100,
  "width": 80,
  "height": 70
}
```

- 확인된 점:
  - 현재 판교 캠퍼스(`mapId=234`) 기준 주요 공간은 모두 `shape="rect"` 형태로 관찰됨 (`Observed-Artifact`).
  - `x`, `y`, `width`, `height`는 `6.3.1`의 `mapDrawing` / `thumbnail`과 동일한 좌표계를 사용한다.
  - 예: `금성(spaceId=262)`

```json
{
  "id": 262,
  "name": "금성",
  "color": "#EB3933",
  "area": "{\"shape\":\"rect\",\"x\":560,\"y\":100,\"width\":80,\"height\":70}",
  "reservationEnable": true
}
```

  - 위 geometry는 `thumbnail` 내부 사각형 `<rect x='560' y='100' width='80' height='70' ... />`와 일치한다.

구현 메모:

- 맵 전체 배경/선 요소는 `mapDrawing` 또는 `thumbnail`에서 표현된다.
- 방별 클릭/터치 영역, 색상 매핑, 예약 가능 여부 표현은 `spaces[].area`, `color`, `reservationEnable`로 복원할 수 있다.
- 다른 맵에서는 shape 종류가 달라질 가능성을 배제할 수 없으므로, 클라이언트 파서는 `rect` 고정으로 단정하지 말고 `shape` 분기를 두는 것이 안전하다.

#### 6.3.3 `GET /api/guests/maps/{mapId}/spaces/availability`

- 근거: Confirmed-Live + Confirmed-Source
- Auth: 불필요
- Query param:
  - `startDateTime`: datetime
  - `endDateTime`: datetime
- Request body: 없음
- Response body (`200`):

```json
{
  "mapId": 234,
  "spaces": [
    { "spaceId": 262, "isAvailable": false },
    { "spaceId": 263, "isAvailable": true }
  ]
}
```

#### 6.3.4 `GET /api/guests/maps/{mapId}/spaces/{spaceId}/reservations?date={yyyy-MM-dd}`

- 근거: Confirmed-Live + Confirmed-Source
- Auth: optional
- Query param:
  - `date`: `yyyy-MM-dd`
- Request body: 없음
- Response body (`200`):

```json
{
  "reservations": [
    {
      "id": 48781,
      "startDateTime": "2026-03-03T00:00:00+00:00",
      "endDateTime": "2026-03-03T01:00:00+00:00",
      "name": "쿠다",
      "description": "연극 연극 연극 연습",
      "isLoginReservation": true,
      "isMyReservation": false
    }
  ]
}
```

#### 6.3.5 `GET /api/guests/maps/{mapId}/spaces/reservations?date={yyyy-MM-dd}`

- 근거: Confirmed-Source
- Auth: optional
- Query param: `date`
- Request body: 없음
- Response body (`200`) schema:

```json
{
  "data": [
    {
      "spaceId": 262,
      "spaceName": "금성",
      "spaceColor": "#EB3933",
      "reservations": [
        {
          "id": 1,
          "startDateTime": "2026-03-03T10:00:00+00:00",
          "endDateTime": "2026-03-03T10:30:00+00:00",
          "name": "애니",
          "description": "회의",
          "isLoginReservation": true,
          "isMyReservation": false
        }
      ]
    }
  ]
}
```

---

### 6.4 Guest 예약 생성/수정/삭제

#### 6.4.1 `POST /api/guests/maps/{mapId}/spaces/{spaceId}/reservations`

- 근거: Confirmed-Live + Confirmed-Source + Observed-Artifact
- Auth: optional (로그인/비로그인 모두 경로 동일)
- Query param: 없음
- Request body(공통 필드):

```json
{
  "startDateTime": "2026-03-03T10:10:00+09:00",
  "endDateTime": "2026-03-03T10:30:00+09:00",
  "description": "연극연습",
  "name": "애니",
  "password": "YOUR_GUEST_PASSWORD"
}
```

- 유효성/동작:
  - `startDateTime`, `endDateTime`, `description`는 필수
  - 비로그인 생성은 `name/password` 요구
  - 로그인 생성은 서버에서 로그인 유저 정보로 owner 처리 (name/password 생략 가능)
- Response:
  - `201 Created`
  - body 없음
  - `Location: /api/guests/maps/{mapId}/spaces/{spaceId}/reservations/{reservationId}`

#### 6.4.2 `POST /api/guests/maps/{mapId}/spaces/{spaceId}/reservations/{reservationId}`

- 근거: Confirmed-Source
- 용도: 예약 조회/수정 전 비밀번호 인증성 조회
- Auth: optional
- Request body:

```json
{ "password": "YOUR_GUEST_PASSWORD" }
```

- Response body (`200`): `ReservationResponse` (id, start/end, name, description, isLoginReservation, isMyReservation ...)

#### 6.4.3 `PUT /api/guests/maps/{mapId}/spaces/{spaceId}/reservations/{reservationId}`

- 근거: Confirmed-Live + Confirmed-Source + Observed-Artifact
- Auth: optional
- Query param: 없음
- Request body: 생성과 동일 구조
- 실측 body 예시:

```json
{
  "startDateTime": "2026-03-03T10:10:00+09:00",
  "endDateTime": "2026-03-03T10:30:00+09:00",
  "description": "연극연습t"
}
```

- Response:
  - `200 OK`
  - body 없음

#### 6.4.4 `PATCH /api/guests/maps/{mapId}/spaces/{spaceId}/reservations/{reservationId}`

- 근거: Confirmed-Source + Observed-Artifact(훅/테스트)
- Auth: optional
- Request body: `PUT`과 유사 (부분 필드)
- Response: `200 OK`, body 없음

#### 6.4.5 `DELETE /api/guests/maps/{mapId}/spaces/{spaceId}/reservations/{reservationId}`

- 근거: Confirmed-Live + Confirmed-Source + Confirmed-PublicRef
- Auth: optional
- Request body:

로그인 멤버(마이페이지) 패턴:

```json
{ "password": null }
```

비로그인 패턴:

```json
{ "password": "YOUR_GUEST_PASSWORD" }
```

- 비밀번호 형식 규칙(비로그인): 숫자 4자리 (`^[0-9]{4}$`)
- Response: `204 No Content` (body 없음)

실측 샘플(로그인 마이페이지 삭제):

```http
DELETE /api/guests/maps/234/spaces/262/reservations/48800
Authorization: Bearer <token>
Content-Type: application/json

{"password":null}
```

- Status: `204 No Content`
- Response body: 없음

실사용 메모:

- 마이페이지의 삭제 버튼은 이 endpoint를 그대로 사용하며, 프론트는 `password: null`로 호출.
- 삭제 성공 후 마이페이지 목록을 다시 조회한다.

삭제 실패 주요 케이스(`Confirmed-Source`):

- `400 Bad Request`: 잘못된 비밀번호/비밀번호 형식 오류, 사용중 예약 삭제 시도, 과거 예약 삭제 시도
- `401 Unauthorized`: 해당 예약 권한 없음
- `404 Not Found`: 예약 또는 맵이 존재하지 않음

에러 body shape:

- 일반 오류: `{ "message": "..." }`
- 입력 필드 오류(비밀번호 형식 등): `{ "message": "...", "field": "password" }`

## 7) 판교 캠퍼스(mapId=234) spaceId 매핑

아래는 `GET /api/guests/maps/234/spaces` 실응답 스냅샷 기준.

| spaceId | name | color | reservationEnable |
|---:|---|---|:---:|
| 262 | 금성 | #EB3933 | Y |
| 263 | 수성 | #EB3933 | Y |
| 264 | 지구 | #EB3933 | Y |
| 265 | 화성 | #EB3933 | Y |
| 266 | 보이저 | #EB3933 | Y |
| 267 | 아폴로 | #EB3933 | Y |
| 268 | 디스커버리 | #EB3933 | Y |
| 269 | 허블 | #EB3933 | Y |
| 270 | 은하수 | #EB3933 | Y |
| 271 | 목성 | #FFEE58 | Y |
| 272 | 토성 | #FFEE58 | Y |
| 273 | 천왕성 | #FFEE58 | Y |
| 274 | 코치 1 | #FFEE58 | Y |
| 275 | 코치 2 | #FFEE58 | Y |
| 276 | 안드로메다같은 방 | #FFEE58 | Y |
| 277 | 스튜디오 | #FFEE58 | Y |
| 278 | 큰 강의실 | #0060FF | N |
| 279 | 옆 강의실 | #0060FF | N |
| 280 | 작은 강의실 | #0060FF | N |
| 281 | 스타트랙 | #8B5CF6 | N |
| 282 | 페 1 | #6BC2F9 | Y |
| 283 | 페 2 | #6BC2F9 | Y |
| 284 | 페 3 | #6BC2F9 | Y |
| 285 | 페 4 | #6BC2F9 | Y |
| 286 | 페 5 | #6BC2F9 | Y |
| 287 | 페 6 | #6BC2F9 | Y |
| 288 | 코워킹 존 | #5CAC1E | N |
| 289 | 캔틴 | #5CAC1E | N |
| 293 | 캔틴 | #5CAC1E | N |
| 294 | 라이브러리 | #5CAC1E | N |
| 295 | 포커스 존 | #5CAC1E | N |
| 296 | 코워킹 존 | #5CAC1E | N |
| 297 | 공조실 | #bbbbbb | N |
| 298 | 화장실 | #bbbbbb | N |
| 299 | 출입구 | #bbbbbb | N |
| 300 | 코치룸 | #bbbbbb | N |
| 301 | 공조실 | #bbbbbb | N |
| 302 | 화장실 | #bbbbbb | N |
| 303 | 출입구 | #bbbbbb | N |
| 304 | 서버실 | #bbbbbb | N |
| 305 | 코치룸 | #bbbbbb | N |
| 306 | 공조실 | #bbbbbb | N |
| 307 | 화장실 | #bbbbbb | N |
| 308 | 출입구 | #bbbbbb | N |
| 309 | 라이브러리 | #5CAC1E | N |
| 310 | 코워킹 존 | #5CAC1E | N |
| 311 | 페 7 | #6BC2F9 | Y |
| 312 | 페 8 | #6BC2F9 | Y |
| 313 | 페 9 | #6BC2F9 | Y |
| 314 | 페 10 | #6BC2F9 | Y |
| 315 | 페 11 | #6BC2F9 | Y |
| 316 | 페 12 | #6BC2F9 | Y |
| 317 | 페 13 | #6BC2F9 | Y |
| 318 | 페 14 | #6BC2F9 | Y |

## 8) 운영 메모

- `spaceId <-> name` 매핑은 맵(`mapId`)마다 다르다. 다른 공유 링크에서는 반드시 `/api/guests/maps/{mapId}/spaces` 재조회가 필요.
- 현재 확장 기능의 핵심 회의실 구간은 `262~270`(금성~은하수).
- 별도 origin 모바일 웹을 만들 경우, **CORS 때문에 `k8s.zzimkkong.com` 직접 호출은 사실상 불가**하므로 BFF/프록시 아키텍처를 기본 전제로 잡아야 한다.

## 9) Host 차이 검증 체크리스트 (`k8s` vs `api`)

`api.zzimkkong.com`을 모바일 클라이언트 직접 호출 후보로 검토할 때, 아래 항목을 반드시 사전 검증한다.

- 같은 `sharingMapId`로 조회한 `mapId/mapName` 일치 여부
- `spaces[]` 개수/`spaceId/name/color/reservationEnable` 일치 여부
- `availability` 결과 일치 여부(동일 시간창)
- 예약 생성/수정/삭제 상태코드 및 body 유무 일치 여부
- 인증 실패/권한 실패 에러 body shape 일치 여부
- 응답 시간대(UTC/offset) 및 직렬화 포맷 일치 여부

위 항목 중 하나라도 어긋나면, 모바일 앱에는 `api` 직접 호출 대신 **BFF 경유 방식**을 유지하는 것이 안전하다.
