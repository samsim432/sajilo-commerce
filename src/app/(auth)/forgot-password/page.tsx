"use client";

import * as React from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/callback?next=/dashboard/settings`,
      });

      if (error) {
        setErrorMsg(error.message);
        return;
      }

      setSent(true);
    } catch {
      setErrorMsg("Unable to send reset link right now. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-[14px] border border-soft bg-surface p-6 sm:p-8 shadow-[0_1px_2px_rgba(36,35,33,0.04)]">
      <div className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-ink">
          Account Recovery
        </p>
        <h1 className="font-display text-2xl font-bold text-charcoal">
          Reset your password
        </h1>
        <p className="text-sm text-muted-ink">
          Enter the email linked to your account and we&apos;ll send a reset link.
        </p>
      </div>

      {sent ? (
        <div className="mt-6 space-y-4">
          <p className="rounded-[10px] border border-success-border bg-success-bg px-3.5 py-3 text-xs text-success-fg">
            If an account exists for <span className="font-semibold">{email}</span>, a
            password reset link has been sent.
          </p>
          <Link
            href="/login"
            className="inline-flex h-[42px] w-full items-center justify-center rounded-[10px] bg-charcoal text-sm font-semibold text-ivory"
          >
            Return to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="reset-email">Email address</Label>
            <Input
              id="reset-email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@business.com.np"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-[42px] rounded-[10px] border-soft bg-surface"
            />
          </div>

          {errorMsg ? (
            <p className="rounded-[10px] border border-danger-border bg-danger-bg px-3 py-2 text-xs text-danger-fg">
              {errorMsg}
            </p>
          ) : null}

          <Button
            type="submit"
            disabled={loading}
            className="h-[42px] w-full rounded-[10px] bg-coral font-semibold text-white hover:bg-coral-hover"
          >
            {loading ? "Sending link..." : "Send reset link"}
          </Button>

          <p className="text-center text-xs text-muted-ink">
            <Link href="/login" className="hover:text-charcoal">
              Back to sign in
            </Link>
          </p>
        </form>
      )}
    </div>
  );
}