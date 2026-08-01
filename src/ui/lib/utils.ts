import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** shadcn 컴포넌트가 조건부 클래스를 합칠 때 쓴다. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
