"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Layers, Plus, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/dashboard/commerce-inputs";
import {
  generateVariantMatrix,
  type GeneratedVariantRow,
  type OptionAxis,
} from "@/features/products/variant-matrix";

interface MediaItem {
  storage_path: string;
  public_url: string;
  mime_type: "image/jpeg" | "image/png" | "image/webp";
  byte_size: number;
  alt_text?: string | null;
}

export interface ProductEditorInitial {
  id?: string;
  title: string;
  category_id?: string | null;
  description?: string | null;
  status: "draft" | "active" | "archived";
  has_variants: boolean;
  option_axes: OptionAxis[];
  track_inventory: boolean;
  tax_applicable: boolean;
  variants: GeneratedVariantRow[];
  media: MediaItem[];
}

export function ProductEditorForm({
  categories,
  initialData,
}: {
  categories: Array<{ id: string; name: string }>;
  initialData?: ProductEditorInitial;
}) {
  const router = useRouter();
  const isEdit = Boolean(initialData?.id);

  const [title, setTitle] = React.useState(initialData?.title ?? "");
  const [categoryId, setCategoryId] = React.useState<string>(
    initialData?.category_id ?? ""
  );
  const [description, setDescription] = React.useState(
    initialData?.description ?? ""
  );
  const [status, setStatus] = React.useState<"draft" | "active" | "archived">(
    initialData?.status ?? "active"
  );
  const [trackInventory, setTrackInventory] = React.useState(
    initialData?.track_inventory ?? true
  );
  const [taxApplicable, setTaxApplicable] = React.useState(
    initialData?.tax_applicable ?? false
  );

  const [skuPrefix, setSkuPrefix] = React.useState("SC-ITEM");
  const [basePriceMinor, setBasePriceMinor] = React.useState<number>(
    initialData?.variants[0]?.price_minor ?? 149900
  );
  const [baseCostMinor, setBaseCostMinor] = React.useState<number>(
    initialData?.variants[0]?.cost_price_minor ?? 0
  );
  const [baseWeightGrams, setBaseWeightGrams] = React.useState<number>(
    initialData?.variants[0]?.weight_grams ?? 250
  );

  // Up to 3 option axes
  const [axes, setAxes] = React.useState<Array<{ name: string; rawValues: string }>>(
    initialData?.option_axes && initialData.option_axes.length > 0
      ? initialData.option_axes.map((a) => ({
          name: a.name,
          rawValues: a.values.join(", "),
        }))
      : []
  );

  const [variants, setVariants] = React.useState<GeneratedVariantRow[]>(
    initialData?.variants ?? [
      {
        title: "Default",
        sku: "SC-ITEM-01",
        option_values: {},
        price_minor: 149900,
        compare_at_price_minor: null,
        cost_price_minor: null,
        weight_grams: 250,
        low_stock_threshold: 3,
        is_active: true,
        position: 0,
      },
    ]
  );

  const [media, setMedia] = React.useState<MediaItem[]>(initialData?.media ?? []);
  const [uploadingImage, setUploadingImage] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  function addOptionAxis() {
    if (axes.length >= 3) {
      toast.info("Up to 3 variant option axes are supported per product.");
      return;
    }
    setAxes((prev) => [...prev, { name: "", rawValues: "" }]);
  }

  function applyVariantMatrix() {
    const parsedAxes: OptionAxis[] = axes
      .map((a) => ({
        name: a.name.trim(),
        values: a.rawValues
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      }))
      .filter((a) => a.name.length > 0 && a.values.length > 0);

    const generated = generateVariantMatrix({
      axes: parsedAxes,
      skuPrefix,
      defaultPriceMinor: basePriceMinor,
      defaultCostMinor: baseCostMinor > 0 ? baseCostMinor : null,
      defaultWeightGrams: baseWeightGrams,
    });
    setVariants(generated);
    toast.success(`Generated ${generated.length} variant(s)`);
  }

  function updateVariantField(
    index: number,
    patch: Partial<GeneratedVariantRow>
  ) {
    setVariants((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row))
    );
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    setErrorMsg(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/v1/merchant/media/upload", {
        method: "POST",
        body: formData,
      });
      const payload = await res.json();
      if (!res.ok) {
        toast.error(payload?.detail ?? "Image upload failed.");
        return;
      }
      setMedia((prev) => [
        ...prev,
        {
          storage_path: payload.data.storage_path,
          public_url: payload.data.public_url,
          mime_type: payload.data.mime_type,
          byte_size: payload.data.byte_size,
          alt_text: title || file.name,
        },
      ]);
      toast.success("Product photo uploaded");
    } finally {
      setUploadingImage(false);
      e.target.value = "";
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    if (!title.trim()) {
      setErrorMsg("Enter a product title.");
      return;
    }

    const parsedAxes: OptionAxis[] = axes
      .map((a) => ({
        name: a.name.trim(),
        values: a.rawValues
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      }))
      .filter((a) => a.name.length > 0 && a.values.length > 0);

    setSaving(true);
    try {
      const endpoint = isEdit
        ? `/api/v1/merchant/products/${initialData!.id}`
        : "/api/v1/merchant/products";
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          category_id: categoryId || null,
          description: description.trim() || null,
          status,
          has_variants: parsedAxes.length > 0 || variants.length > 1,
          option_axes: parsedAxes,
          track_inventory: trackInventory,
          tax_applicable: taxApplicable,
          variants,
          media,
        }),
      });

      const payload = await res.json();
      if (!res.ok) {
        setErrorMsg(payload?.detail ?? "Could not save product.");
        return;
      }

      toast.success(isEdit ? "Product updated" : "Product created");
      router.push("/dashboard/products");
      router.refresh();
    } catch {
      setErrorMsg("Network error saving product.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/products"
            className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-soft bg-surface text-charcoal hover:bg-surface-hover"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="font-display text-2xl font-bold text-charcoal">
              {isEdit ? "Edit product" : "New product"}
            </h1>
            <p className="text-xs text-muted-ink">
              Prices in NPR minor units (paisa) · Up to 3 variant axes
            </p>
          </div>
        </div>

        <Button
          type="submit"
          disabled={saving}
          className="h-[40px] rounded-[10px] bg-coral px-5 font-semibold text-white hover:bg-coral-hover"
        >
          {saving ? "Saving..." : isEdit ? "Save changes" : "Publish product"}
        </Button>
      </div>

      {errorMsg && (
        <div className="rounded-[10px] border border-danger-border bg-danger-bg px-4 py-3 text-xs font-medium text-danger-fg">
          {errorMsg}
        </div>
      )}

      {/* Core Details */}
      <div className="rounded-[14px] border border-soft bg-surface p-5 sm:p-6 shadow-[0_1px_2px_rgba(36,35,33,0.04)] space-y-4">
        <h2 className="font-display text-base font-semibold text-charcoal">
          Product details
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
          <div className="sm:col-span-7 space-y-1.5">
            <Label htmlFor="prod-title">Title</Label>
            <Input
              id="prod-title"
              required
              placeholder="e.g., Kathmandu Heavyweight Hoodie"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-[42px] rounded-[10px] border-soft bg-surface"
            />
          </div>

          <div className="sm:col-span-3 space-y-1.5">
            <Label htmlFor="prod-cat">Category</Label>
            <select
              id="prod-cat"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="h-[42px] w-full rounded-[10px] border border-soft bg-surface px-3 text-sm text-charcoal"
            >
              <option value="">Uncategorized</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2 space-y-1.5">
            <Label htmlFor="prod-status">Status</Label>
            <select
              id="prod-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as "draft" | "active" | "archived")}
              className="h-[42px] w-full rounded-[10px] border border-soft bg-surface px-3 text-sm text-charcoal"
            >
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="prod-desc">Description</Label>
          <textarea
            id="prod-desc"
            rows={3}
            placeholder="Fabric, sizing notes, warranty, or delivery details..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-[10px] border border-soft bg-surface p-3 text-sm text-charcoal focus:border-coral focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap gap-6 pt-1 text-xs text-charcoal">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={trackInventory}
              onChange={(e) => setTrackInventory(e.target.checked)}
              className="h-4 w-4 accent-coral"
            />
            <span>Track stock quantity &amp; reservations</span>
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={taxApplicable}
              onChange={(e) => setTaxApplicable(e.target.checked)}
              className="h-4 w-4 accent-coral"
            />
            <span>Taxable item</span>
          </label>
        </div>
      </div>

      {/* Media Upload */}
      <div className="rounded-[14px] border border-soft bg-surface p-5 sm:p-6 shadow-[0_1px_2px_rgba(36,35,33,0.04)] space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-charcoal">
            Photos (JPEG, PNG, WebP · up to 5 MB)
          </h2>
          <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[10px] border border-soft bg-ivory px-3 text-xs font-semibold text-charcoal hover:bg-surface-hover">
            <Upload className="h-3.5 w-3.5 text-coral" />
            <span>{uploadingImage ? "Uploading..." : "Upload photo"}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleImageUpload}
              disabled={uploadingImage}
              className="hidden"
            />
          </label>
        </div>

        {media.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {media.map((m, i) => (
              <div
                key={m.storage_path}
                className="relative h-24 w-24 overflow-hidden rounded-[10px] border border-soft"
              >
                <img
                  src={m.public_url}
                  alt={m.alt_text ?? `Product image ${i + 1}`}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() =>
                    setMedia((prev) => prev.filter((_, idx) => idx !== i))
                  }
                  className="absolute right-1 top-1 rounded-full bg-charcoal/80 p-1 text-white hover:bg-danger-fg"
                  aria-label="Remove image"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Multi-Axis Variant Matrix Builder */}
      <div className="rounded-[14px] border border-soft bg-surface p-5 sm:p-6 shadow-[0_1px_2px_rgba(36,35,33,0.04)] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-coral" />
            <h2 className="font-display text-base font-semibold text-charcoal">
              Variants &amp; SKUs ({variants.length})
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={addOptionAxis}
              className="h-8 rounded-[8px] border-soft text-xs"
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add option axis ({axes.length}/3)
            </Button>
            {axes.length > 0 && (
              <Button
                type="button"
                size="sm"
                onClick={applyVariantMatrix}
                className="h-8 rounded-[8px] bg-charcoal text-xs font-semibold text-ivory"
              >
                Generate variant matrix
              </Button>
            )}
          </div>
        </div>

        {/* Defaults for Matrix Generation */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 rounded-[10px] border border-soft bg-ivory p-3.5">
          <div className="space-y-1">
            <Label htmlFor="sku-prefix" className="text-xs">
              SKU prefix
            </Label>
            <Input
              id="sku-prefix"
              value={skuPrefix}
              onChange={(e) => setSkuPrefix(e.target.value)}
              className="h-9 rounded-[8px] border-soft bg-surface font-mono text-xs uppercase"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Default price (NPR)</Label>
            <CurrencyInput
              valueMinor={basePriceMinor}
              onChangeMinor={setBasePriceMinor}
              className="h-9"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Cost price (NPR, optional)</Label>
            <CurrencyInput
              valueMinor={baseCostMinor}
              onChangeMinor={setBaseCostMinor}
              className="h-9"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="base-weight" className="text-xs">
              Weight (grams)
            </Label>
            <Input
              id="base-weight"
              type="number"
              min={0}
              value={baseWeightGrams}
              onChange={(e) => setBaseWeightGrams(Math.max(0, Number(e.target.value) || 0))}
              className="h-9 rounded-[8px] border-soft bg-surface text-xs tabular-nums-npr"
            />
          </div>
        </div>

        {/* Option Axes Rows */}
        {axes.map((axis, idx) => (
          <div
            key={idx}
            className="grid grid-cols-1 sm:grid-cols-12 gap-3 rounded-[10px] border border-soft p-3"
          >
            <div className="sm:col-span-4 space-y-1">
              <Label className="text-xs">Option {idx + 1} name</Label>
              <Input
                placeholder="e.g., Size or Colour"
                value={axis.name}
                onChange={(e) => {
                  const val = e.target.value;
                  setAxes((prev) =>
                    prev.map((item, i) => (i === idx ? { ...item, name: val } : item))
                  );
                }}
                className="h-9 rounded-[8px] border-soft bg-surface text-sm"
              />
            </div>
            <div className="sm:col-span-7 space-y-1">
              <Label className="text-xs">Values (comma separated)</Label>
              <Input
                placeholder="e.g., S, M, L, XL"
                value={axis.rawValues}
                onChange={(e) => {
                  const val = e.target.value;
                  setAxes((prev) =>
                    prev.map((item, i) =>
                      i === idx ? { ...item, rawValues: val } : item
                    )
                  );
                }}
                className="h-9 rounded-[8px] border-soft bg-surface text-sm"
              />
            </div>
            <div className="sm:col-span-1 flex items-end justify-end">
              <button
                type="button"
                onClick={() => setAxes((prev) => prev.filter((_, i) => i !== idx))}
                className="h-9 w-9 inline-flex items-center justify-center rounded-[8px] border border-soft text-muted-ink hover:text-danger-fg"
                aria-label="Remove option axis"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}

        {/* Variant Rows */}
        <div className="divide-y divide-soft rounded-[10px] border border-soft">
          {variants.map((v, idx) => (
            <div
              key={`${v.sku}-${idx}`}
              className="grid grid-cols-1 sm:grid-cols-12 items-center gap-3 p-3"
            >
              <div className="sm:col-span-3">
                <p className="text-xs font-semibold text-charcoal">{v.title}</p>
              </div>
              <div className="sm:col-span-3">
                <Input
                  value={v.sku}
                  onChange={(e) =>
                    updateVariantField(idx, { sku: e.target.value.toUpperCase() })
                  }
                  placeholder="SKU"
                  className="h-9 rounded-[8px] border-soft bg-surface font-mono text-xs uppercase"
                />
              </div>
              <div className="sm:col-span-3">
                <CurrencyInput
                  valueMinor={v.price_minor}
                  onChangeMinor={(minor) =>
                    updateVariantField(idx, { price_minor: minor })
                  }
                  className="h-9"
                />
              </div>
              <div className="sm:col-span-2">
                <Input
                  type="number"
                  min={0}
                  value={v.weight_grams}
                  onChange={(e) =>
                    updateVariantField(idx, {
                      weight_grams: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                  className="h-9 rounded-[8px] border-soft bg-surface text-xs tabular-nums-npr"
                  aria-label="Weight in grams"
                />
              </div>
              <div className="sm:col-span-1 flex justify-end">
                {variants.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setVariants((prev) => prev.filter((_, i) => i !== idx))
                    }
                    className="p-1.5 text-muted-ink hover:text-danger-fg"
                    aria-label="Remove variant"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </form>
  );
}
