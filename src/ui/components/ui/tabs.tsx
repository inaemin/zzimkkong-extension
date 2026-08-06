"use client";

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/ui/lib/utils";

// shadcn tabs(base-ui 판)를 이 저장소에 맞게 옮긴 것.
//
// 공식 소스는 스타일을 cn-* CSS 레이어에 두는데 그 레이어를 들여올 수 없어
// Tailwind 클래스로 같은 모양을 낸다. 구조·prop 이름은 공식 그대로 둔다.

function Tabs({ className, orientation = "horizontal", ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      orientation={orientation}
      className={cn("group/tabs flex data-horizontal:flex-col", className)}
      {...props}
    />
  );
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center text-muted-foreground group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col",
  {
    variants: {
      variant: {
        /** 알약 모양 배경 위에 올라가는 기본형. */
        default: "h-8 rounded-lg bg-muted p-0.5",
        /** 배경 없이 밑줄로만 표시하는 형태. */
        line: "gap-1 bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function TabsList({
  className,
  variant = "default",
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all",
        "hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
        "disabled:pointer-events-none disabled:opacity-50",
        // 기본형: 고른 탭이 흰 알약으로 떠오른다.
        "group-data-[variant=default]/tabs-list:h-7 group-data-[variant=default]/tabs-list:data-active:bg-background group-data-[variant=default]/tabs-list:data-active:text-foreground group-data-[variant=default]/tabs-list:data-active:shadow-sm",
        // line: 배경 대신 아래쪽 밑줄로 표시한다.
        "group-data-[variant=line]/tabs-list:data-active:text-foreground",
        "after:absolute after:inset-x-0 after:-bottom-1 after:h-0.5 after:bg-foreground after:opacity-0 after:transition-opacity",
        "group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants };
