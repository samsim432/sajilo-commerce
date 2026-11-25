import * as React from "react";
import { cn } from "@/lib/utils";

export type SemanticTone = "success" | "warning" | "danger" | "info" | "neutral";

const TONE_CLASSES: Record<SemanticTone, string> = {
  success:
    "bg-success-bg text-success-fg border-success-border [&>span]:bg-success-fg",
  warning:
    "bg-warning-bg text-warning-fg border-warning-border [&>span]:bg-warning-fg",
  danger:
    "bg-danger-bg text-danger-fg border-danger-border [&>span]:bg-danger-fg",
  info:
    "bg-info-bg text-info-fg border-info-border [&>span]:bg-info-fg",
  neutral:
    "bg-neutral-bg text-neutral-fg border-neutral-border [&>span]:bg-neutral-fg",
};

export interface StatusBadgeProps {
  label: string;
  tone?: SemanticTone;
  className?: string;
}

export function StatusBadge({
  label,
  tone = "neutral",
  className,
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        TONE_CLASSES[tone],
        className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full shrink-0" aria-hidden="true" />
      {label}
    </span>
  );
}

export type SalesChannel =
  | "website"
  | "instagram"
  | "facebook"
  | "whatsapp"
  | "phone"
  | "walk_in"
  | "woocommerce"
  | "shopify";

const CHANNEL_LABELS: Record<SalesChannel, string> = {
  website: "Website",
  instagram: "Instagram",
  facebook: "Facebook",
  whatsapp: "WhatsApp",
  phone: "Phone",
  walk_in: "Walk-in",
  woocommerce: "WooCommerce",
  shopify: "Shopify",
};

export function ChannelBadge({
  channel,
  className,
}: {
  channel: SalesChannel;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md bg-sand/70 border border-soft px-2 py-0.5 text-[11px] font-medium text-charcoal whitespace-nowrap",
        className
      )}
    >
      {CHANNEL_LABELS[channel]}
    </span>
  );
}