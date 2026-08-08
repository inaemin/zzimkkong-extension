# lms+ 공간 예약 API 정리

개편된 우아한테크코스 공간 예약 서비스(lms+)의 API를 확장(찜꽁 레이더)이 사용하는 범위에서 정리한 문서입니다.
실제 구현은 `src/services/lms-data/`(shared.js, normalizers.js)와 `src/page-network-hook.js`를 기준으로 합니다.

> 이 문서에는 실제 토큰, 개인 식별자, 예약자명 등을 남기지 않고 placeholder를 사용합니다.

## 호스트

| 구분            | 호스트                                         |
| --------------- | ---------------------------------------------- |
| 웹(예약 페이지) | `https://techcourse-lms-plus-web.woowahan.com` |
| API             | `https://techcourse-lms-plus-api.woowahan.com` |

확장은 URL 호스트로 서비스를 판별합니다. lms+ 예약 페이지는 `/space-reservations` 경로에서 동작합니다.

## 인증

- 모든 API 호출에 `Authorization: Bearer <JWT>` 헤더가 필요합니다. 없으면 `403`으로 거부됩니다.
- 토큰은 **하드코딩하지 않습니다.** 예약 페이지 앱이 로그인 시 브라우저 저장소(`localStorage`/`sessionStorage`)에 넣어둔 JWT를, 콘텐츠 스크립트가 같은 origin에서 런타임에 읽어 재사용합니다.
- 이 토큰은 같은 서비스(lms+)의 API 호출에만 재사용하며, 외부로 전송하거나 별도로 저장하지 않습니다.
- 요청은 `credentials: "include"`로 보냅니다.
- `401`/`403` 응답은 "로그인이 필요/만료" 형태의 사용자 안내 에러로 변환합니다.

## legacy(찜꽁)와의 차이

| 항목        | 찜꽁(legacy)                 | lms+                                    |
| ----------- | ---------------------------- | --------------------------------------- |
| 공간 목록   | 맵(sharingMapId) 기반        | flat `GET /api/spaces`                  |
| 지도/좌표   | 있음(맵 SVG)                 | 없음(층 정보만)                         |
| 예약 단위   | 10분                         | 30분                                    |
| 가용성 조회 | 전용 availability 엔드포인트 | 없음 → 공간별 예약을 받아 겹침으로 계산 |
| 인증        | 쿠키                         | JWT Bearer                              |
| 시간 형식   | ISO(타임존 변환 필요)        | 평면 `HH:MM:SS`                         |

## 엔드포인트

### 1. 공간 목록

```
GET /api/spaces
```

응답: 공간 배열(또는 `{ spaces: [...] }`).

| 필드                     | 설명                                   |
| ------------------------ | -------------------------------------- |
| `id`                     | 공간 ID                                |
| `name`                   | 공간명(예: 페어룸 07)                  |
| `floor`                  | 층(정수)                               |
| `active`                 | 활성 여부. `false`이면 레이더에서 제외 |
| `openTime` / `closeTime` | 운영 시작/종료(`HH:MM:SS`)             |
| `reservationUnitMinutes` | 예약 단위(분, lms+는 30)               |
| `maxReservationMinutes`  | 최대 예약 시간(분)                     |

### 2. 공간별 당일 예약 조회

```
GET /api/space-reservations?date=<YYYY-MM-DD>&spaceId=<id>
```

응답: 예약 배열(또는 `{ reservations: [...] }`).

| 필드                    | 설명                           |
| ----------------------- | ------------------------------ |
| `id`                    | 예약 ID                        |
| `startTime` / `endTime` | 예약 구간(`HH:MM:SS`)          |
| `purpose`               | 예약 목적                      |
| `reserverName`          | 예약자명(예: `닉네임(홍길동)`) |
| `mine`                  | 내 예약 여부(boolean)          |

> lms+에는 가용성 전용 엔드포인트가 없어, 각 공간의 당일 예약을 받아와 요청 구간과 겹치는지로 예약 가능 여부를 계산합니다.

### 3. 사용량(quota) 조회

```
GET /api/space-reservations/quota?date=<YYYY-MM-DD>
```

| 필드                                                                     | 설명                    |
| ------------------------------------------------------------------------ | ----------------------- |
| `unlimited`                                                              | 무제한 여부(boolean)    |
| `dailyLimitMinutes` / `dailyUsedMinutes` / `dailyRemainingMinutes`       | 일일 한도/사용/잔여(분) |
| `monthlyLimitMinutes` / `monthlyUsedMinutes` / `monthlyRemainingMinutes` | 월간 한도/사용/잔여(분) |

### 4. 내 예약 목록

```http
GET /api/space-reservations/me
```

응답: 내 예약 배열. 날짜·공간 파라미터 없이 **한 번의 요청으로 전부** 받습니다.
공간별 조회(2번)와 달리 여러 날짜가 섞여 오므로, 지난/예정 구분은 클라이언트가 합니다.

| 필드                    | 설명                           |
| ----------------------- | ------------------------------ |
| `id`                    | 예약 ID                        |
| `date`                  | 예약 날짜(`YYYY-MM-DD`)        |
| `startTime` / `endTime` | 예약 구간(`HH:MM:SS`)          |
| `spaceId`               | 공간 ID                        |
| `spaceName`             | 공간명(예: 수성)               |
| `floor`                 | 층(정수)                       |
| `purpose`               | 예약 목적                      |
| `reserverName`          | 예약자명(예: `닉네임(홍길동)`) |
| `mine`                  | 내 예약 여부(항상 `true`)      |

> 정렬 보장은 확인되지 않았습니다(관측 샘플은 날짜 내림차순이었으나 계약으로 보지 않습니다).
> 표시 순서는 클라이언트에서 정렬해 정합니다.

### 5. 예약 생성 (성공 감지 대상)

```
POST /api/space-reservations
```

확장은 이 요청을 직접 보내지 않고, 페이지가 보낸 예약 생성 POST의 **성공 응답(2xx)** body를 가로채 Slack 공유 모달을 띄웁니다.

성공 응답 body 예시 필드:

| 필드                    | 설명                            |
| ----------------------- | ------------------------------- |
| `id`                    | 생성된 예약 ID                  |
| `date`                  | 예약 날짜(`YYYY-MM-DD`)         |
| `startTime` / `endTime` | 예약 구간(`HH:MM:SS`)           |
| `spaceName`             | 공간명                          |
| `floor`                 | 층(정수) → `"12층"` 형태로 표기 |
| `purpose`               | 예약 목적                       |
| `reserverName`          | 예약자명                        |
| `spaceId`               | 공간 ID                         |
| `mine`                  | 내 예약 여부                    |

> 현재 확장은 예약 **생성(POST)** 성공만 Slack 모달 대상으로 처리합니다. 수정(PUT/PATCH)은 대상이 아닙니다.

## 확장에서의 처리 흐름

1. `GET /api/spaces`로 공간 목록을 받아 `active !== false`만 남기고 층 기준으로 정렬합니다.
2. 선택한 날짜에 대해 공간별로 `GET /api/space-reservations`를 조회하고, 요청 시간대와 겹치는지로 예약 가능 여부를 계산합니다.
3. 타임블록 클릭 시 기본 60분(다음 칸이 예약이면 30분)으로 예약 폼(날짜/시작 시간/이용 시간/공간)을 채웁니다.
4. 페이지의 예약 생성 POST가 2xx로 성공하면, 응답 body를 기반으로 Slack 공유 모달을 엽니다.

## 참고

- 시간은 모두 `HH:MM:SS` 평면 문자열이며, 확장 내부에서는 분 단위(minute of day)로 변환해 다룹니다.
- lms+ 관련 구현 위치: `src/services/lms-data/shared.ts`(요청·인증), `src/services/lms-data/normalizers.ts`(응답 정규화), `src/page-network-hook.ts`(예약 성공 감지), `src/features/form-fields/lms-form-sync.ts`(예약 폼 반영).
- 문서에 실제 토큰을 남기지 않습니다. 인증은 페이지가 저장소에 넣어둔 JWT를 런타임에 읽어 씁니다.
