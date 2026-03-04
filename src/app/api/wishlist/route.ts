import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const owner = searchParams.get("owner");

  let query = supabase
    .from("wishlist_items")
    .select("*")
    .order("created_at", { ascending: false });

  if (owner && (owner === "remy" || owner === "leo")) {
    query = query.eq("owner", owner);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data || [] });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { owner, category, name, set_name, card_number, year, notes, target_price, image_url, external_id, external_source } = body;

  if (!owner || !category || !name) {
    return NextResponse.json(
      { error: "owner, category, and name are required" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("wishlist_items")
    .insert({
      owner,
      category,
      name,
      set_name: set_name || null,
      card_number: card_number || null,
      year: year || null,
      notes: notes || null,
      target_price: target_price || null,
      image_url: image_url || null,
      external_id: external_id || null,
      external_source: external_source || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ item: data }, { status: 201 });
}
