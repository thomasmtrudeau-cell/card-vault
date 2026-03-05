"use client";

import { useState, useEffect } from "react";
import Image from "next/image";

export interface EbayListing {
  title: string;
  imageUrl: string;
  price: number | null;
  itemWebUrl: string;
}

interface EbayListingPickerProps {
  playerName: string;
  setName?: string;
  year?: string;
  cardNumber?: string;
  category: string;
  onSelect: (listing: EbayListing) => void;
  onClose: () => void;
}

export default function EbayListingPicker({
  playerName,
  setName,
  year,
  cardNumber,
  category,
  onSelect,
  onClose,
}: EbayListingPickerProps) {
  const [listings, setListings] = useState<EbayListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const search = async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/ebay/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerName,
          setName: setName || null,
          year: year || null,
          cardNumber: cardNumber || null,
          category,
        }),
      });
      const data = await res.json();
      setListings(data.listings || []);
    } catch {
      setError(true);
    }
    setLoading(false);
  };

  useEffect(() => {
    search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-2xl rounded-2xl bg-card-bg border border-card-border p-5 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Find My Card on eBay</h2>
          <button
            onClick={onClose}
            className="text-muted hover:text-foreground text-xl"
          >
            &times;
          </button>
        </div>

        <p className="text-sm text-muted mb-4">
          Tap a listing to use its image for your card.
        </p>

        {loading && (
          <div className="flex-1 flex items-center justify-center py-12">
            <div className="text-muted">Searching eBay...</div>
          </div>
        )}

        {!loading && error && (
          <div className="flex-1 flex flex-col items-center justify-center py-12 gap-3">
            <div className="text-muted">Failed to search eBay.</div>
            <button
              onClick={search}
              className="px-4 py-2 rounded-lg bg-accent text-white text-sm"
            >
              Try Again
            </button>
          </div>
        )}

        {!loading && !error && listings.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center py-12 gap-3">
            <div className="text-muted">No listings found.</div>
            <button
              onClick={search}
              className="px-4 py-2 rounded-lg bg-accent text-white text-sm"
            >
              Search Again
            </button>
          </div>
        )}

        {!loading && !error && listings.length > 0 && (
          <>
            <div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-3">
              {listings.map((listing, i) => (
                <button
                  key={i}
                  onClick={() => onSelect(listing)}
                  className="flex flex-col items-center p-3 rounded-xl bg-background border border-card-border hover:border-accent transition-colors text-center"
                >
                  <Image
                    src={listing.imageUrl}
                    alt={listing.title}
                    width={120}
                    height={168}
                    className="rounded-lg mb-2 object-contain"
                    unoptimized
                  />
                  <div className="text-xs leading-tight line-clamp-2">
                    {listing.title}
                  </div>
                  {listing.price != null && (
                    <div className="mt-1 text-xs">
                      <span className="text-muted line-through">
                        ${listing.price.toFixed(2)}
                      </span>{" "}
                      <span className="text-success font-semibold">
                        ${(listing.price * 0.85).toFixed(2)}
                      </span>
                    </div>
                  )}
                </button>
              ))}
            </div>
            <button
              onClick={search}
              className="mt-4 w-full py-2 rounded-lg border border-card-border text-sm text-muted hover:text-foreground transition-colors"
            >
              Search Again
            </button>
          </>
        )}
      </div>
    </div>
  );
}
