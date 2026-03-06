"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { CATEGORIES } from "@/lib/categories";
import { getCategoryIcon } from "@/lib/categories";
import { formatPrice, escapeCSV, formatDate } from "@/lib/format";
import { getAveragePrice, getPriceRange } from "@/lib/price-fetcher";
import type { CollectionItem, CardCategory } from "@/lib/types";

type SortKey = "date" | "value_high" | "value_low" | "name" | "grade";

export default function CollectionPage() {
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<CardCategory | "all">(
    "all"
  );
  const [sortBy, setSortBy] = useState<SortKey>("date");
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [refreshResult, setRefreshResult] = useState<string | null>(null);

  const fetchCollection = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (categoryFilter !== "all") params.set("category", categoryFilter);
    const res = await fetch(`/api/collection?${params}`);
    const data = await res.json();
    setItems(data.items || []);
    setLoading(false);
  }, [categoryFilter]);

  useEffect(() => {
    fetchCollection();
  }, [fetchCollection]);

  // Client-side search filter
  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter((item) => {
      const card = item.card;
      if (!card) return false;
      return (
        card.name.toLowerCase().includes(q) ||
        (card.set_name && card.set_name.toLowerCase().includes(q)) ||
        (card.card_number && card.card_number.toLowerCase().includes(q)) ||
        (item.notes && item.notes.toLowerCase().includes(q))
      );
    });
  }, [items, searchQuery]);

  const sorted = [...filtered].sort((a, b) => {
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

  const exportCSV = () => {
    const headers = [
      "Name",
      "Set",
      "Card #",
      "Year",
      "Category",
      "Condition",
      "Grade",
      "Qty",
      "Market Price",
      "Low Price",
      "High Price",
      "Date Added",
    ];

    const rows = sorted.map((item) => {
      const range = getPriceRange(item.prices || []);
      return [
        escapeCSV(item.card?.name),
        escapeCSV(item.card?.set_name),
        escapeCSV(item.card?.card_number),
        escapeCSV(item.card?.year),
        escapeCSV(item.card?.category),
        escapeCSV(
          item.condition === "graded"
            ? `${item.grading_company} ${item.grade}`
            : "Raw"
        ),
        escapeCSV(item.grade),
        escapeCSV(item.quantity),
        escapeCSV(range.market),
        escapeCSV(range.low),
        escapeCSV(range.high),
        escapeCSV(formatDate(item.date_added)),
      ].join(",");
    });

    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const date = new Date().toISOString().slice(0, 10);
    a.download = `card-vault-collection-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Collection</h1>
        <div className="flex items-center gap-2">
          {items.length > 0 && (
            <>
              <button
                onClick={async () => {
                  setRefreshingAll(true);
                  setRefreshResult(null);
                  try {
                    const res = await fetch("/api/prices/refresh-all", { method: "POST" });
                    const data = await res.json();
                    if (data.error) {
                      setRefreshResult("Failed to refresh prices");
                    } else {
                      setRefreshResult(`Refreshed ${data.refreshed}/${data.total} cards`);
                      fetchCollection();
                    }
                  } catch {
                    setRefreshResult("Failed to refresh prices");
                  }
                  setRefreshingAll(false);
                }}
                disabled={refreshingAll}
                className="px-4 py-2 rounded-lg bg-card-bg border border-card-border hover:border-accent text-sm font-medium transition-colors disabled:opacity-50"
              >
                {refreshingAll ? "Refreshing..." : "Refresh All Prices"}
              </button>
              <button
                onClick={exportCSV}
                className="px-4 py-2 rounded-lg bg-card-bg border border-card-border hover:border-accent text-sm font-medium transition-colors"
              >
                Export CSV
              </button>
            </>
          )}
          <Link
            href="/add"
            className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors"
          >
            + Add Card
          </Link>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search collection..."
          className="flex-1 min-w-[200px] px-3 py-2 rounded-lg bg-card-bg border border-card-border text-sm focus:outline-none focus:border-accent"
        />
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

      {refreshResult && (
        <div className="text-sm text-success mb-4 bg-card-bg border border-card-border rounded-lg px-3 py-2 flex items-center justify-between">
          <span>{refreshResult}</span>
          <button onClick={() => setRefreshResult(null)} className="text-muted hover:text-foreground ml-2">✕</button>
        </div>
      )}

      {searchQuery && (
        <div className="text-sm text-muted mb-4">
          {sorted.length} result{sorted.length !== 1 ? "s" : ""} for &quot;{searchQuery}&quot;
        </div>
      )}

      {/* Results */}
      {loading ? (
        <div className="text-center py-16 text-muted">Loading collection...</div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">🃏</div>
          <h2 className="text-lg font-medium mb-2">
            {searchQuery ? "No cards match your search" : "No cards yet"}
          </h2>
          <p className="text-muted mb-4">
            {searchQuery
              ? "Try a different search term."
              : "Start building your collection!"}
          </p>
          {!searchQuery && (
            <Link
              href="/add"
              className="inline-block px-6 py-3 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium transition-colors"
            >
              Add Your First Card
            </Link>
          )}
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
                  <div className="flex items-center justify-end mt-2">
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
