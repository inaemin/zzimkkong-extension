# Git Commit Skill

Create well-formatted git commits following conventional commit standards, with Korean descriptions and bodies.

## Usage

```
/commit
```

## Behavior

1. Analyze staged changes with `git diff --staged`
2. Generate a conventional commit message in Korean
3. Create the commit with proper formatting

## Commit Format

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

## Language Rules

- Keep the Conventional Commit `type` and optional `scope` in English.
- Write `<description>` in concise Korean.
- Write the optional body in Korean bullet points when details help reviewers.
- Use the imperative/summary style without a trailing period.
- Do not translate commit types such as `feat`, `fix`, `docs`, or `chore`.

## Types

- feat: 새 기능 추가
- fix: 버그 수정
- docs: 문서 변경
- style: 코드 동작 없는 스타일/포맷 변경
- refactor: 기능 변경 없는 코드 구조 개선
- test: 테스트 추가 또는 수정
- chore: 빌드, 설정, 의존성 등 유지보수 작업

## Example Output

```
feat(auth): 비밀번호 재설정 기능 추가

- 비밀번호 찾기 폼 추가
- 이메일 인증 흐름 구현
- 비밀번호 재설정 엔드포인트 추가
```

```
fix(slack): 예약 수정 후 모달 복구 실패 수정

- blank guest 페이지 복구 시점을 안정화
- 중복 Slack 모달 표시를 방지
```

```
docs: 공개 저장소 준비 안내 추가

- 로컬 환경 변수와 생성 산출물 제외 기준 정리
- 개인정보처리방침 링크 작성 방법 안내
```
