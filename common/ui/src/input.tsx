import * as LabelPrimitive from "@radix-ui/react-label";
import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "./utils";

/**
 * Fields are boxes ruled onto the sheet. White paper, a hairline, and a
 * magenta focus rule — the same language as the rest of the chart.
 */
export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-md border border-paper-300 bg-paper-100 px-3 text-sm text-ink-900",
        "placeholder:text-ink-400 transition-colors",
        "focus:border-chart-600 focus:outline-none focus:ring-2 focus:ring-chart-600/15",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full rounded-md border border-paper-300 bg-paper-100 px-3 py-2 text-sm text-ink-900",
        "placeholder:text-ink-400 transition-colors resize-y min-h-20",
        "focus:border-chart-600 focus:outline-none focus:ring-2 focus:ring-chart-600/15",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: LabelPrimitive.LabelProps) {
  return (
    <LabelPrimitive.Root
      className={cn(
        "font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-ink-400",
        className,
      )}
      {...props}
    />
  );
}

/** Native select styled to match Input, for the few places a list is right. */
export function Select({ className, ...props }: InputHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-10 w-full appearance-none rounded-md border border-paper-300 bg-paper-100 px-3 pr-8 text-sm text-ink-900",
        "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%236b6454%22 stroke-width=%222%22><path d=%22M6 9l6 6 6-6%22/></svg>')] bg-[length:16px] bg-[right_0.6rem_center] bg-no-repeat",
        "focus:border-chart-600 focus:outline-none focus:ring-2 focus:ring-chart-600/15",
        className,
      )}
      {...props}
    />
  );
}
