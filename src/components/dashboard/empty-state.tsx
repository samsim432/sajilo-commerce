import * as React from "react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-[14px] border border-dashed border-strong bg-surface/60 px-6 py-12 text-center",
        className
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sand text-charcoal">
        {icon}
      </div>
      <h3 className="mt-4 font-display text-base font-semibold text-charcoal">
        {title}
      </h3>
      <p className="mt-1 max-w-md text-sm text-muted-ink">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}