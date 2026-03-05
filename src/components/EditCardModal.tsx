"use client";

import { useState } from "react";
import type { CollectionItem, Condition, GradingCompany } from "@/lib/types";
import EbayListingPicker from "./EbayListingPicker";

interface EditCardModalProps {
  item: CollectionItem;
  onClose: () => void;
  onSaved: (updated: CollectionItem) => void;
}

const SPORTS_CATEGORIES = ["baseball", "football", "basketball", "hockey"];

export default function EditCardModal({ item, onClose, onSaved }: EditCardModalProps) {
  const [condition, setCondition] = useState<Condition>(item.condition);
  const [gradingCompany, setGradingCompany] = useState<GradingCompany>(
    item.grading_company || "PSA"
  );
  const [grade, setGrade] = useState(String(item.grade || 10));
  const [quantity, setQuantity] = useState(item.quantity);
  const [notes, setNotes] = useState(item.notes || "");
  const [saving, setSaving] = useState(false);

  // Card-level fields
  const [setName, setSetName] = useState(item.card?.set_name || "");
  const [cardNumber, setCardNumber] = useState(item.card?.card_number || "");
  const [year, setYear] = useState(item.card?.year ? String(item.card.year) : "");
  const [rarity, setRarity] = useState(item.card?.rarity || "");
  const [imageUrl, setImageUrl] = useState(item.card?.image_url || "");
  const [showEbayPicker, setShowEbayPicker] = useState(false);

  const isSports = item.card?.category && SPORTS_CATEGORIES.includes(item.card.category);

  const handleSave = async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        condition,
        quantity,
        notes: notes || null,
        // Card-level fields
        set_name: setName || null,
        card_number: cardNumber || null,
        year: year ? parseInt(year) : null,
        rarity: rarity || null,
        image_url: imageUrl || null,
      };
      if (condition === "graded") {
        body.grading_company = gradingCompany;
        body.grade = parseFloat(grade);
      } else {
        body.grading_company = null;
        body.grade = null;
      }

      const res = await fetch(`/api/collection/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to update");
      const data = await res.json();
      onSaved(data.item);
    } catch {
      alert("Failed to save changes.");
    }
    setSaving(false);
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <div className="w-full max-w-md rounded-2xl bg-card-bg border border-card-border p-6 max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold">Edit Card</h2>
            <button onClick={onClose} className="text-muted hover:text-foreground text-xl">
              &times;
            </button>
          </div>

          <div className="space-y-5">
            {/* Card Info */}
            <div className="rounded-xl bg-background border border-card-border p-4 space-y-3">
              <div className="text-sm font-medium text-muted">Card Info</div>
              <div>
                <label className="block text-xs text-muted mb-1">Set Name</label>
                <input
                  type="text"
                  value={setName}
                  onChange={(e) => setSetName(e.target.value)}
                  placeholder="e.g. 2023 Topps Chrome"
                  className="w-full px-3 py-2 rounded-lg bg-card-bg border border-card-border focus:border-accent focus:outline-none text-sm"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-muted mb-1">Year</label>
                  <input
                    type="number"
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    placeholder="2023"
                    className="w-full px-3 py-2 rounded-lg bg-card-bg border border-card-border focus:border-accent focus:outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1">Card #</label>
                  <input
                    type="text"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value)}
                    placeholder="#123"
                    className="w-full px-3 py-2 rounded-lg bg-card-bg border border-card-border focus:border-accent focus:outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1">Rarity</label>
                  <input
                    type="text"
                    value={rarity}
                    onChange={(e) => setRarity(e.target.value)}
                    placeholder="Refractor"
                    className="w-full px-3 py-2 rounded-lg bg-card-bg border border-card-border focus:border-accent focus:outline-none text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Image URL</label>
                <input
                  type="text"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3 py-2 rounded-lg bg-card-bg border border-card-border focus:border-accent focus:outline-none text-sm"
                />
              </div>
              {isSports && (
                <button
                  type="button"
                  onClick={() => setShowEbayPicker(true)}
                  className="w-full py-2 rounded-lg border border-accent text-accent text-sm font-medium hover:bg-accent/10 transition-colors"
                >
                  Find My Card on eBay
                </button>
              )}
            </div>

            {/* Condition */}
            <div>
              <label className="block text-sm text-muted mb-2">Condition</label>
              <div className="flex gap-3">
                <button
                  onClick={() => setCondition("raw")}
                  className={`flex-1 py-3 rounded-lg font-medium text-center transition-colors ${
                    condition === "raw"
                      ? "bg-accent text-white"
                      : "bg-background border border-card-border text-muted hover:text-foreground"
                  }`}
                >
                  Raw
                </button>
                <button
                  onClick={() => setCondition("graded")}
                  className={`flex-1 py-3 rounded-lg font-medium text-center transition-colors ${
                    condition === "graded"
                      ? "bg-accent text-white"
                      : "bg-background border border-card-border text-muted hover:text-foreground"
                  }`}
                >
                  Graded
                </button>
              </div>
            </div>

            {/* Grading */}
            {condition === "graded" && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-muted mb-1">Company</label>
                  <select
                    value={gradingCompany}
                    onChange={(e) => setGradingCompany(e.target.value as GradingCompany)}
                    className="w-full px-4 py-3 rounded-lg bg-background border border-card-border focus:border-accent focus:outline-none"
                  >
                    <option value="PSA">PSA</option>
                    <option value="BGS">BGS</option>
                    <option value="CGC">CGC</option>
                    <option value="SGC">SGC</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-muted mb-1">Grade</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    step="0.5"
                    value={grade}
                    onChange={(e) => setGrade(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg bg-background border border-card-border focus:border-accent focus:outline-none"
                  />
                </div>
              </div>
            )}

            {/* Quantity */}
            <div>
              <label className="block text-sm text-muted mb-1">Quantity</label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="w-10 h-10 rounded-lg bg-background border border-card-border flex items-center justify-center hover:border-accent"
                >
                  −
                </button>
                <span className="text-lg font-medium w-8 text-center">{quantity}</span>
                <button
                  onClick={() => setQuantity(quantity + 1)}
                  className="w-10 h-10 rounded-lg bg-background border border-card-border flex items-center justify-center hover:border-accent"
                >
                  +
                </button>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm text-muted mb-1">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any notes about this card..."
                rows={2}
                className="w-full px-4 py-3 rounded-lg bg-background border border-card-border focus:border-accent focus:outline-none resize-none"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={onClose}
                className="flex-1 py-3 rounded-lg border border-card-border text-muted hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-3 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium transition-colors disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {showEbayPicker && item.card && (
        <EbayListingPicker
          playerName={item.card.name}
          setName={setName || undefined}
          year={year || undefined}
          cardNumber={cardNumber || undefined}
          category={item.card.category}
          onSelect={(listing) => {
            setImageUrl(listing.imageUrl);
            setShowEbayPicker(false);
          }}
          onClose={() => setShowEbayPicker(false)}
        />
      )}
    </>
  );
}
