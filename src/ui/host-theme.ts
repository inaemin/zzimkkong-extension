// 호스트 페이지(lms+)의 디자인 토큰을 shadow root 안으로 끌어온다.
//
// Shadow DOM 으로 우리 CSS 가 페이지를 오염시키지 않게 격리하되, 색·폰트·radius
// 같은 토큰만 읽어와 :host 에 덮어쓰면 페이지와 시각적으로 겉돌지 않는다.
//
// 호스트가 SPA 라 테마 전환·리렌더로 :root 변수가 바뀔 수 있다. 한 번 복사로는
// 부족해서 MutationObserver 로 style/class 변화를 지켜본다.

/** 호스트에서 읽어올 변수와, 우리 쪽에서 쓸 이름의 대응. */
const BRIDGED_VARIABLES: ReadonlyArray<{ host: string; local: string }> = [
  { host: "--font-family", local: "--zzk-host-font-family" },
  { host: "--font-sans", local: "--zzk-host-font-family" },
  { host: "--primary", local: "--zzk-host-primary" },
  { host: "--color-primary", local: "--zzk-host-primary" },
  { host: "--radius", local: "--zzk-host-radius" },
];

function readHostVariables(): Map<string, string> {
  const computed = getComputedStyle(document.documentElement);
  const resolved = new Map<string, string>();

  for (const { host, local } of BRIDGED_VARIABLES) {
    // 이미 채워졌으면 앞선 후보가 이긴다(--font-family 가 --font-sans 보다 우선).
    if (resolved.has(local)) {
      continue;
    }
    const value = computed.getPropertyValue(host).trim();
    if (value) {
      resolved.set(local, value);
    }
  }

  return resolved;
}

function applyVariables(target: HTMLElement, variables: Map<string, string>): void {
  for (const [name, value] of variables) {
    target.style.setProperty(name, value);
  }
}

/**
 * 호스트 토큰을 target 에 반영하고, 이후 변화도 따라가게 한다.
 * 반환한 함수를 부르면 관찰을 멈춘다.
 */
export function bridgeHostTheme(target: HTMLElement): () => void {
  applyVariables(target, readHostVariables());

  const observer = new MutationObserver(() => {
    applyVariables(target, readHostVariables());
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["style", "class", "data-theme"],
  });

  return () => {
    observer.disconnect();
  };
}
