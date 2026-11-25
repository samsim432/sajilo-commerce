"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [verificationSent, setVerificationSent] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    if (password.length < 10) {
      setErrorMsg("Password must be at least 10 characters long.");
      return;
    }

    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            preferred_locale: "en",
          },
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard/onboarding`,
        },
      });

      if (error) {
        setErrorMsg(error.message);
        return;
      }

      if (data.session) {
        toast.success("Account created — let's set up your business");
        router.push("/dashboard/onboarding");
        router.refresh();
      } else {
        setVerificationSent(true);
      }
    } catch {
      setErrorMsg("Unable to create account right now. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (verificationSent) {
    return (
      <div className="rounded-[14px] border border-soft bg-surface p-6 sm:p-8 shadow-[0_1px_2px_rgba(36,35,33,0.04)]">
        <h1 className="font-display text-2xl font-bold text-charcoal">
          Check your email
        </h1>
        <p className="mt-2 text-sm text-muted-ink">
          We sent a verification link to{" "}
          <span className="font-medium text-charcoal">{email}</span>. Verify your
          address to continue setting up your store.
        </p>
        <div className="mt-6">
          <Link
            href="/login"
            className="inline-flex h-[42px] w-full items-center justify-center rounded-[10px] bg-charcoal text-sm font-semibold text-ivory hover:opacity-95"
          >
            Go to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[14px] border border-soft bg-surface p-6 sm:p-8 shadow-[0_1px_2px_rgba(36,35,33,0.04)]">
      <div className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-ink">
          Start Free in Nepal
        </p>
        <h1 className="font-display text-2xl font-bold text-charcoal">
          Create your account
        </h1>
        <p className="text-sm text-muted-ink">
          Set up your business workspace, inventory, and online store in minutes.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="signup-name">Your full name</Label>
          <Input
            id="signup-name"
            type="text"
            required
            autoComplete="name"
            placeholder="Samir Simkhada"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="h-[42px] rounded-[10px] border-soft bg-surface"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="signup-email">Email address</Label>
          <Input
            id="signup-email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@business.com.np"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-[42px] rounded-[10px] border-soft bg-surface"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="signup-password">Password (10+ characters)</Label>
          <Input
            id="signup-password"
            type="password"
            required
            minLength={10}
            autoComplete="new-password"
            placeholder="At least 10 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
          {loading ? "Creating account..." : "Create account"}
        </Button>
      </form>

      <p className="mt-6 text-center text-xs text-muted-ink">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-semibold text-charcoal underline underline-offset-4"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}