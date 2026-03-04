"use client";

import { useState } from "react";
import type { CollectionItem, Condition, GradingCompany } from "@/lib/types";

interface EditCardModalProps {
  item: CollectionItem;
  onClose: () => void;
  onSaved: (updated: CollectionItem) => void;
}

export default function EditCardModal({ item, onClose, onSaved }: EditCardModalProps) {
  const [condition, setCondition] = useState<Condition>(item.condition);
  const [gradingCompany, setGradingCompany] = useState<GradingCompany>(
    item.grading_company || "PSA"
  );
  const [grade, setGrade] = useState(String(item.grade || 10));
  const [quantity, setQuantity] = useState(item.quantity);
  const [notes, setNotes] = useState(item.notes || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        condition,
        quantity,
        notes: notes || null,
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
  );
}
