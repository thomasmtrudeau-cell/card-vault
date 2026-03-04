"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { CATEGORIES } from "@/lib/categories";
import { getCategoryIcon } from "@/lib/categories";
import { formatPrice } from "@/lib/format";
import { getAveragePrice, getPriceRange } from "@/lib/price-fetcher";
import type { CollectionItem, CardCategory, Owner } from "@/lib/types";

type SortKey = "date" | "value_high" | "value_low" | "name" | "grade";

export default function CollectionPage() {
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [ownerFilter, setOwnerFilter] = useState<Owner | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<CardCategory | "all">(
    "all"
  );
  const [sortBy, setSortBy] = useState<SortKey>("date");

  const fetchCollection = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (ownerFilter !== "all") params.set("owner", ownerFilter);
    if (categoryFilter !== "all") params.set("category", categoryFilter);
    const res = await fetch(`/api/collection?${params}`);
    const data = await res.json();
    setItems(data.items || []);
    setLoading(false);
  }, [ownerFilter, categoryFilter]);

  useEffect(() => {
    fetchCollection();
  }, [fetchCollection]);

  const sorted = [...items].sort((a, b) => {
    switch (sortBy) {
      case "value_high": {
        const va = getAveragePrice(a.prices || []) || 0;
        const vb = getAveragePrice(b.prices || []) || 0;
        return vb - va;
      }
      case "value_low": {
        const va2 = getAveragePrice(a.prices || []) || 0;
        const vb2 = getAveragePrice(b.prices || []) || 0;
        return va2 - vb2;
      }
      case "name":
        return (a.card?.name || "").localeCompare(b.card?.name || "");
      case "grade":
        return (b.grade || 0) - (a.grade || 0);
      case "date":
      default:
        return (
          new Date(b.date_added).getTime() - new Date(a.date_added).getTime()
        );
    }
  });

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Collection</h1>
        <Link
          href="/add"
          className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors"
        >
          + Add Card
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <select
          value={ownerFilter}
          onChange={(e) => setOwnerFilter(e.target.value as Owner | "all")}
          className="px-3 py-2 rounded-lg bg-card-bg border border-card-border text-sm focus:outline-none focus:border-accent"
        >
          <option value="all">All Owners</option>
          <option value="remy">Remy</option>
          <option value="leo">Leo</option>
        </select>
        <select
          value={categoryFilter}
          onChange={(e) =>
            setCategoryFilter(e.target.value as CardCategory | "all")
          }
          className="px-3 py-2 rounded-lg bg-card-bg border border-card-border text-sm focus:outline-none focus:border-accent"
        >
          <option value="all">All Categories</option>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortKey)}
          className="px-3 py-2 rounded-lg bg-card-bg border border-card-border text-sm focus:outline-none focus:border-accent"
        >
          <option value="date">Newest First</option>
          <option value="value_high">Value: High → Low</option>
          <option value="value_low">Value: Low → High</option>
          <option value="name">Name A-Z</option>
          <option value="grade">Grade: High → Low</option>
        </select>
      </div>

      {/* Results */}
      {loading ? (
        <div className="text-center py-16 text-muted">Loading collection...</div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">🃏</div>
          <h2 className="text-lg font-medium mb-2">No cards yet</h2>
          <p className="text-muted mb-4">Start building your collection!</p>
          <Link
            href="/add"
            className="inline-block px-6 py-3 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium transition-colors"
          >
            Add Your First Card
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {sorted.map((item) => {
            const range = getPriceRange(item.prices || []);
            return (
              <Link
                href={`/card/${item.id}`}
                key={item.id}
                className="group rounded-xl bg-card-bg border border-card-border hover:border-accent transition-colors overflow-hidden"
              >
                <div className="aspect-[2.5/3.5] relative bg-background flex items-center justify-center">
                  {item.card?.image_url ? (
                    <Image
                      src={item.card.image_url}
                      alt={item.card?.name || "Card"}
                      fill
                      className="object-contain p-2"
                      unoptimized
                    />
                  ) : (
                    <span className="text-4xl">
                      {getCategoryIcon(
                        item.card?.category as CardCategory
                      )}
                    </span>
                  )}
                </div>
                <div className="p-3">
                  <div className="text-sm font-medium leading-tight truncate">
                    {item.card?.name}
                  </div>
                  <div className="text-xs text-muted truncate mt-0.5">
                    {item.card?.set_name}
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span
                      className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                        item.owner === "remy"
                          ? "bg-remy/20 text-remy"
                          : "bg-leo/20 text-leo"
                      }`}
                    >
                      {item.owner === "remy" ? "Remy" : "Leo"}
                    </span>
                    <div className="text-right">
                      <div className="text-xs text-success font-medium">
                        {formatPrice(range.market)}
                      </div>
                      {range.low && range.high && range.low !== range.high && (
                        <div className="text-[10px] text-muted leading-tight">
                          {formatPrice(range.low)}–{formatPrice(range.high)}
                        </div>
                      )}
                    </div>
                  </div>
                  {item.condition === "graded" && (
                    <div className="text-xs text-muted mt-1">
                      {item.grading_company} {item.grade}
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
