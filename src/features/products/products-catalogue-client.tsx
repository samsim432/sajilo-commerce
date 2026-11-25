"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FolderPlus, Package, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { EmptyState } from "@/components/dashboard/empty-state";
import { formatNpr } from "@/lib/currency/npr";

export interface ProductListItem {
  id: string;
  title: string;
  slug: string;
  status: "draft" | "active" | "archived";
  has_variants: boolean;
  categories?: { id: string; name: string } | Array<{ id: string; name: string }> | null;
  product_variants?: Array<{
    id: string;
    sku: string;
    price_minor: number;
    is_active: boolean;
  }>;
  product_media?: Array<{
    id: string;
    public_url: string;
    position: number;
  }>;
}

export interface CategoryOption {
  id: string;
  name: string;
}

export function ProductsCatalogueClient({
  initialProducts,
  initialCategories,
  canWrite,
}: {
  initialProducts: ProductListItem[];
  initialCategories: CategoryOption[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"all" | "active" | "draft" | "archived">("all");
  const [newCategoryName, setNewCategoryName] = React.useState("");
  const [addingCategory, setAddingCategory] = React.useState(false);

  const filtered = React.useMemo(() => {
    return initialProducts.filter((p) => {
      const matchesStatus = statusFilter === "all" || p.status === statusFilter;
      const q = search.trim().toLowerCase();
      const matchesQuery =
        !q ||
        p.title.toLowerCase().includes(q) ||
        (p.product_variants ?? []).some((v) => v.sku.toLowerCase().includes(q));
      return matchesStatus && matchesQuery;
    });
  }, [initialProducts, search, statusFilter]);

  async function handleCreateCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    setAddingCategory(true);
    try {
      const res = await fetch("/api/v1/merchant/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCategoryName.trim() }),
      });
      const payload = await res.json();
      if (!res.ok) {
        toast.error(payload?.detail ?? "Could not add category.");
        return;
      }
      setNewCategoryName("");
      toast.success(`Category "${payload.data.name}" added`);
      router.refresh();
    } finally {
      setAddingCategory(false);
    }
  }

  function priceSummary(variants: ProductListItem["product_variants"]) {
    const active = (variants ?? []).filter((v) => v.is_active);
    const list = active.length > 0 ? active : variants ?? [];
    if (list.length === 0) return formatNpr(0);
    const prices = list.map((v) => v.price_minor);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    return minPrice === maxPrice
      ? formatNpr(minPrice)
      : `${formatNpr(minPrice)} – ${formatNpr(maxPrice)}`;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-charcoal">
            Products
          </h1>
          <p className="mt-1 text-sm text-muted-ink">
            Manage catalogue items, multi-axis variants, SKUs, and NPR pricing.
          </p>
        </div>

        {canWrite && (
          <Link
            href="/dashboard/products/new"
            className="inline-flex h-[40px] items-center justify-center gap-1.5 rounded-[10px] bg-coral px-4 text-sm font-semibold text-white hover:bg-coral-hover transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>Add product</span>
          </Link>
        )}
      </div>

      {/* Filter & Category Bar */}
      <div className="rounded-[14px] border border-soft bg-surface p-4 shadow-[0_1px_2px_rgba(36,35,33,0.04)] space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-ink" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by product title or SKU..."
              className="h-[38px] rounded-[10px] border-soft bg-surface pl-9 text-sm"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(["all", "active", "draft", "archived"] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`h-8 rounded-[8px] px-3 text-xs font-medium capitalize transition-colors ${
                  statusFilter === st
                    ? "bg-charcoal text-ivory"
                    : "bg-ivory text-muted-ink hover:text-charcoal border border-soft"
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        {canWrite && (
          <form
            onSubmit={handleCreateCategory}
            className="flex flex-wrap items-center gap-2 border-t border-soft pt-3"
          >
            <span className="text-xs font-medium text-muted-ink">
              Categories ({initialCategories.length}):
            </span>
            {initialCategories.slice(0, 6).map((c) => (
              <span
                key={c.id}
                className="rounded-full bg-sand/70 px-2.5 py-0.5 text-xs text-charcoal"
              >
                {c.name}
              </span>
            ))}
            <div className="ml-auto flex items-center gap-2">
              <Input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="New category..."
                className="h-8 w-44 rounded-[8px] border-soft bg-surface text-xs"
              />
              <Button
                type="submit"
                size="sm"
                variant="outline"
                disabled={addingCategory}
                className="h-8 rounded-[8px] border-soft text-xs"
              >
                <FolderPlus className="mr-1 h-3.5 w-3.5" />
                Add
              </Button>
            </div>
          </form>
        )}
      </div>

      {/* Product List */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Package className="h-5 w-5" />}
          title="No products match your view"
          description="Create a single-item or multi-variant product to start tracking SKUs, stock, and storefront sales."
          action={
            canWrite ? (
              <Link
                href="/dashboard/products/new"
                className="inline-flex h-[40px] items-center gap-1.5 rounded-[10px] bg-coral px-4 text-sm font-semibold text-white hover:bg-coral-hover"
              >
                <Plus className="h-4 w-4" />
                Create your first product
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block overflow-hidden rounded-[14px] border border-soft bg-surface shadow-[0_1px_2px_rgba(36,35,33,0.04)]">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-soft bg-sand/40 text-xs font-semibold uppercase tracking-[0.04em] text-muted-ink">
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Variants</th>
                  <th className="px-4 py-3">Price (NPR)</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-soft text-sm">
                {filtered.map((prod) => {
                  const cat = Array.isArray(prod.categories)
                    ? prod.categories[0]
                    : prod.categories;
                  const thumb = (prod.product_media ?? [])
                    .slice()
                    .sort((a, b) => a.position - b.position)[0]?.public_url;
                  const variants = prod.product_variants ?? [];
                  return (
                    <tr
                      key={prod.id}
                      className="hover:bg-surface-hover/70 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {thumb ? (
                            <img
                              src={thumb}
                              alt={prod.title}
                              className="h-10 w-10 rounded-[8px] border border-soft object-cover shrink-0"
                            />
                          ) : (
                            <div className="flex h-10 w-10 items-center justify-center rounded-[8px] border border-soft bg-ivory text-muted-ink shrink-0">
                              <Package className="h-4 w-4" />
                            </div>
                          )}
                          <div>
                            <p className="font-semibold text-charcoal">{prod.title}</p>
                            <p className="font-mono text-xs text-muted-ink">
                              {variants[0]?.sku ?? prod.slug}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-ink">
                        {cat?.name ?? "Uncategorized"}
                      </td>
                      <td className="px-4 py-3 text-xs text-charcoal tabular-nums-npr">
                        {variants.length} {variants.length === 1 ? "variant" : "variants"}
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-charcoal tabular-nums-npr">
                        {priceSummary(variants)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          label={prod.status}
                          tone={
                            prod.status === "active"
                              ? "success"
                              : prod.status === "draft"
                                ? "warning"
                                : "neutral"
                          }
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/dashboard/products/${prod.id}`}
                          className="text-xs font-semibold text-charcoal underline underline-offset-4 hover:text-coral"
                        >
                          Edit
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card Fallback */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {filtered.map((prod) => {
              const variants = prod.product_variants ?? [];
              return (
                <Link
                  key={prod.id}
                  href={`/dashboard/products/${prod.id}`}
                  className="rounded-[14px] border border-soft bg-surface p-4 shadow-[0_1px_2px_rgba(36,35,33,0.04)]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-charcoal">{prod.title}</p>
                    <StatusBadge
                      label={prod.status}
                      tone={prod.status === "active" ? "success" : "warning"}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-muted-ink">
                    <span>{variants.length} variant(s)</span>
                    <span className="font-semibold text-charcoal tabular-nums-npr">
                      {priceSummary(variants)}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
