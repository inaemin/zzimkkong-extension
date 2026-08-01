import js from "@eslint/js";
import prettierConfig from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";
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
//  - eslint-plugin-import 는 ESLint 10 peer 미지원이라 보류(9 까지만 지원).
//    전역 해체가 끝나 실제 import 그래프가 생기면 그때 다시 본다.
//  - functional 플러그인(no-let/immutable-data/no-expression-statements)은
//    DOM 을 직접 조립하는 확장 코드 특성상 맞지 않아 제외했다.
//    순수 도메인 계층이 분리되는 3단계 이후에 재검토한다.
//
// 점진 강화 대상(5단계에서 켠다). 지금 켜면 전부 소음이 되는 규칙들:
//  - no-ternary          : 기존 176곳. 삼항이 오히려 읽기 쉬운 자리가 많다.
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
    files: ["**/*.ts"],
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
    files: ["src/**/*.{js,ts}"],
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
      "no-else-return": "error",
      // 기존 코드에 26건 있고 그중 21건이 content.js 다.
      // content.js 는 3단계에서 React 컴포넌트로 다시 쓸 파일이라 지금 고치면 헛수고다.
      // 새로 쓰는 코드에만 방향을 주도록 경고로 둔다. → 5단계에서 error.
      "no-restricted-syntax": [
        "warn",
        {
          selector: "IfStatement[alternate]",
          message: "else 대신 early return 을 쓰세요.",
        },
      ],
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

      // 전역 해체가 끝날 때까지는 경고. 끝나면 error 로 올린다.
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", caughtErrors: "none" }],
    },
  },

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
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", caughtErrors: "none" }],
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
    files: ["**/*.ts"],
  })),

  {
    files: ["**/*.ts"],
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
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
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

  // Prettier 와 충돌하는 포맷 규칙 해제. 반드시 마지막.
  prettierConfig,
]);
