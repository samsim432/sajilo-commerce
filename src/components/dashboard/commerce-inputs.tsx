"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { nprToPaisa, paisaToNpr } from "@/lib/currency/npr";

export interface PhoneInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> {
  value: string;
  onValueChange: (value: string) => void;
  error?: string;
}

/**
 * Nepal mobile input with fixed +977 prefix badge and numeric keypad on mobile.
 */
export function PhoneInput({
  value,
  onValueChange,
  error,
  className,
  id,
  ...props
}: PhoneInputProps) {
  return (
    <div className="space-y-1">
      <div
        className={cn(
          "flex h-[42px] items-center overflow-hidden rounded-[10px] border bg-surface transition-colors",
          error
            ? "border-danger-fg focus-within:ring-2 focus-within:ring-danger-fg/20"
            : "border-soft focus-within:border-coral focus-within:ring-2 focus-within:ring-coral/30",
          className
        )}
      >
        <span className="flex h-full items-center border-r border-soft bg-ivory px-3 text-sm font-medium text-charcoal select-none tabular-nums-npr">
          +977
        </span>
        <input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder="98XXXXXXXX"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          className="h-full w-full bg-transparent px-3 text-sm text-charcoal placeholder:text-subtle-ink focus:outline-none tabular-nums-npr"
          aria-invalid={Boolean(error)}
          {...props}
        />
      </div>
      {error ? <p className="text-xs text-danger-fg">{error}</p> : null}
    </div>
  );
}

export interface CurrencyInputProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "type" | "value" | "onChange"
  > {
  /** Value stored in integer minor units (paisa), e.g., 149900 = NPR 1,499 */
  valueMinor: number;
  onChangeMinor: (paisa: number) => void;
  allowDecimals?: boolean;
  error?: string;
}

/**
 * NPR currency input backed by integer paisa minor units.
 */
export function CurrencyInput({
  valueMinor,
  onChangeMinor,
  allowDecimals = false,
  error,
  className,
  id,
  ...props
}: CurrencyInputProps) {
  const [draft, setDraft] = React.useState<string>(() =>
    valueMinor === 0 ? "" : String(paisaToNpr(valueMinor))
  );

  React.useEffect(() => {
    const currentParsed = draft === "" ? 0 : nprToPaisa(Number(draft));
    if (currentParsed !== valueMinor) {
      setDraft(valueMinor === 0 ? "" : String(paisaToNpr(valueMinor)));
    }
  }, [valueMinor]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    const pattern = allowDecimals ? /^\d*\.?\d{0,2}$/ : /^\d*$/;
    if (!pattern.test(raw)) {
      return;
    }
    setDraft(raw);
    const parsed = raw === "" || raw === "." ? 0 : Number(raw);
    onChangeMinor(Math.max(0, nprToPaisa(parsed)));
  }

  return (
    <div className="space-y-1">
      <div
        className={cn(
          "flex h-[42px] items-center overflow-hidden rounded-[10px] border bg-surface transition-colors",
          error
            ? "border-danger-fg focus-within:ring-2 focus-within:ring-danger-fg/20"
            : "border-soft focus-within:border-coral focus-within:ring-2 focus-within:ring-coral/30",
          className
        )}
      >
        <span className="flex h-full items-center border-r border-soft bg-ivory px-3 text-xs font-semibold tracking-wide text-muted-ink select-none">
          NPR
        </span>
        <input
          id={id}
          type="text"
          inputMode={allowDecimals ? "decimal" : "numeric"}
          value={draft}
          onChange={handleChange}
          placeholder="0"
          className="h-full w-full bg-transparent px-3 text-right text-sm font-medium text-charcoal placeholder:text-subtle-ink focus:outline-none tabular-nums-npr"
          aria-invalid={Boolean(error)}
          {...props}
        />
      </div>
      {error ? <p className="text-xs text-danger-fg">{error}</p> : null}
    </div>
  );
}