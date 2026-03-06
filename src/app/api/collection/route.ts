import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import type { SearchResult, Owner, Condition, GradingCompany } from "@/lib/types";

export const dynamic = "force-dynamic";

interface PriceRow {
  id: string;
  card_id: string;
  source: string;
  price_usd: number | null;
  condition_key: string | null;
  listing_url: string | null;
  fetched_at: string;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const owner = searchParams.get("owner");
  const category = searchParams.get("category");

  let query = supabase
    .from("collection_items")
    .select("*, card:cards(*)")
    .order("date_added", { ascending: false });

  if (owner && (owner === "remy" || owner === "leo")) {
    query = query.eq("owner", owner);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let items: any[] = data || [];

  if (category) {
    items = items.filter(
      (item: { card?: { category?: string } }) =>
        item.card?.category === category
    );
  }

  const cardIds: string[] = [
    ...new Set(items.map((item: { card_id: string }) => item.card_id)),
  ];
  const { data: prices } = await supabase
    .from("price_cache")
    .select("*")
    .in("card_id", cardIds.length > 0 ? cardIds : ["__none__"]);

  const pricesByCard: Record<string, PriceRow[]> = {};
  for (const p of (prices || []) as PriceRow[]) {
    if (!pricesByCard[p.card_id]) pricesByCard[p.card_id] = [];
    pricesByCard[p.card_id].push(p);
  }

  const result = items.map((item: { card_id: string }) => ({
    ...item,
    prices: pricesByCard[item.card_id] || [],
  }));

  return NextResponse.json({ items: result });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    searchResult,
    owner,
    condition,
    grading_company,
    grade,
    quantity,
    notes,
    manualCard,
  } = body as {
    searchResult?: SearchResult;
    owner: Owner;
    condition: Condition;
    grading_company?: GradingCompany;
    grade?: number;
    quantity?: number;
    notes?: string;
    manualCard?: {
      name: string;
      category: string;
      set_name?: string;
      card_number?: string;
      year?: number;
      rarity?: string;
    };
  };

  try {
    let cardId: string;

    if (searchResult) {
      // For sports cards (thesportsdb), the external_id is a player ID, not
      // card-specific. Different cards of the same player have different
      // set_name/card_number/year/rarity, so we must include those in the
      // dedup check to avoid merging distinct cards into one row.
      let existing: { id: string } | null = null;

      if (searchResult.external_source === "thesportsdb") {
        // Match on player ID + card-specific details
        let q = supabase
          .from("cards")
          .select("id")
          .eq("external_id", searchResult.external_id)
          .eq("external_source", searchResult.external_source);

        if (searchResult.set_name) {
          q = q.eq("set_name", searchResult.set_name);
        } else {
          q = q.is("set_name", null);
        }
        if (searchResult.card_number) {
          q = q.eq("card_number", searchResult.card_number);
        } else {
          q = q.is("card_number", null);
        }
        if (searchResult.year) {
          q = q.eq("year", searchResult.year);
        } else {
          q = q.is("year", null);
        }

        const { data } = await q.single();
        existing = data as { id: string } | null;
      } else {
        const { data } = await supabase
          .from("cards")
          .select("id")
          .eq("external_id", searchResult.external_id)
          .eq("external_source", searchResult.external_source)
          .single();
        existing = data as { id: string } | null;
      }

      if (existing) {
        cardId = existing.id;
      } else {
        const { data: newCard, error: cardError } = await supabase
          .from("cards")
          .insert({
            category: searchResult.category,
            name: searchResult.name,
            set_name: searchResult.set_name,
            card_number: searchResult.card_number,
            year: searchResult.year,
            rarity: searchResult.rarity,
            image_url: searchResult.image_url,
            external_id: searchResult.external_id,
            external_source: searchResult.external_source,
          })
          .select("id")
          .single();
        if (cardError) throw cardError;
        cardId = (newCard as { id: string }).id;

        if (searchResult.prices && searchResult.prices.length > 0) {
          await supabase.from("price_cache").insert(
            searchResult.prices.map((p) => ({
              card_id: cardId,
              source: p.source,
              price_usd: p.price_usd,
              condition_key: p.condition_key,
            }))
          );
        }
      }
    } else if (manualCard) {
      const { data: newCard, error: cardError } = await supabase
        .from("cards")
        .insert({
          category: manualCard.category,
          name: manualCard.name,
          set_name: manualCard.set_name || null,
          card_number: manualCard.card_number || null,
          year: manualCard.year || null,
          rarity: manualCard.rarity || null,
          image_url: null,
          external_id: null,
          external_source: null,
        })
        .select("id")
        .single();
      if (cardError) throw cardError;
      cardId = (newCard as { id: string }).id;
    } else {
      return NextResponse.json(
        { error: "Must provide searchResult or manualCard" },
        { status: 400 }
      );
    }

    const { data: item, error: itemError } = await supabase
      .from("collection_items")
      .insert({
        card_id: cardId,
        owner,
        condition,
        grading_company: condition === "graded" ? grading_company : null,
        grade: condition === "graded" ? grade : null,
        quantity: quantity || 1,
        notes: notes || null,
      })
      .select("*, card:cards(*)")
      .single();

    if (itemError) throw itemError;

    return NextResponse.json({ item }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to add card";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
