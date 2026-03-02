import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const updates: Record<string, unknown> = {};
  if (body.owner) updates.owner = body.owner;
  if (body.condition) {
    updates.condition = body.condition;
    if (body.condition === "raw") {
      updates.grading_company = null;
      updates.grade = null;
    }
  }
  if (body.grading_company !== undefined)
    updates.grading_company = body.grading_company;
  if (body.grade !== undefined) updates.grade = body.grade;
  if (body.quantity !== undefined) updates.quantity = body.quantity;
  if (body.notes !== undefined) updates.notes = body.notes;

  const { data, error } = await supabase
    .from("collection_items")
    .update(updates)
    .eq("id", id)
    .select("*, card:cards(*)")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ item: data });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { data: item } = await supabase
    .from("collection_items")
    .select("card_id")
    .eq("id", id)
    .single();

  const { error } = await supabase
    .from("collection_items")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (item) {
    const { count } = await supabase
      .from("collection_items")
      .select("id", { count: "exact", head: true })
      .eq("card_id", item.card_id);

    if (count === 0) {
      await supabase.from("price_cache").delete().eq("card_id", item.card_id);
      await supabase.from("cards").delete().eq("id", item.card_id);
    }
  }

  return NextResponse.json({ success: true });
}
