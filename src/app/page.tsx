"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { getCategoryIcon, getCategoryLabel } from "@/lib/categories";
import { formatPrice, afterEbayFees } from "@/lib/format";
import { getAveragePrice, getPriceRange } from "@/lib/price-fetcher";
import type { CollectionItem, CardCategory } from "@/lib/types";

const SPORTS_CATS: CardCategory[] = [
  "baseball",
  "football",
  "basketball",
  "hockey",
];
const TCG_CATS: CardCategory[] = ["pokemon", "magic", "yugioh"];

interface CategoryValue {
  category: CardCategory;
  count: number;
  value: number;
  lowValue: number;
  highValue: number;
}

interface Stats {
  totalCards: number;
  totalValue: number;
  totalLow: number;
  totalHigh: number;
  remyValue: number;
  leoValue: number;
  remyCount: number;
  leoCount: number;
  mostValuable: CollectionItem | null;
  mostValuablePrice: number;
  categoryValues: CategoryValue[];
  sportsTotal: number;
  tcgTotal: number;
  recentCards: CollectionItem[];
}

function computeStats(items: CollectionItem[]): Stats {
  let totalValue = 0;
  let totalLow = 0;
  let totalHigh = 0;
  let remyValue = 0;
  let leoValue = 0;
  let remyCount = 0;
  let leoCount = 0;
  let mostValuable: CollectionItem | null = null;
  let mostValuablePrice = 0;
  const catMap: Record<string, CategoryValue> = {};

  for (const item of items) {
    const qty = item.quantity || 1;
    const range = getPriceRange(item.prices || []);
    const price = range.market || 0;
    const low = range.low || price;
    const high = range.high || price;
    const itemValue = price * qty;
    totalValue += itemValue;
    totalLow += low * qty;
    totalHigh += high * qty;

    if (item.owner === "remy") {
      remyValue += itemValue;
      remyCount += qty;
    } else {
      leoValue += itemValue;
      leoCount += qty;
    }

    if (price > mostValuablePrice) {
      mostValuablePrice = price;
      mostValuable = item;
    }

    const cat = (item.card?.category || "unknown") as CardCategory;
    if (!catMap[cat]) {
      catMap[cat] = { category: cat, count: 0, value: 0, lowValue: 0, highValue: 0 };
    }
    catMap[cat].count += qty;
    catMap[cat].value += itemValue;
    catMap[cat].lowValue += low * qty;
    catMap[cat].highValue += high * qty;
  }

  const categoryValues = Object.values(catMap).sort((a, b) => b.value - a.value);

  const sportsTotal = categoryValues
    .filter((c) => SPORTS_CATS.includes(c.category))
    .reduce((s, c) => s + c.value, 0);
  const tcgTotal = categoryValues
    .filter((c) => TCG_CATS.includes(c.category))
    .reduce((s, c) => s + c.value, 0);

  const recentCards = [...items]
    .sort(
      (a, b) =>
        new Date(b.date_added).getTime() - new Date(a.date_added).getTime()
    )
    .slice(0, 5);

  return {
    totalCards: items.reduce((sum, i) => sum + (i.quantity || 1), 0),
    totalValue,
    totalLow,
    totalHigh,
    remyValue,
    leoValue,
    remyCount,
    leoCount,
    mostValuable,
    mostValuablePrice,
    categoryValues,
    sportsTotal,
    tcgTotal,
    recentCards,
  };
}

export default function Dashboard() {
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/collection");
      const data = await res.json();
      setItems(data.items || []);
      setLoading(false);
    }
    load();
  }, []);

  const stats = computeStats(items);

  if (loading) {
    return (
      <div className="p-8 text-center text-muted">Loading dashboard...</div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Card Vault</h1>
          <p className="text-muted text-sm">
            Remy & Leo&apos;s Card Collection
          </p>
        </div>
        <Link
          href="/add"
          className="px-6 py-3 rounded-xl bg-accent hover:bg-accent-hover text-white font-medium text-lg transition-colors shadow-lg shadow-accent/20"
        >
          + Add Card
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-6xl mb-4">🃏</div>
          <h2 className="text-2xl font-bold mb-2">Welcome to Card Vault!</h2>
          <p className="text-muted mb-6">
            Start tracking your card collection. Add your first card to get
            started.
          </p>
          <Link
            href="/add"
            className="inline-block px-8 py-4 rounded-xl bg-accent hover:bg-accent-hover text-white font-medium text-lg transition-colors"
          >
            Add Your First Card
          </Link>
        </div>
      ) : (
        <>
          {/* Total Value Hero */}
          <div className="rounded-2xl bg-card-bg border border-card-border p-6 mb-6">
            <div className="text-sm text-muted mb-1">Total Collection Value</div>
            <div className="text-4xl font-bold text-success">
              {formatPrice(stats.totalValue)}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted">
              <span>Range: {formatPrice(stats.totalLow)} – {formatPrice(stats.totalHigh)}</span>
              <span>After eBay Fees: <span className="text-foreground font-medium">{formatPrice(afterEbayFees(stats.totalValue))}</span></span>
            </div>

            {/* Remy vs Leo */}
            <div className="grid grid-cols-2 gap-4 mt-5">
              <div className="rounded-xl bg-remy/10 border border-remy/20 p-4">
                <div className="text-sm text-remy font-medium">Remy</div>
                <div className="text-xl font-bold">
                  {formatPrice(stats.remyValue)}
                </div>
                <div className="text-xs text-muted">
                  {stats.remyCount} card{stats.remyCount !== 1 ? "s" : ""}
                  {stats.remyValue > 0 && (
                    <> · Net {formatPrice(afterEbayFees(stats.remyValue))}</>
                  )}
                </div>
              </div>
              <div className="rounded-xl bg-leo/10 border border-leo/20 p-4">
                <div className="text-sm text-leo font-medium">Leo</div>
                <div className="text-xl font-bold">
                  {formatPrice(stats.leoValue)}
                </div>
                <div className="text-xs text-muted">
                  {stats.leoCount} card{stats.leoCount !== 1 ? "s" : ""}
                  {stats.leoValue > 0 && (
                    <> · Net {formatPrice(afterEbayFees(stats.leoValue))}</>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Category Value Breakdown */}
          <div className="grid md:grid-cols-2 gap-4 mb-6">
            {/* Sports Cards */}
            {stats.sportsTotal > 0 && (
              <div className="rounded-2xl bg-card-bg border border-card-border p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Sports Cards</h2>
                  <span className="text-lg font-bold text-success">{formatPrice(stats.sportsTotal)}</span>
                </div>
                <div className="space-y-2">
                  {stats.categoryValues
                    .filter((c) => SPORTS_CATS.includes(c.category))
                    .map((c) => (
                      <div key={c.category} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{getCategoryIcon(c.category)}</span>
                          <span className="text-sm">{getCategoryLabel(c.category)}</span>
                          <span className="text-xs text-muted">({c.count})</span>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-medium">{formatPrice(c.value)}</span>
                        </div>
                      </div>
                    ))}
                </div>
                {stats.sportsTotal > 0 && (
                  <div className="text-xs text-muted mt-3 pt-3 border-t border-card-border">
                    Net after fees: {formatPrice(afterEbayFees(stats.sportsTotal))}
                  </div>
                )}
              </div>
            )}

            {/* TCG Cards */}
            {stats.tcgTotal > 0 && (
              <div className="rounded-2xl bg-card-bg border border-card-border p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-muted">TCG Cards</h2>
                  <span className="text-lg font-bold text-success">{formatPrice(stats.tcgTotal)}</span>
                </div>
                <div className="space-y-2">
                  {stats.categoryValues
                    .filter((c) => TCG_CATS.includes(c.category))
                    .map((c) => (
                      <div key={c.category} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{getCategoryIcon(c.category)}</span>
                          <span className="text-sm">{getCategoryLabel(c.category)}</span>
                          <span className="text-xs text-muted">({c.count})</span>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-medium">{formatPrice(c.value)}</span>
                        </div>
                      </div>
                    ))}
                </div>
                {stats.tcgTotal > 0 && (
                  <div className="text-xs text-muted mt-3 pt-3 border-t border-card-border">
                    Net after fees: {formatPrice(afterEbayFees(stats.tcgTotal))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="rounded-xl bg-card-bg border border-card-border p-4">
              <div className="text-xs text-muted">Total Cards</div>
              <div className="text-2xl font-bold">{stats.totalCards}</div>
            </div>
            <div className="rounded-xl bg-card-bg border border-card-border p-4">
              <div className="text-xs text-muted">Most Valuable</div>
              <div className="text-sm font-medium truncate">
                {stats.mostValuable?.card?.name || "—"}
              </div>
              <div className="text-sm text-success">
                {formatPrice(stats.mostValuablePrice)}
              </div>
            </div>
            <div className="rounded-xl bg-card-bg border border-card-border p-4">
              <div className="text-xs text-muted">If Sold Today</div>
              <div className="text-lg font-bold text-foreground">
                {formatPrice(afterEbayFees(stats.totalValue))}
              </div>
              <div className="text-xs text-muted">after 13.25% fees</div>
            </div>
            <div className="rounded-xl bg-card-bg border border-card-border p-4">
              <div className="text-xs text-muted">Value Range</div>
              <div className="text-sm font-medium">
                {formatPrice(stats.totalLow)}
              </div>
              <div className="text-xs text-muted">
                to {formatPrice(stats.totalHigh)}
              </div>
            </div>
          </div>

          {/* Recent Additions */}
          <div className="rounded-2xl bg-card-bg border border-card-border p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Recent Additions</h2>
              <Link
                href="/collection"
                className="text-sm text-accent hover:text-accent-hover"
              >
                View All →
              </Link>
            </div>
            <div className="space-y-3">
              {stats.recentCards.map((item) => {
                const range = getPriceRange(item.prices || []);
                return (
                  <Link
                    href={`/card/${item.id}`}
                    key={item.id}
                    className="flex items-center gap-4 p-3 rounded-xl hover:bg-background/50 transition-colors"
                  >
                    <div className="w-12 h-12 rounded-lg bg-background flex items-center justify-center shrink-0 overflow-hidden">
                      {item.card?.image_url ? (
                        <Image
                          src={item.card.image_url}
                          alt={item.card?.name || ""}
                          width={48}
                          height={48}
                          className="object-contain"
                          unoptimized
                        />
                      ) : (
                        <span className="text-xl">
                          {getCategoryIcon(
                            item.card?.category as CardCategory
                          )}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {item.card?.name}
                      </div>
                      <div className="text-xs text-muted">
                        {item.card?.set_name}
                        {item.condition === "graded" && (
                          <> · {item.grading_company} {item.grade}</>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span
                        className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                          item.owner === "remy"
                            ? "bg-remy/20 text-remy"
                            : "bg-leo/20 text-leo"
                        }`}
                      >
                        {item.owner === "remy" ? "Remy" : "Leo"}
                      </span>
                      <div className="text-sm text-success font-medium mt-1">
                        {formatPrice(range.market)}
                      </div>
                      {range.low && range.high && range.low !== range.high && (
                        <div className="text-xs text-muted">
                          {formatPrice(range.low)} – {formatPrice(range.high)}
                        </div>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
