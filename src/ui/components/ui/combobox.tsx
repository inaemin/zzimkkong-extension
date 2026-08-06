"use client";

import * as React from "react";
import { Combobox as ComboboxPrimitive } from "@base-ui/react";
import { CheckIcon, XIcon } from "lucide-react";

import { useShadowContainer } from "@/ui/shadow-root-context";
import { cn } from "@/ui/lib/utils";
import { Button } from "@/ui/components/ui/button";

// shadcn combobox(base-ui 판)를 이 저장소에 맞게 옮긴 것.
//
// 공식 소스는 스타일을 cn-* CSS 레이어에 두고 아이콘도 내부 placeholder 를
// 쓴다. 여기서는 그 레이어를 들여올 수 없으므로 Tailwind 클래스와 lucide
// 아이콘으로 같은 모양을 낸다. 구조·prop 이름은 공식 그대로 둔다.

const Combobox = ComboboxPrimitive.Root;

function ComboboxValue({ ...props }: ComboboxPrimitive.Value.Props) {
  return <ComboboxPrimitive.Value data-slot="combobox-value" {...props} />;
}

function ComboboxContent({
  className,
  side = "bottom",
  sideOffset = 6,
  align = "start",
  alignOffset = 0,
  anchor,
  ...props
}: ComboboxPrimitive.Popup.Props &
  Pick<
    ComboboxPrimitive.Positioner.Props,
    "side" | "align" | "sideOffset" | "alignOffset" | "anchor"
  >) {
  // shadow root 안에서는 팝업도 그 안에 렌더돼야 스타일이 닿는다.
  const shadowContainer = useShadowContainer();
  return (
    <ComboboxPrimitive.Portal container={shadowContainer ?? undefined}>
      <ComboboxPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        anchor={anchor}
        className="isolate z-50"
      >
        <ComboboxPrimitive.Popup
          data-slot="combobox-content"
          data-chips={!!anchor}
          className={cn(
            // 테두리는 popover·select 와 같이 ring 으로 준다. border 유틸리티는
            // 이 shadow root 안에서 색 토큰을 못 받아 검은 선이 그려진다.
            "max-h-(--available-height) w-(--anchor-width) max-w-(--available-width) origin-(--transform-origin)",
            "overflow-hidden rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden",
            "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className,
          )}
          {...props}
        />
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  );
}

function ComboboxList({ className, ...props }: ComboboxPrimitive.List.Props) {
  return (
    <ComboboxPrimitive.List
      data-slot="combobox-list"
      className={cn("max-h-56 overflow-y-auto overflow-x-hidden", className)}
      {...props}
    />
  );
}

function ComboboxItem({ className, children, ...props }: ComboboxPrimitive.Item.Props) {
  return (
    <ComboboxPrimitive.Item
      data-slot="combobox-item"
      className={cn(
        "relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none",
        "data-highlighted:bg-accent data-highlighted:text-accent-foreground",
        "data-disabled:pointer-events-none data-disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <ComboboxPrimitive.ItemIndicator className="flex size-4 shrink-0 items-center justify-center">
        <CheckIcon className="size-4" />
      </ComboboxPrimitive.ItemIndicator>
      <span className="flex-1">{children}</span>
    </ComboboxPrimitive.Item>
  );
}

function ComboboxEmpty({ className, ...props }: ComboboxPrimitive.Empty.Props) {
  return (
    <ComboboxPrimitive.Empty
      data-slot="combobox-empty"
      className={cn("py-4 text-center text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

/** 칩이 들어가는 입력 상자. 생김새는 Input 과 맞춘다. */
function ComboboxChips({
  className,
  ...props
}: React.ComponentPropsWithRef<typeof ComboboxPrimitive.Chips> & ComboboxPrimitive.Chips.Props) {
  return (
    <ComboboxPrimitive.Chips
      data-slot="combobox-chips"
      className={cn(
        "flex min-h-9 w-full flex-wrap items-center gap-1 rounded-md bg-transparent px-2 py-1 text-sm shadow-xs ring-1 ring-foreground/15 transition-[color,box-shadow]",
        "focus-within:ring-[3px] focus-within:ring-ring/50",
        "has-disabled:pointer-events-none has-disabled:cursor-not-allowed has-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

function ComboboxChip({
  className,
  children,
  showRemove = true,
  ...props
}: ComboboxPrimitive.Chip.Props & {
  showRemove?: boolean;
}) {
  return (
    <ComboboxPrimitive.Chip
      data-slot="combobox-chip"
      className={cn(
        "flex items-center gap-1 rounded-sm bg-secondary py-0.5 pr-0.5 pl-2 text-xs text-secondary-foreground",
        "has-disabled:pointer-events-none has-disabled:cursor-not-allowed has-disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
      {showRemove && (
        <ComboboxPrimitive.ChipRemove
          data-slot="combobox-chip-remove"
          render={<Button variant="ghost" size="icon-xs" />}
          className="size-4 rounded-sm opacity-70 hover:opacity-100"
        >
          <XIcon className="pointer-events-none size-3" />
        </ComboboxPrimitive.ChipRemove>
      )}
    </ComboboxPrimitive.Chip>
  );
}

function ComboboxChipsInput({ className, ...props }: ComboboxPrimitive.Input.Props) {
  return (
    <ComboboxPrimitive.Input
      data-slot="combobox-chip-input"
      className={cn(
        "min-w-16 flex-1 bg-transparent outline-none placeholder:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

/** 칩 상자를 팝업의 기준점으로 쓴다(공식과 동일). */
function useComboboxAnchor() {
  return React.useRef<HTMLDivElement | null>(null);
}

export {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
};
