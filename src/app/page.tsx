"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { getCategoryIcon, getCategoryLabel } from "@/lib/categories";
import { formatPrice, formatDate } from "@/lib/format";
import { getAveragePrice } from "@/lib/price-fetcher";
import type { CollectionItem, CardCategory } from "@/lib/types";

interface Stats {
  totalCards: number;
  totalValue: number;
  remyValue: number;
  leoValue: number;
  remyCount: number;
  leoCount: number;
  mostValuable: CollectionItem | null;
  mostValuablePrice: number;
  categoryBreakdown: Record<string, number>;
  recentCards: CollectionItem[];
}

function computeStats(items: CollectionItem[]): Stats {
  let totalValue = 0;
  let remyValue = 0;
  let leoValue = 0;
  let remyCount = 0;
  let leoCount = 0;
  let mostValuable: CollectionItem | null = null;
  let mostValuablePrice = 0;
  const categoryBreakdown: Record<string, number> = {};

  for (const item of items) {
    const qty = item.quantity || 1;
    const price = getAveragePrice(item.prices || []) || 0;
    const itemValue = price * qty;
    totalValue += itemValue;

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

    const cat = item.card?.category || "unknown";
    categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + qty;
  }

  const recentCards = [...items]
    .sort(
      (a, b) =>
        new Date(b.date_added).getTime() - new Date(a.date_added).getTime()
    )
    .slice(0, 5);

  return {
    totalCards: items.reduce((sum, i) => sum + (i.quantity || 1), 0),
    totalValue,
    remyValue,
    leoValue,
    remyCount,
    leoCount,
    mostValuable,
    mostValuablePrice,
    categoryBreakdown,
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
          {/* Total Value */}
          <div className="rounded-2xl bg-card-bg border border-card-border p-6 mb-6">
            <div className="text-sm text-muted mb-1">Total Collection Value</div>
            <div className="text-4xl font-bold text-success mb-4">
              {formatPrice(stats.totalValue)}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl bg-remy/10 border border-remy/20 p-4">
                <div className="text-sm text-remy font-medium">Remy</div>
                <div className="text-xl font-bold">
                  {formatPrice(stats.remyValue)}
                </div>
                <div className="text-xs text-muted">
                  {stats.remyCount} card{stats.remyCount !== 1 ? "s" : ""}
                </div>
              </div>
              <div className="rounded-xl bg-leo/10 border border-leo/20 p-4">
                <div className="text-sm text-leo font-medium">Leo</div>
                <div className="text-xl font-bold">
                  {formatPrice(stats.leoValue)}
                </div>
                <div className="text-xs text-muted">
                  {stats.leoCount} card{stats.leoCount !== 1 ? "s" : ""}
                </div>
              </div>
            </div>
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
            {Object.entries(stats.categoryBreakdown)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 2)
              .map(([cat, count]) => (
                <div
                  key={cat}
                  className="rounded-xl bg-card-bg border border-card-border p-4"
                >
                  <div className="text-xs text-muted">
                    {getCategoryIcon(cat as CardCategory)}{" "}
                    {getCategoryLabel(cat as CardCategory)}
                  </div>
                  <div className="text-2xl font-bold">{count}</div>
                </div>
              ))}
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
                const price = getAveragePrice(item.prices || []);
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
                        {item.card?.set_name} · {formatDate(item.date_added)}
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
                        {formatPrice(price)}
                      </div>
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
