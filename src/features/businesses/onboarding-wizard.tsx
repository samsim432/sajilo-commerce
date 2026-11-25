"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  MapPin,
  Share2,
  Store,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/dashboard/commerce-inputs";
import { cn } from "@/lib/utils";

type CategoryOption =
  | "fashion"
  | "electronics"
  | "beauty"
  | "food_artisan"
  | "general_retail"
  | "services"
  | "general";

type ChannelOption =
  | "instagram"
  | "facebook"
  | "new_website"
  | "existing_website"
  | "shop";

const CATEGORIES: Array<{ value: CategoryOption; label: string }> = [
  { value: "fashion", label: "Clothing & Fashion" },
  { value: "electronics", label: "Electronics & Gadgets" },
  { value: "beauty", label: "Beauty & Skincare" },
  { value: "food_artisan", label: "Food, Bakery & Artisan" },
  { value: "general_retail", label: "General Retail" },
  { value: "services", label: "Services & Bookings" },
  { value: "general", label: "Other / Mixed Store" },
];

const CHANNELS: Array<{
  value: ChannelOption;
  title: string;
  description: string;
}> = [
  {
    value: "instagram",
    title: "Instagram & Social DMs",
    description: "Log DM orders fast, prevent stock oversells, and track COD.",
  },
  {
    value: "facebook",
    title: "Facebook Page & Messenger",
    description: "Centralize page orders, customer phone history, and deliveries.",
  },
  {
    value: "new_website",
    title: "Launch a New Online Store",
    description: "Build a mobile-first website with templates and custom domains.",
  },
  {
    value: "existing_website",
    title: "Connect Existing Website",
    description: "Bring orders and catalog into one workspace (WooCommerce/web).",
  },
  {
    value: "shop",
    title: "Physical Shop + Local Delivery",
    description: "Track shop stock, walk-in/phone orders, and regional dispatch.",
  },
];

const NEPAL_PROVINCES = [
  "Bagmati Province",
  "Gandaki Province",
  "Lumbini Province",
  "Koshi Province",
  "Madhesh Province",
  "Karnali Province",
  "Sudurpashchim Province",
];

const STEPS = [
  { id: 1, title: "Business & Language", icon: Store },
  { id: 2, title: "Location & Contact", icon: MapPin },
  { id: 3, title: "How You Sell", icon: Share2 },
] as const;

export function OnboardingWizard({
  defaultName = "",
}: {
  defaultName?: string;
}) {
  const router = useRouter();
  const [step, setStep] = React.useState<number>(1);
  const [submitting, setSubmitting] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  // Step 1 state
  const [name, setName] = React.useState(defaultName);
  const [category, setCategory] = React.useState<CategoryOption>("fashion");
  const [locale, setLocale] = React.useState<"en" | "ne">("en");

  // Step 2 state (optional / skippable)
  const [phone, setPhone] = React.useState("");
  const [province, setProvince] = React.useState("Bagmati Province");
  const [district, setDistrict] = React.useState("");
  const [city, setCity] = React.useState("");
  const [addressLine1, setAddressLine1] = React.useState("");

  // Step 3 state
  const [primaryChannel, setPrimaryChannel] =
    React.useState<ChannelOption>("instagram");

  function handleNext() {
    setErrorMsg(null);
    if (step === 1 && name.trim().length < 2) {
      setErrorMsg("Enter your business or store name (at least 2 characters).");
      return;
    }
    setStep((prev) => Math.min(3, prev + 1));
  }

  function handleBack() {
    setErrorMsg(null);
    setStep((prev) => Math.max(1, prev - 1));
  }

  async function handleCreateWorkspace(e?: React.FormEvent) {
    if (e) {
      e.preventDefault();
    }
    setErrorMsg(null);

    if (name.trim().length < 2) {
      setStep(1);
      setErrorMsg("Enter your business or store name (at least 2 characters).");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/v1/merchant/businesses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          category,
          default_locale: locale,
          support_phone: phone.trim(),
          province,
          district: district.trim() || undefined,
          city: city.trim() || undefined,
          address_line1: addressLine1.trim() || undefined,
          primary_channel: primaryChannel,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        setErrorMsg(
          payload?.detail ?? "Could not set up your business. Please check inputs."
        );
        return;
      }

      toast.success(`${name.trim()} is ready on Sajilo Commerce`);
      router.push("/dashboard");
      router.refresh();
    } catch {
      setErrorMsg("Network error while creating workspace. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-ink">
          Guided Setup · Nepal (NPR)
        </p>
        <h1 className="mt-1 font-display text-2xl sm:text-3xl font-bold text-charcoal">
          Set up your business workspace
        </h1>
        <p className="mt-1 text-sm text-muted-ink">
          Takes under two minutes. You can skip optional details and update them anytime.
        </p>
      </div>

      {/* Step Indicator */}
      <nav aria-label="Onboarding steps" className="mb-6 grid grid-cols-3 gap-2.5">
        {STEPS.map((item) => {
          const Icon = item.icon;
          const isCurrent = step === item.id;
          const isDone = step > item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setErrorMsg(null);
                setStep(item.id);
              }}
              className={cn(
                "flex items-center gap-2.5 rounded-[12px] border px-3 py-2.5 text-left transition-colors",
                isCurrent
                  ? "border-coral bg-coral-tint text-charcoal"
                  : isDone
                    ? "border-soft bg-surface text-charcoal hover:bg-surface-hover"
                    : "border-soft bg-surface/70 text-muted-ink hover:bg-surface-hover"
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  isCurrent
                    ? "bg-coral text-white"
                    : isDone
                      ? "bg-success-bg text-success-fg"
                      : "bg-sand text-charcoal"
                )}
              >
                {isDone ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
              </span>
              <span className="truncate text-xs font-semibold">{item.title}</span>
            </button>
          );
        })}
      </nav>

      {/* Main Wizard Card */}
      <form
        onSubmit={handleCreateWorkspace}
        className="rounded-[14px] border border-soft bg-surface p-6 sm:p-8 shadow-[0_1px_2px_rgba(36,35,33,0.04)]"
      >
        {step === 1 && (
          <div className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="biz-name">Business or store name</Label>
              <Input
                id="biz-name"
                required
                placeholder="e.g., Pokhara Threads or Himalayan Craft"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-[42px] rounded-[10px] border-soft bg-surface"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="biz-category">Business category</Label>
              <select
                id="biz-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as CategoryOption)}
                className="h-[42px] w-full rounded-[10px] border border-soft bg-surface px-3 text-sm text-charcoal focus:border-coral focus:outline-none"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-[10px] border border-soft bg-ivory p-3.5">
                <p className="text-xs font-semibold text-muted-ink">
                  Country &amp; Currency
                </p>
                <p className="mt-1 text-sm font-semibold text-charcoal tabular-nums-npr">
                  Nepal · NPR (रु)
                </p>
                <p className="mt-0.5 text-xs text-muted-ink">
                  Default store market and currency
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>Preferred language</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setLocale("en")}
                    className={cn(
                      "h-[42px] rounded-[10px] border text-sm font-medium transition-colors",
                      locale === "en"
                        ? "border-coral bg-coral-tint text-charcoal font-semibold"
                        : "border-soft bg-surface text-muted-ink hover:text-charcoal"
                    )}
                  >
                    English (EN)
                  </button>
                  <button
                    type="button"
                    onClick={() => setLocale("ne")}
                    className={cn(
                      "h-[42px] rounded-[10px] border text-sm font-medium transition-colors",
                      locale === "ne"
                        ? "border-coral bg-coral-tint text-charcoal font-semibold"
                        : "border-soft bg-surface text-muted-ink hover:text-charcoal"
                    )}
                  >
                    नेपाली (NE)
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-ink">
                Optional for now — helps set up local delivery zones and order receipts.
              </p>
              <button
                type="button"
                onClick={handleNext}
                className="text-xs font-semibold text-charcoal underline underline-offset-4 hover:text-coral"
              >
                Skip step
              </button>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="biz-phone">Business mobile number (optional)</Label>
              <PhoneInput
                id="biz-phone"
                value={phone}
                onValueChange={setPhone}
                placeholder="98XXXXXXXX"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="biz-province">Province</Label>
                <select
                  id="biz-province"
                  value={province}
                  onChange={(e) => setProvince(e.target.value)}
                  className="h-[42px] w-full rounded-[10px] border border-soft bg-surface px-3 text-sm text-charcoal focus:border-coral focus:outline-none"
                >
                  {NEPAL_PROVINCES.map((prov) => (
                    <option key={prov} value={prov}>
                      {prov}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="biz-district">District</Label>
                <Input
                  id="biz-district"
                  placeholder="e.g., Kathmandu, Kaski, Gorkha"
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  className="h-[42px] rounded-[10px] border-soft bg-surface"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="biz-city">City / Municipality</Label>
                <Input
                  id="biz-city"
                  placeholder="e.g., Lalitpur, Lakeside"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="h-[42px] rounded-[10px] border-soft bg-surface"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="biz-address">Street / Landmark</Label>
                <Input
                  id="biz-address"
                  placeholder="e.g., New Road / Chipledhunga"
                  value={addressLine1}
                  onChange={(e) => setAddressLine1(e.target.value)}
                  className="h-[42px] rounded-[10px] border-soft bg-surface"
                />
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <p className="text-xs text-muted-ink">
              Choose your starting workflow — every pillar stays available as you grow.
            </p>
            <div className="space-y-2.5">
              {CHANNELS.map((ch) => {
                const selected = primaryChannel === ch.value;
                return (
                  <button
                    key={ch.value}
                    type="button"
                    onClick={() => setPrimaryChannel(ch.value)}
                    className={cn(
                      "flex w-full items-start justify-between gap-3 rounded-[12px] border p-3.5 text-left transition-colors",
                      selected
                        ? "border-coral bg-coral-tint/70"
                        : "border-soft bg-surface hover:bg-surface-hover"
                    )}
                  >
                    <div>
                      <p className="text-sm font-semibold text-charcoal">
                        {ch.title}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-ink">
                        {ch.description}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                        selected
                          ? "border-coral bg-coral text-white"
                          : "border-strong bg-surface"
                      )}
                    >
                      {selected ? <Check className="h-3 w-3" /> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {errorMsg ? (
          <p className="mt-4 rounded-[10px] border border-danger-border bg-danger-bg px-3 py-2 text-xs text-danger-fg">
            {errorMsg}
          </p>
        ) : null}

        <div className="mt-6 flex items-center justify-between gap-3 border-t border-soft pt-5">
          {step > 1 ? (
            <Button
              type="button"
              variant="outline"
              onClick={handleBack}
              disabled={submitting}
              className="h-[40px] rounded-[10px] border-soft bg-surface text-charcoal hover:bg-surface-hover"
            >
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Back
            </Button>
          ) : (
            <div />
          )}

          {step < 3 ? (
            <Button
              type="button"
              onClick={handleNext}
              className="h-[40px] rounded-[10px] bg-coral px-5 font-semibold text-white hover:bg-coral-hover"
            >
              Continue
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          ) : (
            <Button
              type="submit"
              disabled={submitting}
              className="h-[40px] rounded-[10px] bg-coral px-5 font-semibold text-white hover:bg-coral-hover"
            >
              {submitting ? "Creating workspace..." : "Launch dashboard"}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}