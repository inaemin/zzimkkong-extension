---
name: loop-issue
description: Inspect the src codebase, maintain root ISSUE.md, and repeatedly fix all high and medium priority issues with tests until none remain. Use this skill when the user asks to run an issue-fixing loop, review src for likely problems, update ISSUE.md, or continue resolving high/medium issues.
compatibility: opencode
metadata:
  language: ko
  workflow: issue-loop
---

# Loop Issue Skill

`src` 코드를 반복적으로 점검해 문제를 루트 `ISSUE.md`에 기록하고, 높음/중간 중요도 이슈를 테스트와 함께 해결합니다.

## Usage

```
/loop-issue
```

## Behavior

1. `src` 아래의 코드를 읽고 버그, 안정성 문제, 타입/상태 불일치, 테스트 누락처럼 실제 장애로 이어질 수 있는 이슈를 찾습니다.
2. 발견한 이슈를 루트 `ISSUE.md`에 중요도별로 정리합니다.
3. 루트 `ISSUE.md`에 있는 `높음`과 `중간` 중요도 이슈를 하나씩 해결합니다.
4. 각 수정마다 기존 동작이 유지되는지 확인할 수 있는 테스트를 추가하거나 보강합니다.
5. 관련 테스트, 타입체크, 빌드 등 가능한 검증을 실행하고 통과시킵니다.
6. 해결된 이슈는 루트 `ISSUE.md`에서 제거하거나 완료 상태로 업데이트합니다.
7. 높음/중간 중요도 이슈가 남아 있지 않을 때까지 수정과 검증을 반복합니다.
8. 코드 변경이 충분히 누적되면 `src`를 다시 점검해 새 이슈를 루트 `ISSUE.md`에 반영하고, 다시 높음/중간 중요도 이슈 해결 루프를 진행합니다.

## Issue Priority Rules

- `높음`: 런타임 오류, 데이터 손실, 사용자 플로우 중단, 보안/권한 문제, 빌드 또는 테스트 실패를 유발할 수 있는 문제
- `중간`: 특정 조건에서 오동작하거나 유지보수 비용을 크게 높이는 문제, 회귀 가능성이 높은 누락 테스트
- `낮음`: 스타일, 정리, 선택적 개선처럼 현재 동작을 직접 깨뜨리지 않는 문제

## ISSUE.md Format

루트 `ISSUE.md`가 없으면 생성합니다. 이슈는 다음 구조를 사용합니다.

```md
# Issues

## 높음

- [ ] 제목
  - 위치: `src/path/file.ts`
  - 문제: 무엇이 잘못될 수 있는지
  - 해결 방향: 어떤 방식으로 고칠지
  - 검증: 어떤 테스트나 명령으로 확인할지

## 중간

- [ ] 제목
  - 위치: `src/path/file.ts`
  - 문제: 무엇이 잘못될 수 있는지
  - 해결 방향: 어떤 방식으로 고칠지
  - 검증: 어떤 테스트나 명령으로 확인할지

## 낮음

- [ ] 제목
  - 위치: `src/path/file.ts`
  - 문제: 개선하면 좋은 점
  - 해결 방향: 선택적 개선 방향
```

## Work Loop

1. Explore: `src` 구조, 테스트 설정, 기존 패턴을 먼저 확인합니다.
2. Record: 새로 발견한 문제를 루트 `ISSUE.md`에 중요도와 검증 방법까지 적습니다.
3. Select: 항상 `높음` 이슈를 먼저 처리하고, 그다음 `중간` 이슈를 처리합니다.
4. Fix: 기존 코드 스타일을 유지하면서 최소한의 안전한 변경으로 해결합니다.
5. Test: 회귀를 막는 테스트를 작성하고 관련 검증을 실행합니다.
6. Update: 해결된 항목을 루트 `ISSUE.md`에서 제거하거나 완료 처리합니다.
7. Repeat: 높음/중간 이슈가 더 이상 없을 때까지 반복합니다.

## Guardrails

- 기존 기능이 계속 동작해야 하므로 테스트 없이 위험한 수정으로 넘어가지 않습니다.
- 실패하는 테스트를 삭제하거나 약화하지 않습니다.
- 타입 오류를 `as any`, `@ts-ignore`, `@ts-expect-error`로 숨기지 않습니다.
- 한 번에 너무 많은 이슈를 섞어 고치지 말고, 이슈 단위로 수정과 검증 결과를 남깁니다.
- 검증 명령이 실패하면 근본 원인을 고친 뒤 다시 실행합니다.
- 낮음 중요도 이슈는 높음/중간 이슈가 모두 사라진 뒤에만 선택적으로 처리합니다.

## Completion Criteria

- 루트 `ISSUE.md`에 `높음` 또는 `중간` 중요도 미해결 이슈가 없습니다.
- 수정한 코드와 관련된 테스트가 통과합니다.
- 가능한 경우 타입체크와 빌드가 통과합니다.
- 마지막으로 `src`를 다시 훑어 새 높음/중간 이슈가 없는지 확인했습니다.
