"use client";

import { useState, useEffect, use } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { getCategoryLabel, getCategoryIcon } from "@/lib/categories";
import { formatPrice, formatDate, afterEbayFees } from "@/lib/format";
import { getAveragePrice, getPriceRange } from "@/lib/price-fetcher";
import type { CollectionItem, PriceCache, CardCategory } from "@/lib/types";

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
        // Also fetch fresh prices
        if (found.card_id) {
          const priceRes = await fetch(`/api/prices/${found.card_id}`);
          const priceData = await priceRes.json();
          if (priceData.prices) setPrices(priceData.prices);
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
            <Image
              src={card.image_url}
              alt={card.name}
              width={300}
              height={420}
              className="rounded-xl shadow-2xl"
              unoptimized
            />
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
          <div
            className={`inline-block text-xs font-medium px-2 py-1 rounded mb-3 ${
              item.owner === "remy"
                ? "bg-remy/20 text-remy"
                : "bg-leo/20 text-leo"
            }`}
          >
            {item.owner === "remy" ? "Remy" : "Leo"}&apos;s Card
          </div>

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
  );
}
