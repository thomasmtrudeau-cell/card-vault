"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { getCategoryIcon } from "@/lib/categories";
import { formatPrice } from "@/lib/format";
import type { Mover, CardCategory } from "@/lib/types";

const PERIODS = [7, 30, 90] as const;
type Period = (typeof PERIODS)[number];

export default function MoversPanel() {
  const [period, setPeriod] = useState<Period>(7);
  const [gainers, setGainers] = useState<Mover[]>([]);
  const [losers, setLosers] = useState<Mover[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetch(`/api/movers?days=${period}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setGainers(data.gainers || []);
        setLosers(data.losers || []);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [period]);

  const empty = !loading && gainers.length === 0 && losers.length === 0;

  return (
    <div className="rounded-2xl bg-card-bg border border-card-border p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold">Price Movers</h2>
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                period === p
                  ? "bg-accent text-white"
                  : "bg-background text-muted hover:text-foreground"
              }`}
            >
              {p}d
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted text-center py-6">
          Analyzing trends...
        </p>
      ) : empty ? (
        <p className="text-sm text-muted text-center py-6">
          Not enough price history yet
        </p>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          {/* Gainers */}
          <div>
            <h3 className="text-sm font-bold text-success mb-3">Gainers</h3>
            <div className="space-y-2">
              {gainers.length === 0 ? (
                <p className="text-xs text-muted">No gainers this period</p>
              ) : (
                gainers.map((m) => <MoverRow key={m.collectionItemId} mover={m} />)
              )}
            </div>
          </div>

          {/* Losers */}
          <div>
            <h3 className="text-sm font-bold text-danger mb-3">Losers</h3>
            <div className="space-y-2">
              {losers.length === 0 ? (
                <p className="text-xs text-muted">No losers this period</p>
              ) : (
                losers.map((m) => <MoverRow key={m.collectionItemId} mover={m} />)
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MoverRow({ mover }: { mover: Mover }) {
  const isGain = mover.pctChange > 0;

  return (
    <Link
      href={`/card/${mover.collectionItemId}`}
      className="flex items-center gap-3 p-2 rounded-xl hover:bg-background/50 transition-colors"
    >
      <div className="w-10 h-10 rounded-lg bg-background flex items-center justify-center shrink-0 overflow-hidden">
        {mover.imageUrl ? (
          <Image
            src={mover.imageUrl}
            alt={mover.name}
            width={40}
            height={40}
            className="object-contain"
            unoptimized
          />
        ) : (
          <span className="text-base">
            {getCategoryIcon(mover.category as CardCategory)}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{mover.name}</div>
        {mover.setName && (
          <div className="text-xs text-muted truncate">{mover.setName}</div>
        )}
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-medium">{formatPrice(mover.currentPrice)}</div>
        <div
          className={`text-xs font-medium ${
            isGain ? "text-success" : "text-danger"
          }`}
        >
          {isGain ? "\u2191" : "\u2193"} {isGain ? "+" : ""}
          {mover.pctChange.toFixed(1)}%
        </div>
      </div>
    </Link>
  );
}
