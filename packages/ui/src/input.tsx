import * as LabelPrimitive from "@radix-ui/react-label";
import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "./utils";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-lg border border-ink-600 bg-ink-900/80 px-3 text-sm text-haze-50",
        "placeholder:text-haze-600 transition-colors",
        "focus:border-signal-400 focus:outline-none focus:ring-2 focus:ring-signal-400/25",
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
        "w-full rounded-lg border border-ink-600 bg-ink-900/80 px-3 py-2 text-sm text-haze-50",
        "placeholder:text-haze-600 transition-colors resize-y min-h-20",
        "focus:border-signal-400 focus:outline-none focus:ring-2 focus:ring-signal-400/25",
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
        "text-[11px] font-semibold uppercase tracking-[0.08em] text-haze-400",
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
        "h-10 w-full appearance-none rounded-lg border border-ink-600 bg-ink-900/80 px-3 pr-8 text-sm text-haze-50",
        "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%238494ac%22 stroke-width=%222%22><path d=%22M6 9l6 6 6-6%22/></svg>')] bg-[length:16px] bg-[right_0.6rem_center] bg-no-repeat",
        "focus:border-signal-400 focus:outline-none focus:ring-2 focus:ring-signal-400/25",
        className,
      )}
      {...props}
    />
  );
}
