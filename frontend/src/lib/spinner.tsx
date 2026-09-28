import { cn } from "@skytrace/ui";

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        "inline-block size-5 animate-spin rounded-full border-2 border-paper-300 border-t-chart-600",
        className,
      )}
    />
  );
}
