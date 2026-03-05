"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { CATEGORIES } from "@/lib/categories";
import { formatPrice } from "@/lib/format";
import { getAveragePrice } from "@/lib/price-fetcher";
import EbayListingPicker from "@/components/EbayListingPicker";
import type {
  CardCategory,
  SearchResult,
  Condition,
  GradingCompany,
} from "@/lib/types";

type Step = "category" | "search" | "details" | "confirm";

interface BulkQueueItem {
  searchResult: SearchResult;
  quantity: number;
}

export default function AddCardPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("category");
  const [category, setCategory] = useState<CardCategory | null>(null);
  const [selectedCard, setSelectedCard] = useState<SearchResult | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const owner = "remy"; // shared collection, owner hidden from UI
  const [condition, setCondition] = useState<Condition>("raw");
  const [gradingCompany, setGradingCompany] = useState<GradingCompany>("PSA");
  const [grade, setGrade] = useState<string>("10");
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [estimatingPrice, setEstimatingPrice] = useState(false);
  const [sportsEstimate, setSportsEstimate] = useState<number | null>(null);

  // Duplicate detection
  const [duplicateNotice, setDuplicateNotice] = useState<{
    count: number;
    owners: string[];
  } | null>(null);

  // Bulk add mode
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkQueue, setBulkQueue] = useState<BulkQueueItem[]>([]);
  const [bulkSaving, setBulkSaving] = useState(false);

  // Manual/sports entry fields
  const [manualName, setManualName] = useState("");
  const [manualSet, setManualSet] = useState("");
  const [manualNumber, setManualNumber] = useState("");
  const [manualYear, setManualYear] = useState("");
  const [manualRarity, setManualRarity] = useState("");
  const [manualVariant, setManualVariant] = useState("");
  const [showEbayPicker, setShowEbayPicker] = useState(false);

  const isSportsCategory =
    category &&
    ["baseball", "football", "basketball", "hockey"].includes(category);

  const isTCGCategory =
    category &&
    ["pokemon", "magic", "yugioh"].includes(category);

  const isSearchable =
    category &&
    CATEGORIES.find((c) => c.value === category)?.searchable === true;

  const doSearch = useCallback(async () => {
    if (!category || !searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(
        `/api/search?category=${category}&q=${encodeURIComponent(searchQuery.trim())}`
      );
      const data = await res.json();
      setSearchResults(data.results || []);
    } catch {
      setSearchResults([]);
    }
    setSearching(false);
  }, [category, searchQuery]);

  const checkDuplicate = async (result: SearchResult) => {
    try {
      const params = new URLSearchParams();
      if (result.external_id && result.external_source) {
        params.set("external_id", result.external_id);
        params.set("external_source", result.external_source);
      } else {
        params.set("name", result.name);
        params.set("category", result.category);
      }
      const res = await fetch(`/api/collection/check-duplicate?${params}`);
      const data = await res.json();
      if (data.exists) {
        setDuplicateNotice({ count: data.count, owners: data.owners });
      } else {
        setDuplicateNotice(null);
      }
    } catch {
      setDuplicateNotice(null);
    }
  };

  const handleSelectCard = async (result: SearchResult) => {
    setSelectedCard(result);
    setDuplicateNotice(null);

    if (bulkMode) {
      // In bulk mode, add to queue immediately
      setBulkQueue((prev) => [
        ...prev,
        { searchResult: result, quantity: 1 },
      ]);
      return;
    }

    // Check for duplicates
    checkDuplicate(result);
    setStep("details");
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        owner,
        condition,
        quantity,
        notes: notes || null,
      };
      if (condition === "graded") {
        body.grading_company = gradingCompany;
        body.grade = parseFloat(grade);
      }
      if (selectedCard) {
        const enrichedResult = { ...selectedCard };
        if (manualSet) enrichedResult.set_name = manualSet;
        if (manualNumber) enrichedResult.card_number = manualNumber;
        if (manualYear) enrichedResult.year = parseInt(manualYear);
        if (manualRarity) enrichedResult.rarity = manualRarity;
        body.searchResult = enrichedResult;
      } else {
        body.manualCard = {
          name: manualName,
          category,
          set_name: manualSet || null,
          card_number: manualNumber || null,
          year: manualYear ? parseInt(manualYear) : null,
          rarity: manualRarity || null,
        };
      }

      const res = await fetch("/api/collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to save");
      router.push("/collection");
    } catch {
      alert("Failed to save card. Please try again.");
    }
    setSaving(false);
  };

  const handleBulkSave = async () => {
    setBulkSaving(true);
    try {
      for (const item of bulkQueue) {
        await fetch("/api/collection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            searchResult: item.searchResult,
            owner: "remy",
            condition: "raw",
            quantity: item.quantity,
            notes: null,
          }),
        });
      }
      router.push("/collection");
    } catch {
      alert("Some cards may not have been saved.");
    }
    setBulkSaving(false);
  };

  const estimatedValue =
    sportsEstimate ??
    (selectedCard?.prices
      ? getAveragePrice(
          selectedCard.prices.map((p) => ({
            id: "",
            card_id: "",
            fetched_at: "",
            source: p.source,
            price_usd: p.price_usd,
            condition_key: p.condition_key,
          }))
        )
      : null);

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-8">
      {/* Progress */}
      <div className="flex items-center gap-2 mb-8">
        {(["category", "search", "details", "confirm"] as Step[]).map(
          (s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  step === s
                    ? "bg-accent text-white"
                    : (["category", "search", "details", "confirm"] as Step[]).indexOf(step) > i
                      ? "bg-accent/30 text-accent"
                      : "bg-card-border text-muted"
                }`}
              >
                {i + 1}
              </div>
              {i < 3 && (
                <div
                  className={`w-8 h-0.5 ${(["category", "search", "details", "confirm"] as Step[]).indexOf(step) > i ? "bg-accent/30" : "bg-card-border"}`}
                />
              )}
            </div>
          )
        )}
      </div>

      {/* Step 1: Category */}
      {step === "category" && (
        <div>
          <h1 className="text-2xl font-bold mb-6">Choose Category</h1>

          {/* Bulk mode toggle */}
          <div className="flex items-center gap-3 mb-6 p-3 rounded-xl bg-card-bg border border-card-border">
            <button
              onClick={() => setBulkMode(!bulkMode)}
              className={`relative w-10 h-6 rounded-full transition-colors ${
                bulkMode ? "bg-accent" : "bg-card-border"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                  bulkMode ? "translate-x-4" : ""
                }`}
              />
            </button>
            <div>
              <div className="text-sm font-medium">Bulk Mode</div>
              <div className="text-xs text-muted">Add multiple cards at once</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                onClick={() => {
                  setCategory(cat.value);
                  setStep("search");
                  setSearchResults([]);
                  setSelectedCard(null);
                  setSearchQuery("");
                  setDuplicateNotice(null);
                  setBulkQueue([]);
                }}
                className="flex items-center gap-3 p-4 rounded-xl bg-card-bg border border-card-border hover:border-accent transition-colors text-left"
              >
                <span className="text-2xl">{cat.icon}</span>
                <div>
                  <div className="font-medium">{cat.label}</div>
                  <div className="text-xs text-muted">
                    {cat.searchable ? "Search API" : "Manual entry"}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: Search / Manual Entry */}
      {step === "search" && (
        <div>
          <button
            onClick={() => setStep("category")}
            className="text-sm text-muted hover:text-foreground mb-4 inline-block"
          >
            ← Back
          </button>
          <h1 className="text-2xl font-bold mb-6">
            {isSearchable ? "Search Cards" : "Enter Card Details"}
            {bulkMode && (
              <span className="text-sm font-normal text-accent ml-2">Bulk Mode</span>
            )}
          </h1>

          {/* Bulk queue display */}
          {bulkMode && bulkQueue.length > 0 && (
            <div className="rounded-xl bg-card-bg border border-card-border p-4 mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium">
                  Queue ({bulkQueue.length} card{bulkQueue.length !== 1 ? "s" : ""})
                </h3>
                <button
                  onClick={() => setStep("confirm")}
                  className="text-sm text-accent hover:text-accent-hover font-medium"
                >
                  Review & Save →
                </button>
              </div>
              <div className="space-y-2">
                {bulkQueue.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="truncate">{item.searchResult.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            const updated = [...bulkQueue];
                            updated[idx].quantity = Math.max(1, updated[idx].quantity - 1);
                            setBulkQueue(updated);
                          }}
                          className="w-6 h-6 rounded bg-background border border-card-border flex items-center justify-center text-xs"
                        >
                          −
                        </button>
                        <span className="w-4 text-center text-xs">{item.quantity}</span>
                        <button
                          onClick={() => {
                            const updated = [...bulkQueue];
                            updated[idx].quantity++;
                            setBulkQueue(updated);
                          }}
                          className="w-6 h-6 rounded bg-background border border-card-border flex items-center justify-center text-xs"
                        >
                          +
                        </button>
                      </div>
                      <button
                        onClick={() => setBulkQueue(bulkQueue.filter((_, i) => i !== idx))}
                        className="text-muted hover:text-danger text-xs"
                      >
                        &times;
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isSearchable ? (
            <>
              <div className="flex gap-2 mb-6">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && doSearch()}
                  placeholder={`Search ${CATEGORIES.find((c) => c.value === category)?.label} cards...`}
                  className="flex-1 px-4 py-3 rounded-lg bg-card-bg border border-card-border focus:border-accent focus:outline-none"
                />
                <button
                  onClick={doSearch}
                  disabled={searching || !searchQuery.trim()}
                  className="px-6 py-3 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium disabled:opacity-50 transition-colors"
                >
                  {searching ? "..." : "Search"}
                </button>
              </div>

              {searchResults.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[60vh] overflow-y-auto">
                  {searchResults.map((result) => (
                    <button
                      key={result.external_id}
                      onClick={() => handleSelectCard(result)}
                      className="flex flex-col items-center p-3 rounded-xl bg-card-bg border border-card-border hover:border-accent transition-colors text-center"
                    >
                      {result.image_url && (
                        <Image
                          src={result.image_url}
                          alt={result.name}
                          width={120}
                          height={168}
                          className="rounded-lg mb-2 object-contain"
                          unoptimized
                        />
                      )}
                      <div className="text-sm font-medium leading-tight">
                        {result.name}
                        {result.card_number && (
                          <span className="text-muted font-normal"> #{result.card_number}</span>
                        )}
                      </div>
                      <div className="text-xs text-muted mt-1">
                        {result.set_name}
                      </div>
                      {result.prices && result.prices.length > 0 && (
                        <div className="text-xs text-success mt-1">
                          {formatPrice(result.prices[0].price_usd)}
                        </div>
                      )}
                      {bulkMode && (
                        <div className="text-xs text-accent mt-1">+ Add to queue</div>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {searchResults.length === 0 && !searching && searchQuery && (
                <p className="text-muted text-center py-8">
                  No results found. Try a different search.
                </p>
              )}
            </>
          ) : (
            /* Manual entry for sports cards */
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-muted mb-1">
                  Player/Card Name *
                </label>
                <input
                  type="text"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder="e.g. Mike Trout"
                  className="w-full px-4 py-3 rounded-lg bg-card-bg border border-card-border focus:border-accent focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm text-muted mb-1">
                  Set Name
                </label>
                <input
                  type="text"
                  value={manualSet}
                  onChange={(e) => setManualSet(e.target.value)}
                  placeholder="e.g. 2023 Topps Chrome"
                  className="w-full px-4 py-3 rounded-lg bg-card-bg border border-card-border focus:border-accent focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-muted mb-1">
                    Card Number
                  </label>
                  <input
                    type="text"
                    value={manualNumber}
                    onChange={(e) => setManualNumber(e.target.value)}
                    placeholder="#123"
                    className="w-full px-4 py-3 rounded-lg bg-card-bg border border-card-border focus:border-accent focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm text-muted mb-1">Year</label>
                  <input
                    type="number"
                    value={manualYear}
                    onChange={(e) => setManualYear(e.target.value)}
                    placeholder="2023"
                    className="w-full px-4 py-3 rounded-lg bg-card-bg border border-card-border focus:border-accent focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-muted mb-1">
                  Rarity / Parallel
                </label>
                <input
                  type="text"
                  value={manualRarity}
                  onChange={(e) => setManualRarity(e.target.value)}
                  placeholder="e.g. Refractor, Base"
                  className="w-full px-4 py-3 rounded-lg bg-card-bg border border-card-border focus:border-accent focus:outline-none"
                />
              </div>
              <button
                onClick={async () => {
                  if (!manualName.trim()) return;
                  setSelectedCard(null);
                  setDuplicateNotice(null);
                  // Check for manual card duplicates
                  if (category) {
                    try {
                      const params = new URLSearchParams({
                        name: manualName.trim(),
                        category,
                      });
                      const res = await fetch(`/api/collection/check-duplicate?${params}`);
                      const data = await res.json();
                      if (data.exists) {
                        setDuplicateNotice({ count: data.count, owners: data.owners });
                      }
                    } catch {
                      // continue
                    }
                  }
                  setStep("details");
                }}
                disabled={!manualName.trim()}
                className="w-full mt-2 px-6 py-3 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium disabled:opacity-50 transition-colors"
              >
                Continue
              </button>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Details */}
      {step === "details" && !bulkMode && (
        <div>
          <button
            onClick={() => setStep("search")}
            className="text-sm text-muted hover:text-foreground mb-4 inline-block"
          >
            ← Back
          </button>
          <h1 className="text-2xl font-bold mb-6">Card Details</h1>

          {/* Duplicate notice */}
          {duplicateNotice && (
            <div className="rounded-xl bg-leo/10 border border-leo/30 p-4 mb-6">
              <div className="text-sm font-medium text-leo">
                You already have {duplicateNotice.count} of these
                {duplicateNotice.owners.length > 0 && (
                  <span>
                    {" "}
                    ({duplicateNotice.owners
                      .map((o) => (o === "remy" ? "Remy" : "Leo") + "'s collection")
                      .join(", ")})
                  </span>
                )}
              </div>
              <div className="text-xs text-muted mt-1">
                Duplicates are fine — just letting you know!
              </div>
            </div>
          )}

          {selectedCard && (
            <div className="flex items-center gap-4 mb-6 p-4 rounded-xl bg-card-bg border border-card-border">
              {selectedCard.image_url && (
                <Image
                  src={selectedCard.image_url}
                  alt={selectedCard.name}
                  width={60}
                  height={84}
                  className="rounded"
                  unoptimized
                />
              )}
              <div>
                <div className="font-medium">{selectedCard.name}</div>
                <div className="text-sm text-muted">{selectedCard.set_name}</div>
              </div>
            </div>
          )}

          <div className="space-y-5">
            {/* Card details fields */}
            {selectedCard && (
              <div className="rounded-xl bg-card-bg border border-card-border p-4 space-y-3">
                <div className="text-sm font-medium text-muted">Card Details</div>
                <div>
                  <label className="block text-xs text-muted mb-1">Set Name</label>
                  <input
                    type="text"
                    value={manualSet || selectedCard.set_name || ""}
                    onChange={(e) => setManualSet(e.target.value)}
                    placeholder={isSportsCategory ? "e.g. 2023 Topps Chrome" : "e.g. Base Set, Evolving Skies"}
                    className="w-full px-3 py-2 rounded-lg bg-background border border-card-border focus:border-accent focus:outline-none text-sm"
                  />
                </div>
                <div className={`grid ${isTCGCategory ? "grid-cols-2" : "grid-cols-3"} gap-3`}>
                  <div>
                    <label className="block text-xs text-muted mb-1">Year</label>
                    <input
                      type="number"
                      value={manualYear || selectedCard.year || ""}
                      onChange={(e) => setManualYear(e.target.value)}
                      placeholder="1999"
                      className="w-full px-3 py-2 rounded-lg bg-background border border-card-border focus:border-accent focus:outline-none text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-muted mb-1">Card #</label>
                    <input
                      type="text"
                      value={manualNumber || selectedCard.card_number || ""}
                      onChange={(e) => setManualNumber(e.target.value)}
                      placeholder="#63"
                      className="w-full px-3 py-2 rounded-lg bg-background border border-card-border focus:border-accent focus:outline-none text-sm"
                    />
                  </div>
                  {isSportsCategory && (
                    <div>
                      <label className="block text-xs text-muted mb-1">Parallel</label>
                      <input
                        type="text"
                        value={manualRarity || selectedCard.rarity || ""}
                        onChange={(e) => setManualRarity(e.target.value)}
                        placeholder="Refractor"
                        className="w-full px-3 py-2 rounded-lg bg-background border border-card-border focus:border-accent focus:outline-none text-sm"
                      />
                    </div>
                  )}
                </div>
                {isTCGCategory && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-muted mb-1">Edition / Variant</label>
                      <select
                        value={manualVariant}
                        onChange={(e) => setManualVariant(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-background border border-card-border focus:border-accent focus:outline-none text-sm"
                      >
                        <option value="">Unlimited</option>
                        <option value="1st Edition">1st Edition</option>
                        <option value="Shadowless">Shadowless</option>
                        <option value="Reverse Holo">Reverse Holo</option>
                        <option value="Holo">Holo</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-muted mb-1">Rarity</label>
                      <input
                        type="text"
                        value={manualRarity || selectedCard.rarity || ""}
                        onChange={(e) => setManualRarity(e.target.value)}
                        placeholder="Common, Rare Holo"
                        className="w-full px-3 py-2 rounded-lg bg-background border border-card-border focus:border-accent focus:outline-none text-sm"
                      />
                    </div>
                  </div>
                )}
                {isSportsCategory && (
                  <button
                    type="button"
                    onClick={() => setShowEbayPicker(true)}
                    className="w-full py-2 rounded-lg border border-accent text-accent text-sm font-medium hover:bg-accent/10 transition-colors"
                  >
                    Find My Card on eBay
                  </button>
                )}
              </div>
            )}

            {/* Find My Card for manual entries (no selectedCard) */}
            {isSportsCategory && !selectedCard && (
              <button
                type="button"
                onClick={() => setShowEbayPicker(true)}
                disabled={!manualName.trim()}
                className="w-full py-2 rounded-lg border border-accent text-accent text-sm font-medium hover:bg-accent/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Find My Card on eBay
              </button>
            )}

            {/* Condition */}
            <div>
              <label className="block text-sm text-muted mb-2">
                Condition
              </label>
              <div className="flex gap-3">
                <button
                  onClick={() => setCondition("raw")}
                  className={`flex-1 py-3 rounded-lg font-medium text-center transition-colors ${
                    condition === "raw"
                      ? "bg-accent text-white"
                      : "bg-card-bg border border-card-border text-muted hover:text-foreground"
                  }`}
                >
                  Raw
                </button>
                <button
                  onClick={() => setCondition("graded")}
                  className={`flex-1 py-3 rounded-lg font-medium text-center transition-colors ${
                    condition === "graded"
                      ? "bg-accent text-white"
                      : "bg-card-bg border border-card-border text-muted hover:text-foreground"
                  }`}
                >
                  Graded
                </button>
              </div>
            </div>

            {/* Grading details */}
            {condition === "graded" && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-muted mb-1">
                    Company
                  </label>
                  <select
                    value={gradingCompany}
                    onChange={(e) =>
                      setGradingCompany(e.target.value as GradingCompany)
                    }
                    className="w-full px-4 py-3 rounded-lg bg-card-bg border border-card-border focus:border-accent focus:outline-none"
                  >
                    <option value="PSA">PSA</option>
                    <option value="BGS">BGS</option>
                    <option value="CGC">CGC</option>
                    <option value="SGC">SGC</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-muted mb-1">
                    Grade
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    step="0.5"
                    value={grade}
                    onChange={(e) => setGrade(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg bg-card-bg border border-card-border focus:border-accent focus:outline-none"
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
                  className="w-10 h-10 rounded-lg bg-card-bg border border-card-border flex items-center justify-center hover:border-accent"
                >
                  −
                </button>
                <span className="text-lg font-medium w-8 text-center">
                  {quantity}
                </span>
                <button
                  onClick={() => setQuantity(quantity + 1)}
                  className="w-10 h-10 rounded-lg bg-card-bg border border-card-border flex items-center justify-center hover:border-accent"
                >
                  +
                </button>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm text-muted mb-1">
                Notes (optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any notes about this card..."
                rows={2}
                className="w-full px-4 py-3 rounded-lg bg-card-bg border border-card-border focus:border-accent focus:outline-none resize-none"
              />
            </div>

            <button
              onClick={async () => {
                if (selectedCard) {
                  setEstimatingPrice(true);
                  try {
                    const res = await fetch("/api/prices/estimate", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        playerName: selectedCard.name,
                        setName: manualSet || selectedCard.set_name || null,
                        year: manualYear || selectedCard.year || null,
                        cardNumber: manualNumber || selectedCard.card_number || null,
                        parallel: manualRarity || selectedCard.rarity || null,
                        variant: manualVariant || null,
                        category,
                        condition,
                        gradingCompany:
                          condition === "graded" ? gradingCompany : null,
                        grade: condition === "graded" ? grade : null,
                      }),
                    });
                    const data = await res.json();
                    if (data.prices?.length > 0) {
                      setSelectedCard({
                        ...selectedCard,
                        prices: data.prices,
                        ...(isSportsCategory && data.listingImageUrl
                          ? { image_url: data.listingImageUrl }
                          : {}),
                      });
                      const market = data.prices.find(
                        (p: { condition_key: string }) =>
                          p.condition_key === "market"
                      );
                      setSportsEstimate(market?.price_usd || null);
                    }
                  } catch {
                    // Continue without estimate
                  }
                  setEstimatingPrice(false);
                }
                setStep("confirm");
              }}
              disabled={estimatingPrice}
              className="w-full py-3 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium transition-colors disabled:opacity-50"
            >
              {estimatingPrice ? "Estimating price..." : "Review & Save"}
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Confirm (single card) */}
      {step === "confirm" && !bulkMode && (
        <div>
          <button
            onClick={() => setStep("details")}
            className="text-sm text-muted hover:text-foreground mb-4 inline-block"
          >
            ← Back
          </button>
          <h1 className="text-2xl font-bold mb-6">Confirm & Save</h1>

          <div className="rounded-xl bg-card-bg border border-card-border p-5 space-y-4">
            {selectedCard?.image_url && (
              <div className="flex justify-center">
                <Image
                  src={selectedCard.image_url}
                  alt={selectedCard?.name || manualName}
                  width={150}
                  height={210}
                  className="rounded-lg"
                  unoptimized
                />
              </div>
            )}

            <div className="text-center">
              <h2 className="text-xl font-bold">
                {selectedCard?.name || manualName}
              </h2>
              {(manualSet || selectedCard?.set_name) && (
                <p className="text-sm text-muted">
                  {manualSet || selectedCard?.set_name}
                  {manualYear && ` (${manualYear})`}
                  {manualNumber && ` #${manualNumber}`}
                </p>
              )}
              {(manualVariant || manualRarity) && (
                <p className="text-xs text-muted">
                  {[manualVariant, manualRarity].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="bg-background rounded-lg p-3">
                <div className="text-muted">Condition</div>
                <div className="font-medium">
                  {condition === "graded"
                    ? `${gradingCompany} ${grade}`
                    : "Raw"}
                </div>
              </div>
              <div className="bg-background rounded-lg p-3">
                <div className="text-muted">Quantity</div>
                <div className="font-medium">{quantity}</div>
              </div>
              <div className="bg-background rounded-lg p-3">
                <div className="text-muted">Est. Value</div>
                <div className="font-medium text-success">
                  {formatPrice(estimatedValue)}
                </div>
                {sportsEstimate !== null && (
                  <div className="text-xs text-muted mt-1">
                    eBay BIN minus 15% — sellers list high
                  </div>
                )}
              </div>
            </div>

            {notes && (
              <div className="text-sm">
                <span className="text-muted">Notes:</span> {notes}
              </div>
            )}

            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full py-3 rounded-lg bg-success hover:bg-success/90 text-white font-bold text-lg transition-colors disabled:opacity-50"
            >
              {saving ? "Saving..." : "Add to Collection"}
            </button>
          </div>
        </div>
      )}

      {/* eBay Listing Picker */}
      {showEbayPicker && isSportsCategory && (
        <EbayListingPicker
          playerName={selectedCard?.name || manualName}
          setName={manualSet || undefined}
          year={manualYear || undefined}
          cardNumber={manualNumber || undefined}
          category={category!}
          onSelect={(listing) => {
            if (selectedCard) {
              setSelectedCard({ ...selectedCard, image_url: listing.imageUrl });
            }
            setShowEbayPicker(false);
          }}
          onClose={() => setShowEbayPicker(false)}
        />
      )}

      {/* Bulk confirm step */}
      {step === "confirm" && bulkMode && (
        <div>
          <button
            onClick={() => setStep("search")}
            className="text-sm text-muted hover:text-foreground mb-4 inline-block"
          >
            ← Back to Search
          </button>
          <h1 className="text-2xl font-bold mb-6">
            Review & Save All ({bulkQueue.length} cards)
          </h1>

          {bulkQueue.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted">No cards in queue. Go back and add some!</p>
            </div>
          ) : (
            <div className="space-y-3 mb-6">
              {bulkQueue.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-3 p-3 rounded-xl bg-card-bg border border-card-border"
                >
                  {item.searchResult.image_url && (
                    <Image
                      src={item.searchResult.image_url}
                      alt={item.searchResult.name}
                      width={40}
                      height={56}
                      className="rounded"
                      unoptimized
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {item.searchResult.name}
                    </div>
                    <div className="text-xs text-muted truncate">
                      {item.searchResult.set_name}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          const updated = [...bulkQueue];
                          updated[idx].quantity = Math.max(1, updated[idx].quantity - 1);
                          setBulkQueue(updated);
                        }}
                        className="w-6 h-6 rounded bg-background border border-card-border flex items-center justify-center text-xs"
                      >
                        −
                      </button>
                      <span className="w-4 text-center text-xs">{item.quantity}</span>
                      <button
                        onClick={() => {
                          const updated = [...bulkQueue];
                          updated[idx].quantity++;
                          setBulkQueue(updated);
                        }}
                        className="w-6 h-6 rounded bg-background border border-card-border flex items-center justify-center text-xs"
                      >
                        +
                      </button>
                    </div>
                    <button
                      onClick={() => setBulkQueue(bulkQueue.filter((_, i) => i !== idx))}
                      className="text-muted hover:text-danger text-sm"
                    >
                      &times;
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {bulkQueue.length > 0 && (
            <button
              onClick={handleBulkSave}
              disabled={bulkSaving}
              className="w-full py-3 rounded-lg bg-success hover:bg-success/90 text-white font-bold text-lg transition-colors disabled:opacity-50"
            >
              {bulkSaving
                ? "Saving..."
                : `Save All ${bulkQueue.length} Cards`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
