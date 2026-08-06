import js from "@eslint/js";
import prettierConfig from "eslint-config-prettier";
import functional from "eslint-plugin-functional";
import importX from "eslint-plugin-import-x";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig, globalIgnores } from "eslint/config";

// 마이그레이션 중이라 규칙을 세게 조이면 계속 막힌다.
// 지금 목적은 두 가지다.
//  1) 2.5-A(전역 해체)의 안전망 — no-undef 가 전역을 지운 뒤 남은 참조를 잡는다.
//  2) 앞으로 쓰는 코드에 스타일 방향을 미리 걸어둔다.
// 조이는 건 5단계(CI 게이트)에서 한다.
//
// 규칙 선정 메모(요청안 대비):
//  - Next.js/React/TS 관련(eslint-config-next, typescript-eslint, react-hooks)은
//    아직 해당 스택이 없어 제외했다. TS 는 2.5-B, react-hooks 는 3단계에서 추가한다.
//  - eslint-plugin-import 대신 eslint-plugin-import-x(포크)를 쓴다. 원본은
//    지금도 ESLint 10 을 peer 로 받지 않는다(2.32.0 기준 ^9 까지). 포크는
//    ^10 을 지원하고 order/no-cycle 규칙이 동일하다. 규칙 이름만 import-x/* 다.
//  - functional 플러그인(no-let/immutable-data/no-expression-statements)은
//    순수 도메인 계층에만 켠다(아래 해당 블록 참고). DOM 을 직접 조립하는
//    나머지 확장 코드에는 여전히 맞지 않는다.
//
// 점진 강화 대상(5단계에서 켠다). 지금 켜면 전부 소음이 되는 규칙들:
//  - no-ternary 는 no-nested-ternary 로 대체했다. 실측해 보니 전면 금지는
//    290건인데 대부분이 `typeof x === "string" ? x : ""` 같은 자리라, if 로
//    풀면 3줄이 5줄이 되면서 바로 위 max-lines: 20 을 도로 압박한다.
//    실제로 읽기 어려운 건 중첩 삼항이고 그건 7건뿐이라 전부 정리했다.
//  - max-depth: 1        : DOM 조립/이벤트 처리 코드라 중첩이 잦다.
//  - max-params: 2       : 정규화 함수들이 (value, options, context) 형태다.
//  - max-lines-per-function: 10
//                        : content.js 렌더 함수가 수백 줄이다. 3단계에서
//                          컴포넌트로 쪼개진 뒤에야 의미가 생긴다.
//  - no-else-return 은 켰다(자동 수정 가능하고 위험이 없다).
//  - no-restricted-syntax(else 금지)는 경고로 시작한다 — 아래 주석 참고.

export default defineConfig([
  globalIgnores([
    "dist/**",
    "node_modules/**",
    "src-backup/**",
    "test-results/**",
    "artifacts/**",
    // 생성물: generate-floor-maps.mjs 가 만든다.
    "src/features/radar/floor-maps.js",
  ]),

  js.configs.recommended,
  // tseslint 의 recommended 는 files 제한이 없어 .js 까지 잡는다.
  // 아직 대부분이 .js 라 소음이 되므로 .ts 로 명시적으로 좁힌다.
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ["**/*.{ts,tsx}"],
  })),

  {
    rules: {
      // let/try 조합(`let x = init; try { x = ... } catch { ... }`)을 오탐한다.
      // 초기값이 catch 경로에서 실제로 쓰이므로 지우면 동작이 깨진다.
      "no-useless-assignment": "off",
    },
  },

  // 확장 소스: content script / MAIN world 훅.
  {
    files: ["src/**/*.{js,ts,tsx}"],
    plugins: { "import-x": importX },
    settings: {
      "import-x/resolver": { node: { extensions: [".js", ".ts", ".tsx"] } },
    },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.webextensions,
      },
    },
    rules: {
      "no-var": "error",
      "prefer-const": "error",
      "no-param-reassign": "error",
      // 순환 참조 0건인 상태로 들어왔다(2.5-A 전역 해체 결과). 다시 생기지
      // 않게 고정한다 — 순환은 번들러가 조용히 통과시킨 뒤 런타임에 터진다.
      "import-x/no-cycle": "error",
      "import-x/order": ["error", { "newlines-between": "always" }],
      "no-else-return": "error",
      // else 금지 + let 금지. content.js 는 아래에서 예외로 둔다(3단계 잔여).
      "no-restricted-syntax": [
        "error",
        {
          selector: "IfStatement[alternate]",
          message: "else 대신 early return 을 쓰세요.",
        },
        {
          selector: "VariableDeclaration[kind='let']",
          message: "let 대신 const 를 쓰세요.",
        },
      ],
      // 참조 설정은 2 지만, 3 으로 뒀다. 실제로 재보니 2 는 18건이 걸리는데
      // 그중 대부분이 (값, 옵션, 문맥) 형태의 순수 함수라 억지로 객체로 묶으면
      // 읽기 어려워진다. 3 이면 남는 위반이 없다.
      "max-params": ["error", 3],
      // 중첩 1단. try/catch 도 한 겹으로 세므로, 저장소·클립보드처럼 던지는
      // 접근은 헬퍼로 뽑아 쓴다(safely/attempt 계열).
      "max-depth": ["error", 1],
      // 중첩 삼항만 금지한다(위 주석 참고). 단순 삼항은 if 보다 의도가 분명한
      // 자리가 많고, 풀어 쓰면 함수가 길어져 max-lines 와 부딪힌다.
      "no-nested-ternary": "error",
      // 의미 없는 변수명 금지. 확장 코드에 흔한 축약형을 추가했다.
      "id-denylist": [
        "error",
        "req",
        "res",
        "ctx",
        "err",
        "msg",
        "num",
        "str",
        "obj",
        "arr",
        "el",
        "elem",
        "cb",
      ],

      // 전역 해체가 끝나 이제 error 다. content.js 만 예외로 둔다(아래 블록).
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrors: "none" }],
    },
  },

  // 순수 도메인 계층: DOM 도 입출력도 없는 계산 모듈.
  // 여기서만 함수형 규칙을 켠다.
  //
  // utils/shared.ts 는 뺐다. 디버그 이벤트 링버퍼와 console 로깅이 있어
  // no-expression-statements 와 근본적으로 어긋난다 — console.log 자체가
  // 표현식 문이고, 링버퍼는 가변인 게 목적이다.
  {
    files: [
      "src/features/radar/slot-model.ts",
      "src/utils/date-time.ts",
      "src/services/lms-data/normalizers.ts",
    ],
    plugins: { functional },
    rules: {
      "functional/no-let": "error",
      "functional/immutable-data": "error",
      "functional/no-expression-statements": "error",
    },
  },

  // content.ts 는 3단계에서 React 로 옮기다 만 잔여 파일이다(6,000줄).
  // 여기에 규칙을 걸면 통과 불가능한 게이트가 되므로, 해체가 끝날 때까지
  // 구조 규칙만 예외로 둔다. 파일이 사라지면 이 블록도 지운다.
  {
    files: ["src/content.ts"],
    rules: {
      "no-restricted-syntax": "off",
      "max-params": "off",
      "max-depth": "off",
      // 56건. 3단계에서 React 로 옮기다 만 잔여라 해체와 함께 정리한다.
      "no-unused-vars": "warn",
    },
  },

  // React 루트·마운트 모듈은 모듈 수준 가변 싱글턴을 들고 있다.
  // (root/host 를 호출 간에 유지해야 해서 const 로 바꿀 수 없다)
  {
    files: ["src/ui/*-mount.tsx", "src/ui/mount.tsx", "src/ui/floor-map-zoom-modal.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        { selector: "IfStatement[alternate]", message: "else 대신 early return 을 쓰세요." },
      ],
    },
  },

  // 함수 길이.
  //
  // 로직 계층은 20 줄. 참조 설정은 10 이지만, 실제로 재보니 위반 110건 중
  // 55%가 11~20줄짜리 "가드 절 나열" 함수였다. 그 형태는 바로 위 max-depth: 1
  // 이 요구한 결과라(중첩 대신 early return), 10 을 강제하면 두 규칙이 서로
  // 반대로 당긴다. 20 이면 진짜 긴 함수만 걸린다.
  //
  // 순수 도메인 3파일만 10 을 지킨다 — 계산만 있어 쪼갤 seam 이 분명하다.
  {
    files: [
      "src/services/**/*.ts",
      "src/utils/**/*.ts",
      "src/features/**/*.ts",
      "src/page-hook/**/*.ts",
      "src/constants/**/*.ts",
      "src/page-network-hook.ts",
    ],
    rules: {
      "max-lines-per-function": ["error", { max: 20, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: [
      "src/features/radar/slot-model.ts",
      "src/utils/date-time.ts",
      "src/services/lms-data/normalizers.ts",
    ],
    rules: {
      // TODO(5단계 잔여): 목표는 10. 남은 22건은 11~20줄인데, 전부 앞서 중복
      // 제거로 뽑아낸 헬퍼이거나 서로 다른 에러 메시지를 내는 가드 나열이라
      // 더 쪼갤 seam 이 없다. 10 을 지키려면 함수를 부수는 것 외에 방법이 없어
      // 보류한다 — max-depth: 1 이 요구한 형태와 정면으로 부딪힌다.
      "max-lines-per-function": ["error", { max: 20, skipBlankLines: true, skipComments: true }],
    },
  },

  // DI 팩토리(createXxx(deps))는 모듈 래퍼라 길이가 곧 복잡도가 아니다.
  // 안쪽 함수들은 이미 개별로 측정된다. 파일 단위로 끄면 그 안의 실제 로직까지
  // 놓치므로, 팩토리 함수 한 줄에만 eslint-disable 을 붙였다.

  // 서비스워커는 window 가 없다.
  {
    files: ["src/background.{js,ts}"],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
        ...globals.webextensions,
      },
    },
  },

  // Node 스크립트(빌드/패키징/생성기).
  // manifest.config.js 가 import attributes(`with { type: "json" }`)를 쓰므로
  // ecmaVersion 은 2025 이상이어야 파싱된다.
  // Playwright 를 띄우는 스크립트는 page.evaluate 안에 브라우저 코드가 들어가
  // document/window 를 참조하므로 브라우저 전역도 함께 허용한다.
  {
    files: [
      "scripts/**/*.mjs",
      "*.config.{js,ts}",
      "vite.config.{js,ts}",
      "manifest.config.{js,ts}",
    ],
    languageOptions: {
      ecmaVersion: 2025,
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrors: "none" }],
      "preserve-caught-error": "off",
    },
  },

  // 테스트: Node(Playwright 러너) + 브라우저(page.evaluate 안쪽) 양쪽 전역이 쓰인다.
  {
    files: ["tests/**/*.{js,ts}"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      // 테스트는 셋업 특성상 미사용 변수가 잦다. 경고로만 본다.
      "no-unused-vars": "warn",
      // 픽스처 구성에 else/삼항이 자연스럽게 쓰인다.
      "no-restricted-syntax": "off",
      "id-denylist": "off",
    },
  },

  // 타입 정보를 쓰는 규칙(recommendedTypeChecked)은 syntax 규칙만으로는
  // 못 잡는 것들을 잡는다: await 안 한 Promise, 조건문에 쓴 항상 truthy 한 값,
  // any 로 흘러들어가는 값 등. 실제 버그가 여기서 걸린다.
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ["**/*.{ts,tsx}"],
  })),

  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        // tsconfig.json 을 자동으로 찾아 타입 정보를 붙인다.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    // TS 전환 초기(2.5-B)에는 느슨하게. 조이는 건 5단계.
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      // JS 규칙과 중복되므로 TS 버전만 남긴다.
      "no-unused-vars": "off",

      // strict: false 로 시작하므로 unsafe 계열은 아직 소음이 크다.
      // .ts 비중이 늘고 strict 로 조이는 5단계에서 error 로 올린다.
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/no-unsafe-call": "warn",
      "@typescript-eslint/no-unsafe-argument": "warn",
      "@typescript-eslint/no-unsafe-return": "warn",

      // 이건 처음부터 error 로 둔다. 확장 코드가 비동기(fetch/storage)를
      // 많이 쓰는데, await 빠뜨리면 조용히 어긋난다.
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-misused-promises": "error",
    },
  },

  // 훅 규칙은 훅을 "쓰면서" 잡아야 의미가 있다. 다 짜고 5단계에 켜면
  // 경고 수십 개를 사후 정리하는 일이 된다(로드맵 3단계 항목).
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },

  // Prettier 와 충돌하는 포맷 규칙 해제. 반드시 마지막.
  prettierConfig,
]);
