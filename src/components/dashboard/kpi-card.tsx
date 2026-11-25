import * as React from "react";
import { cn } from "@/lib/utils";
import { StatusBadge, type SemanticTone } from "./status-badge";

export interface KpiCardProps {
  label: string;
  value: string;
  deltaLabel?: string;
  deltaTone?: SemanticTone;
  helperText?: string;
  icon?: React.ReactNode;
  className?: string;
}

export function KpiCard({
  label,
  value,
  deltaLabel,
  deltaTone = "success",
  helperText,
  icon,
  className,
}: KpiCardProps) {
  return (
    <div
      className={cn(
        "rounded-[14px] border border-soft bg-surface p-5 shadow-[0_1px_2px_rgba(36,35,33,0.04)]",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-muted-ink">{label}</p>
        {icon ? <span className="text-muted-ink">{icon}</span> : null}
      </div>

      <p className="mt-2 font-display text-[28px] font-bold leading-[1.15] tracking-[-0.02em] text-charcoal tabular-nums-npr">
        {value}
      </p>

      {(deltaLabel || helperText) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {deltaLabel ? <StatusBadge label={deltaLabel} tone={deltaTone} /> : null}
          {helperText ? (
            <span className="text-xs text-muted-ink">{helperText}</span>
          ) : null}
        </div>
      )}
    </div>
  );
}