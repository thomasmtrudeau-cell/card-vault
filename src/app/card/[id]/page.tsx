"use client";

import { useState, useEffect, use } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { getCategoryLabel, getCategoryIcon } from "@/lib/categories";
import { formatPrice, formatDate, afterEbayFees } from "@/lib/format";
import { getPriceRange } from "@/lib/price-fetcher";
import type { CollectionItem, PriceCache, CardCategory, PriceHistoryEntry } from "@/lib/types";
import EditCardModal from "@/components/EditCardModal";
import ImageLightbox from "@/components/ImageLightbox";

function PriceSparkline({ history, current }: { history: PriceHistoryEntry[]; current: PriceCache[] }) {
  // Combine history + current into time series of market prices
  const points: { time: number; price: number }[] = [];

  for (const h of history) {
    if (h.price_usd && (h.condition_key === "market" || h.condition_key === "normal_market" || h.condition_key === "holofoil_market")) {
      points.push({ time: new Date(h.recorded_at).getTime(), price: h.price_usd });
    }
  }

  // Add current prices
  for (const c of current) {
    if (c.price_usd && (c.condition_key === "market" || c.condition_key === "normal_market" || c.condition_key === "holofoil_market")) {
      points.push({ time: new Date(c.fetched_at).getTime(), price: c.price_usd });
    }
  }

  // Sort by time and deduplicate by day
  points.sort((a, b) => a.time - b.time);
  const daily: { time: number; price: number }[] = [];
  for (const p of points) {
    const day = Math.floor(p.time / 86400000);
    const last = daily.length > 0 ? Math.floor(daily[daily.length - 1].time / 86400000) : -1;
    if (day !== last) {
      daily.push(p);
    } else {
      daily[daily.length - 1] = p;
    }
  }

  if (daily.length < 2) return null;

  const prices = daily.map((d) => d.price);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const range = maxP - minP || 1;

  const width = 200;
  const height = 40;
  const padding = 2;

  const polyPoints = daily
    .map((d, i) => {
      const x = padding + (i / (daily.length - 1)) * (width - 2 * padding);
      const y = height - padding - ((d.price - minP) / range) * (height - 2 * padding);
      return `${x},${y}`;
    })
    .join(" ");

  const firstPrice = prices[0];
  const lastPrice = prices[prices.length - 1];
  const pctChange = ((lastPrice - firstPrice) / firstPrice) * 100;
  const isUp = pctChange >= 0;

  return (
    <div className="rounded-xl bg-card-bg border border-card-border p-4 mb-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium">90-Day Trend</h3>
        <span className={`text-sm font-medium ${isUp ? "text-success" : "text-danger"}`}>
          {isUp ? "+" : ""}{pctChange.toFixed(1)}%
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ height: 40 }}
      >
        <polyline
          points={polyPoints}
          fill="none"
          stroke={isUp ? "var(--success)" : "var(--danger)"}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="flex justify-between text-xs text-muted mt-1">
        <span>{formatPrice(firstPrice)}</span>
        <span>{formatPrice(lastPrice)}</span>
      </div>
    </div>
  );
}

export default function CardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [item, setItem] = useState<CollectionItem | null>(null);
  const [prices, setPrices] = useState<PriceCache[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);
  const [priceHistory, setPriceHistory] = useState<PriceHistoryEntry[]>([]);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/collection");
      const data = await res.json();
      const found = (data.items || []).find(
        (i: CollectionItem) => i.id === id
      );
      if (found) {
        setItem(found);
        setPrices(found.prices || []);
        // Fetch fresh prices
        if (found.card_id) {
          const priceRes = await fetch(`/api/prices/${found.card_id}`);
          const priceData = await priceRes.json();
          if (priceData.prices) setPrices(priceData.prices);

          // Fetch price history
          const histRes = await fetch(`/api/price-history/${found.card_id}?days=90`);
          const histData = await histRes.json();
          if (histData.history) setPriceHistory(histData.history);
        }
      }
      setLoading(false);
    }
    load();
  }, [id]);

  const refreshPrices = async () => {
    if (!item?.card_id) return;
    setRefreshing(true);
    try {
      const res = await fetch("/api/prices/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: item.card_id }),
      });
      const data = await res.json();
      if (data.prices) setPrices(data.prices);
    } catch {
      // ignore
    }
    setRefreshing(false);
  };

  const handleDelete = async () => {
    if (!confirm("Remove this card from the collection?")) return;
    setDeleting(true);
    try {
      await fetch(`/api/collection/${id}`, { method: "DELETE" });
      router.push("/collection");
    } catch {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-muted">Loading card details...</div>
    );
  }

  if (!item || !item.card) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-lg font-medium">Card not found</h2>
        <button
          onClick={() => router.push("/collection")}
          className="mt-4 text-accent hover:underline"
        >
          Back to Collection
        </button>
      </div>
    );
  }

  const card = item.card;
  const range = getPriceRange(prices);
  const avgPrice = range.market;

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-8">
      <button
        onClick={() => router.push("/collection")}
        className="text-sm text-muted hover:text-foreground mb-6 inline-block"
      >
        ← Back to Collection
      </button>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Card Image */}
        <div className="flex justify-center">
          {card.image_url ? (
            <button onClick={() => setShowLightbox(true)} className="cursor-zoom-in">
              <Image
                src={card.image_url}
                alt={card.name}
                width={300}
                height={420}
                className="rounded-xl shadow-2xl hover:scale-[1.02] transition-transform"
                unoptimized
              />
            </button>
          ) : (
            <div className="w-[300px] h-[420px] rounded-xl bg-card-bg border border-card-border flex items-center justify-center">
              <span className="text-6xl">
                {getCategoryIcon(card.category as CardCategory)}
              </span>
            </div>
          )}
        </div>

        {/* Details */}
        <div>
          <h1 className="text-2xl font-bold mb-1">{card.name}</h1>
          {card.set_name && (
            <p className="text-muted mb-4">{card.set_name}</p>
          )}

          {/* Estimated Value with Range */}
          <div className="rounded-xl bg-card-bg border border-card-border p-4 mb-4">
            <div className="text-sm text-muted">Estimated Value</div>
            <div className="text-3xl font-bold text-success">
              {formatPrice(avgPrice)}
            </div>
            {range.low && range.high && range.low !== range.high && (
              <div className="text-sm text-muted mt-1">
                Range: {formatPrice(range.low)} – {formatPrice(range.high)}
              </div>
            )}
            {avgPrice && avgPrice > 0 && (
              <div className="mt-3 pt-3 border-t border-card-border">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted">If sold on eBay</span>
                  <span className="font-medium">{formatPrice(afterEbayFees(avgPrice))}</span>
                </div>
                <div className="text-xs text-muted text-right">after 13.25% seller fees</div>
              </div>
            )}
          </div>

          {/* Price History Sparkline */}
          <PriceSparkline history={priceHistory} current={prices} />

          {/* Metadata grid */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="rounded-lg bg-card-bg border border-card-border p-3">
              <div className="text-xs text-muted">Category</div>
              <div className="text-sm font-medium">
                {getCategoryLabel(card.category as CardCategory)}
              </div>
            </div>
            {card.card_number && (
              <div className="rounded-lg bg-card-bg border border-card-border p-3">
                <div className="text-xs text-muted">Card #</div>
                <div className="text-sm font-medium">{card.card_number}</div>
              </div>
            )}
            {card.year && (
              <div className="rounded-lg bg-card-bg border border-card-border p-3">
                <div className="text-xs text-muted">Year</div>
                <div className="text-sm font-medium">{card.year}</div>
              </div>
            )}
            {card.rarity && (
              <div className="rounded-lg bg-card-bg border border-card-border p-3">
                <div className="text-xs text-muted">Rarity</div>
                <div className="text-sm font-medium">{card.rarity}</div>
              </div>
            )}
            <div className="rounded-lg bg-card-bg border border-card-border p-3">
              <div className="text-xs text-muted">Condition</div>
              <div className="text-sm font-medium">
                {item.condition === "graded"
                  ? `${item.grading_company} ${item.grade}`
                  : "Raw"}
              </div>
            </div>
            <div className="rounded-lg bg-card-bg border border-card-border p-3">
              <div className="text-xs text-muted">Quantity</div>
              <div className="text-sm font-medium">{item.quantity}</div>
            </div>
          </div>

          {item.notes && (
            <div className="rounded-lg bg-card-bg border border-card-border p-3 mb-4">
              <div className="text-xs text-muted mb-1">Notes</div>
              <div className="text-sm">{item.notes}</div>
            </div>
          )}

          <div className="text-xs text-muted mb-4">
            Added {formatDate(item.date_added)}
          </div>

          {/* Price Breakdown */}
          {prices.length > 0 && (
            <div className="rounded-xl bg-card-bg border border-card-border p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium">Price Sources</h3>
                <button
                  onClick={refreshPrices}
                  disabled={refreshing}
                  className="text-xs text-accent hover:text-accent-hover disabled:opacity-50"
                >
                  {refreshing ? "Refreshing..." : "Refresh Prices"}
                </button>
              </div>
              <div className="space-y-2">
                {prices.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-muted capitalize">
                      {p.source}
                      {p.condition_key && (
                        <span className="text-xs ml-1">({p.condition_key})</span>
                      )}
                    </span>
                    <span className="font-medium">
                      {formatPrice(p.price_usd)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowEdit(true)}
              className="text-sm text-accent hover:text-accent-hover"
            >
              Edit Card
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="text-sm text-danger hover:text-danger/80 disabled:opacity-50"
            >
              {deleting ? "Removing..." : "Remove from Collection"}
            </button>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showEdit && (
        <EditCardModal
          item={item}
          onClose={() => setShowEdit(false)}
          onSaved={(updated) => {
            setItem(updated);
            setShowEdit(false);
          }}
        />
      )}

      {showLightbox && card.image_url && (
        <ImageLightbox
          src={card.image_url}
          alt={card.name}
          onClose={() => setShowLightbox(false)}
        />
      )}
    </div>
  );
}
