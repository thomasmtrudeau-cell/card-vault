"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { CATEGORIES } from "@/lib/categories";
import { getCategoryIcon } from "@/lib/categories";
import { formatPrice } from "@/lib/format";
import type { WishlistItem, CardCategory } from "@/lib/types";

export default function WishlistPage() {
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  // Add form state
  const [addCategory, setAddCategory] = useState<string>("baseball");
  const [addName, setAddName] = useState("");
  const [addSetName, setAddSetName] = useState("");
  const [addYear, setAddYear] = useState("");
  const [addTargetPrice, setAddTargetPrice] = useState("");
  const [addNotes, setAddNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/wishlist");
    const data = await res.json();
    setItems(data.items || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleAdd = async () => {
    if (!addName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/wishlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner: "remy",
          category: addCategory,
          name: addName.trim(),
          set_name: addSetName || null,
          year: addYear ? parseInt(addYear) : null,
          target_price: addTargetPrice ? parseFloat(addTargetPrice) : null,
          notes: addNotes || null,
        }),
      });
      if (res.ok) {
        setAddName("");
        setAddSetName("");
        setAddYear("");
        setAddTargetPrice("");
        setAddNotes("");
        setShowAdd(false);
        fetchItems();
      }
    } catch {
      alert("Failed to add wishlist item.");
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove from wishlist?")) return;
    await fetch(`/api/wishlist/${id}`, { method: "DELETE" });
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Wishlist</h1>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors"
        >
          {showAdd ? "Cancel" : "+ Add Item"}
        </button>
      </div>

      {/* Add Form */}
      {showAdd && (
        <div className="rounded-2xl bg-card-bg border border-card-border p-5 mb-6 space-y-4">
          <h2 className="text-lg font-bold">Add to Wishlist</h2>
          <div>
            <div>
              <label className="block text-sm text-muted mb-1">Category</label>
              <select
                value={addCategory}
                onChange={(e) => setAddCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-background border border-card-border text-sm focus:outline-none focus:border-accent"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm text-muted mb-1">Card Name *</label>
            <input
              type="text"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              placeholder="e.g. Charizard VMAX"
              className="w-full px-3 py-2 rounded-lg bg-background border border-card-border text-sm focus:outline-none focus:border-accent"
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-muted mb-1">Set Name</label>
              <input
                type="text"
                value={addSetName}
                onChange={(e) => setAddSetName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-background border border-card-border text-sm focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Year</label>
              <input
                type="number"
                value={addYear}
                onChange={(e) => setAddYear(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-background border border-card-border text-sm focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Target Price</label>
              <input
                type="number"
                step="0.01"
                value={addTargetPrice}
                onChange={(e) => setAddTargetPrice(e.target.value)}
                placeholder="$0.00"
                className="w-full px-3 py-2 rounded-lg bg-background border border-card-border text-sm focus:outline-none focus:border-accent"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm text-muted mb-1">Notes</label>
            <input
              type="text"
              value={addNotes}
              onChange={(e) => setAddNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-background border border-card-border text-sm focus:outline-none focus:border-accent"
            />
          </div>
          <button
            onClick={handleAdd}
            disabled={saving || !addName.trim()}
            className="w-full py-3 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium transition-colors disabled:opacity-50"
          >
            {saving ? "Adding..." : "Add to Wishlist"}
          </button>
        </div>
      )}

      {/* Items */}
      {loading ? (
        <div className="text-center py-16 text-muted">Loading wishlist...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">⭐</div>
          <h2 className="text-lg font-medium mb-2">Wishlist is empty</h2>
          <p className="text-muted mb-4">
            Add cards you&apos;re looking for!
          </p>
          <button
            onClick={() => setShowAdd(true)}
            className="inline-block px-6 py-3 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium transition-colors"
          >
            Add First Item
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => (
            <div
              key={item.id}
              className="rounded-xl bg-card-bg border border-card-border p-4"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-background flex items-center justify-center shrink-0 overflow-hidden">
                  {item.image_url ? (
                    <Image
                      src={item.image_url}
                      alt={item.name}
                      width={40}
                      height={40}
                      className="object-contain"
                      unoptimized
                    />
                  ) : (
                    <span className="text-xl">
                      {getCategoryIcon(item.category as CardCategory)}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{item.name}</div>
                  {item.set_name && (
                    <div className="text-xs text-muted truncate">{item.set_name}</div>
                  )}
                  {item.target_price && (
                    <div className="text-xs text-success mt-1">
                      Target: {formatPrice(item.target_price)}
                    </div>
                  )}
                  {item.notes && (
                    <div className="text-xs text-muted mt-1">{item.notes}</div>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(item.id)}
                  className="text-muted hover:text-danger text-sm shrink-0"
                  title="Remove"
                >
                  &times;
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
