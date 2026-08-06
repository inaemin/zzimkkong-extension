import * as React from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";

import { useShadowContainer } from "@/ui/shadow-root-context";
import { cn } from "@/ui/lib/utils";

function Popover({ ...props }: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({ ...props }: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverContent({
  className,
  align = "center",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  collisionBoundary,
  container,
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<
    PopoverPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset" | "collisionBoundary"
  > &
  Pick<PopoverPrimitive.Portal.Props, "container">) {
  const shadowContainer = useShadowContainer();
  // 기본값(document.body)으로 두면, 트리거를 감싼 컨테이너가 "팝오버 바깥"으로
  // 취급돼 열려 있는 동안 inert 처리된다. 그러면 팝오버 위의 클릭이 막힌다.
  // 트리거와 같은 컨테이너 안에 렌더해야 그 문제가 없다.
  const portalContainer = container ?? shadowContainer ?? undefined;
  return (
    <PopoverPrimitive.Portal container={portalContainer}>
      <PopoverPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        // 기본값 'clipping-ancestors' 는 포털 대상(우리 오버레이)을 경계로 삼는다.
        // 그러면 오버레이가 낮을 때 "아래 공간 부족"으로 판단해 팝오버가 위나
        // 옆으로 튄다. 실제 제약은 화면이므로 뷰포트를 경계로 준다.
        collisionBoundary={collisionBoundary}
        // 팝오버는 document.body 로 포털되는데, 우리 레이더 오버레이가
        // z-index 최대값(2147483647)이라 기본값(z-50)이면 그 뒤로 숨는다.
        // isolate 를 빼야 여기서 준 z-index 가 실제로 먹는다.
        className="z-2147483647"
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            "z-50 flex w-72 origin-(--transform-origin) flex-col gap-2.5 rounded-lg bg-popover p-2.5 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className,
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="popover-header"
      className={cn("flex flex-col gap-0.5 text-sm", className)}
      {...props}
    />
  );
}

function PopoverTitle({ className, ...props }: PopoverPrimitive.Title.Props) {
  return (
    <PopoverPrimitive.Title
      data-slot="popover-title"
      className={cn("font-medium", className)}
      {...props}
    />
  );
}

function PopoverDescription({ className, ...props }: PopoverPrimitive.Description.Props) {
  return (
    <PopoverPrimitive.Description
      data-slot="popover-description"
      className={cn("text-muted-foreground", className)}
      {...props}
    />
  );
}

export { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger };
