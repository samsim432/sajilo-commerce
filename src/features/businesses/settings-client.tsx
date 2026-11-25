"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2, MapPin, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/dashboard/commerce-inputs";
import { StatusBadge } from "@/components/dashboard/status-badge";

interface BusinessRecord {
  id: string;
  name: string;
  slug: string;
  category: string;
  default_locale: "en" | "ne";
  support_phone_e164: string | null;
  support_email: string | null;
  tax_registered: boolean;
  pan_vat_number: string | null;
}

interface LocationRecord {
  id: string;
  name: string;
  address_line1: string | null;
  city: string | null;
  district: string | null;
  province: string | null;
  is_default: boolean;
  is_active: boolean;
}

export function SettingsClient({
  canManage,
  business,
  locations,
}: {
  canManage: boolean;
  business: BusinessRecord;
  locations: LocationRecord[];
}) {
  const router = useRouter();
  const [name, setName] = React.useState(business.name);
  const [locale, setLocale] = React.useState<"en" | "ne">(business.default_locale);
  const [phone, setPhone] = React.useState(
    business.support_phone_e164?.replace(/^\+977/, "") ?? ""
  );
  const [email, setEmail] = React.useState(business.support_email ?? "");
  const [taxRegistered, setTaxRegistered] = React.useState(business.tax_registered);
  const [panVatNumber, setPanVatNumber] = React.useState(business.pan_vat_number ?? "");
  const [savingBiz, setSavingBiz] = React.useState(false);

  const [locName, setLocName] = React.useState("");
  const [locDistrict, setLocDistrict] = React.useState("");
  const [locAddress, setLocAddress] = React.useState("");
  const [addingLoc, setAddingLoc] = React.useState(false);

  async function handleSaveBusiness(e: React.FormEvent) {
    e.preventDefault();
    setSavingBiz(true);
    try {
      const res = await fetch("/api/v1/merchant/businesses/current", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          default_locale: locale,
          support_phone: phone.trim(),
          support_email: email.trim(),
          tax_registered: taxRegistered,
          pan_vat_number: panVatNumber.trim(),
        }),
      });
      const payload = await res.json();
      if (!res.ok) {
        toast.error(payload?.detail ?? "Could not save business settings.");
        return;
      }
      toast.success("Business settings saved");
      router.refresh();
    } catch {
      toast.error("Network error saving settings.");
    } finally {
      setSavingBiz(false);
    }
  }

  async function handleAddLocation(e: React.FormEvent) {
    e.preventDefault();
    setAddingLoc(true);
    try {
      const res = await fetch("/api/v1/merchant/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: locName.trim(),
          district: locDistrict.trim() || undefined,
          address_line1: locAddress.trim() || undefined,
        }),
      });
      const payload = await res.json();
      if (!res.ok) {
        toast.error(payload?.detail ?? "Could not add location.");
        return;
      }
      setLocName("");
      setLocDistrict("");
      setLocAddress("");
      toast.success("Location added");
      router.refresh();
    } catch {
      toast.error("Network error adding location.");
    } finally {
      setAddingLoc(false);
    }
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleSaveBusiness}
        className="rounded-[14px] border border-soft bg-surface p-5 sm:p-6 shadow-[0_1px_2px_rgba(36,35,33,0.04)] space-y-4"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-coral" />
            <h2 className="font-display text-base font-semibold text-charcoal">
              Business profile &amp; Nepal defaults
            </h2>
          </div>
          <span className="font-mono text-xs text-muted-ink">
            {business.slug}.sajilocommerce.com
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="set-name">Business name</Label>
            <Input
              id="set-name"
              disabled={!canManage}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-[42px] rounded-[10px] border-soft bg-surface"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="set-locale">Default language</Label>
            <select
              id="set-locale"
              disabled={!canManage}
              value={locale}
              onChange={(e) => setLocale(e.target.value as "en" | "ne")}
              className="h-[42px] w-full rounded-[10px] border border-soft bg-surface px-3 text-sm text-charcoal"
            >
              <option value="en">English (EN)</option>
              <option value="ne">नेपाली (NE)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="set-phone">Support mobile (+977)</Label>
            <PhoneInput
              id="set-phone"
              disabled={!canManage}
              value={phone}
              onValueChange={setPhone}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="set-email">Support email</Label>
            <Input
              id="set-email"
              type="email"
              disabled={!canManage}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-[42px] rounded-[10px] border-soft bg-surface"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
          <label className="flex h-[42px] items-center gap-2.5 rounded-[10px] border border-soft bg-ivory px-3.5 text-sm text-charcoal cursor-pointer">
            <input
              type="checkbox"
              disabled={!canManage}
              checked={taxRegistered}
              onChange={(e) => setTaxRegistered(e.target.checked)}
              className="h-4 w-4 accent-coral"
            />
            <span>Registered for PAN / VAT in Nepal</span>
          </label>

          <div className="space-y-1.5">
            <Label htmlFor="set-pan">PAN / VAT number (optional)</Label>
            <Input
              id="set-pan"
              disabled={!canManage}
              placeholder="e.g., 601234567"
              value={panVatNumber}
              onChange={(e) => setPanVatNumber(e.target.value)}
              className="h-[42px] rounded-[10px] border-soft bg-surface tabular-nums-npr"
            />
          </div>
        </div>

        {canManage && (
          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              disabled={savingBiz}
              className="h-[40px] rounded-[10px] bg-coral px-5 font-semibold text-white hover:bg-coral-hover"
            >
              {savingBiz ? "Saving..." : "Save changes"}
            </Button>
          </div>
        )}
      </form>

      {/* Locations & Warehouses */}
      <div className="rounded-[14px] border border-soft bg-surface p-5 sm:p-6 shadow-[0_1px_2px_rgba(36,35,33,0.04)] space-y-4">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-coral" />
          <h2 className="font-display text-base font-semibold text-charcoal">
            Locations &amp; warehouses
          </h2>
        </div>

        <div className="divide-y divide-soft rounded-[10px] border border-soft">
          {locations.map((loc) => (
            <div
              key={loc.id}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div>
                <p className="text-sm font-semibold text-charcoal">{loc.name}</p>
                <p className="text-xs text-muted-ink">
                  {[loc.address_line1, loc.city, loc.district]
                    .filter(Boolean)
                    .join(", ") || "Nepal · NPR"}
                </p>
              </div>
              <StatusBadge
                label={loc.is_default ? "Primary" : loc.is_active ? "Active" : "Inactive"}
                tone={loc.is_default ? "info" : "success"}
              />
            </div>
          ))}
        </div>

        {canManage && (
          <form onSubmit={handleAddLocation} className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-2">
            <div className="sm:col-span-4">
              <Input
                required
                placeholder="Branch name (e.g., Pokhara Hub)"
                value={locName}
                onChange={(e) => setLocName(e.target.value)}
                className="h-[40px] rounded-[10px] border-soft bg-surface"
              />
            </div>
            <div className="sm:col-span-3">
              <Input
                placeholder="District (e.g., Kaski)"
                value={locDistrict}
                onChange={(e) => setLocDistrict(e.target.value)}
                className="h-[40px] rounded-[10px] border-soft bg-surface"
              />
            </div>
            <div className="sm:col-span-3">
              <Input
                placeholder="Street / Landmark"
                value={locAddress}
                onChange={(e) => setLocAddress(e.target.value)}
                className="h-[40px] rounded-[10px] border-soft bg-surface"
              />
            </div>
            <div className="sm:col-span-2">
              <Button
                type="submit"
                disabled={addingLoc}
                variant="outline"
                className="h-[40px] w-full rounded-[10px] border-soft bg-surface text-charcoal hover:bg-surface-hover"
              >
                <Plus className="mr-1 h-4 w-4" />
                Add
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
