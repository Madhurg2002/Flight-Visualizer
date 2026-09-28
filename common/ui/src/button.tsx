import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "./utils";

/**
 * Flat, ruled and square-cornered. A button on a chart is a printed label, so
 * it carries a hairline rather than a shadow, and the primary is chart
 * magenta — the colour reserved for the thing you are meant to do.
 */
const button = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium tracking-tight transition-colors outline-none disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-chart-600 text-paper-50 border border-chart-700 hover:bg-chart-700 active:bg-chart-800",
        secondary:
          "bg-paper-200 text-ink-900 border border-paper-300 hover:bg-paper-300 hover:border-paper-400",
        ghost: "text-ink-600 hover:bg-paper-200 hover:text-ink-900",
        outline:
          "border border-paper-400 bg-transparent text-ink-700 hover:border-chart-600 hover:text-chart-700",
        danger:
          "bg-rust-500/10 text-rust-600 border border-rust-500/40 hover:bg-rust-500/20",
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
