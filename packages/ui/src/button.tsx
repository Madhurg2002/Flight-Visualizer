import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "./utils";

const button = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-all outline-none disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-signal-400 text-ink-950 hover:bg-signal-300 active:bg-signal-500 shadow-[0_6px_24px_-10px_var(--color-signal-400)]",
        secondary:
          "bg-ink-700 text-haze-50 border border-ink-600 hover:bg-ink-600 hover:border-ink-500",
        ghost: "text-haze-200 hover:bg-ink-750 hover:text-haze-50",
        outline:
          "border border-ink-500 text-haze-200 hover:border-signal-400 hover:text-signal-300",
        danger: "bg-rose-alert/15 text-rose-alert border border-rose-alert/40 hover:bg-rose-alert/25",
      },
      size: {
        sm: "h-8 px-3 text-[13px] [&_svg]:size-3.5",
        md: "h-10 px-4 text-sm [&_svg]:size-4",
        lg: "h-12 px-6 text-[15px] [&_svg]:size-[18px]",
        icon: "size-9 [&_svg]:size-4",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof button> & { asChild?: boolean };

export function Button({ className, variant, size, asChild, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(button({ variant, size }), className)} {...props} />;
}
