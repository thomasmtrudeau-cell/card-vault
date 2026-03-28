import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const { count, error } = await supabase
    .from("cards")
    .select("*", { count: "exact", head: true });

  if (error) {
    return NextResponse.json({ status: "error", error: error.message }, { status: 500 });
  }

  return NextResponse.json({ status: "ok", cards: count, timestamp: new Date().toISOString() });
}
