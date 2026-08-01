import * as React from "react";

// Base UI 의 포털형 컴포넌트(Dialog/Popover/Select 등)는 기본적으로 팝업을
// document.body 에 붙인다. shadow root 안에 있는 우리 UI 에서는 그러면
// 스타일이 닿지 않아 형태가 깨진다.
//
// FloatingPortal 의 container 는 HTMLElement | ShadowRoot 를 직접 받으므로,
// 마운트 지점을 컨텍스트로 내려보내 각 포털이 그 안에 렌더되게 한다.

const ShadowContainerContext = React.createContext<HTMLElement | null>(null);

export function ShadowRootProvider({
  container,
  children,
}: {
  container: HTMLElement;
  children: React.ReactNode;
}) {
  return (
    <ShadowContainerContext.Provider value={container}>{children}</ShadowContainerContext.Provider>
  );
}

/**
 * 포털 컴포넌트에 넘길 container.
 * shadow root 밖(일반 페이지)에서 쓰이면 null 이라 기본 동작(body)을 따른다.
 */
export function useShadowContainer(): HTMLElement | null {
  return React.useContext(ShadowContainerContext);
}
