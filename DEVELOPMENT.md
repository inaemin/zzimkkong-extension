# 개발 및 테스트 가이드

## 기본 준비

1. 의존성 설치
   - `npm install`
2. Playwright Chromium 설치
   - `npm run pw:install`
3. 기본 테스트 실행
   - `npm run pw:test:list`
   - `npm run pw:test`

## 테스트 명령

- `npm run pw:test:list`: 현재 Playwright 테스트 목록을 확인합니다.
- `npm run pw:test`: 전체 자동 테스트를 실행합니다.
- `npm run pw:test:headed`: 브라우저 창을 띄운 상태로 자동 테스트를 실행합니다.

## 수동 /remind 메시지 검증

- Slack 공유 모달의 `/remind` 메시지를 실제 Chromium 확장 로드 환경에서 확인하려면 아래 스크립트를 사용합니다.
  - `node scripts/verify-remind-message.mjs`
- 실행 전 `.env`에 `ZZK_GUEST_DETAIL_URL`을 실제 검증용 guest URL로 지정합니다.
- 기본 브라우저 채널은 Playwright 확장 로드 권장값인 `chromium`입니다. 필요하면 `.env`의 `PW_BROWSER_CHANNEL`로 바꿀 수 있습니다.
- OAuth 로그인이 필요하면 아래처럼 실행하고, 브라우저 창에서 로그인한 뒤 터미널에서 Enter를 눌러 검증을 시작합니다.
  - `node scripts/verify-remind-message.mjs --pause-before-check`
- `Google Chrome for Testing Framework ... no such file` 오류가 나면 Playwright 브라우저 캐시가 깨진 상태이므로 아래 순서로 복구합니다.
  - `npx playwright install --force chromium`
  - 계속 실패하면 `rm -rf ~/Library/Caches/ms-playwright` 후 `npm run pw:install`
- 스크린샷은 `artifacts/`에 저장되며 GitHub에는 올리지 않습니다.

## 로컬 환경 변수

1. `.env.example`을 복사해 `.env`를 만듭니다.
   - `cp .env.example .env`
2. 실제 찜꽁 guest URL, 로컬 브라우저 경로, 임시 profile 경로처럼 개인/로컬 값은 `.env`에만 적습니다.
3. `.env`, `crews.csv`, `src-backup/`, `dist/`, `*.zip`, `test-results/`는 GitHub에 올리지 않습니다.

## 유용한 환경 변수

- `ZZK_EXTENSION_PATH`: 로드할 확장 경로
- `PW_BROWSER_CHANNEL`: 수동 검증에 사용할 Playwright 브라우저 채널 (기본: `chromium`)
- `ZZK_GUEST_DETAIL_URL`: 수동 검증용 guest URL (`.env`에 개인 URL 지정 권장)

## 웹스토어 제출용 zip 생성

웹스토어 제출용 zip에는 실행에 필요한 파일만 포함합니다.

```bash
mkdir -p dist
rm -f dist/zzimkkong-radar-0.1.0-webstore.zip
zip -r dist/zzimkkong-radar-0.1.0-webstore.zip manifest.json src assets icons README.md \
  -x "src/ISSUE.md" "*.DS_Store"
unzip -t dist/zzimkkong-radar-0.1.0-webstore.zip
```

포함 대상: `manifest.json`, `src/`, `assets/`, `icons/`, `README.md`

제외 대상: `node_modules/`, `tests/`, `src-backup/`, `test-results/`, `artifacts/`, `dist/`, `*.zip`, `crews.csv`, `.env*`, `src/ISSUE.md`

## 참고 문서

- 프로젝트 개요: `README.md`
- 상세 API/회의실 매핑 문서: `ZZIMKKONG_MEETING_ROOMS_AND_API.md`
