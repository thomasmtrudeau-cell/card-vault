"use client";

import { useState, useEffect, use } from "react";
import Image from "next/image";
import { getCategoryIcon } from "@/lib/categories";
import { formatPrice } from "@/lib/format";
import { getPriceRange } from "@/lib/price-fetcher";
import type { CollectionItem, CardCategory } from "@/lib/types";

export default function SharedCollectionPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ownerFilter, setOwnerFilter] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/share/${token}`);
        if (!res.ok) {
          const data = await res.json();
          setError(data.error || "Failed to load collection");
          setLoading(false);
          return;
        }
        const data = await res.json();
        setItems(data.items || []);
        setOwnerFilter(data.owner_filter || null);
      } catch {
        setError("Failed to load collection");
      }
      setLoading(false);
    }
    load();
  }, [token]);

  if (loading) {
    return (
      <div className="p-8 text-center text-muted">Loading collection...</div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <div className="text-4xl mb-4">🔗</div>
        <h2 className="text-lg font-medium mb-2">{error}</h2>
        <p className="text-muted">This share link may have expired or been removed.</p>
      </div>
    );
  }

  const totalValue = items.reduce((sum, item) => {
    const range = getPriceRange(item.prices || []);
    return sum + (range.market || 0) * (item.quantity || 1);
  }, 0);

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-2xl">🃏</span>
          <h1 className="text-2xl font-bold">Card Vault</h1>
        </div>
        <p className="text-muted text-sm">
          {ownerFilter
            ? `${ownerFilter === "remy" ? "Remy" : "Leo"}'s Collection`
            : "Shared Collection"}
          {" · "}
          {items.length} card{items.length !== 1 ? "s" : ""}
          {totalValue > 0 && ` · ${formatPrice(totalValue)}`}
        </p>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">📦</div>
          <h2 className="text-lg font-medium">No cards in this collection</h2>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {items.map((item) => {
            const range = getPriceRange(item.prices || []);
            return (
              <div
                key={item.id}
                className="rounded-xl bg-card-bg border border-card-border overflow-hidden"
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
                      {getCategoryIcon(item.card?.category as CardCategory)}
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
                    <div className="text-xs text-success font-medium">
                      {formatPrice(range.market)}
                    </div>
                  </div>
                  {item.condition === "graded" && (
                    <div className="text-xs text-muted mt-1">
                      {item.grading_company} {item.grade}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="text-center text-xs text-muted mt-8 pt-4 border-t border-card-border">
        Shared via Card Vault
      </div>
    </div>
  );
}
