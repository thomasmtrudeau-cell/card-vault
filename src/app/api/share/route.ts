import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { owner_filter, category_filter } = body;

  const { data, error } = await supabase
    .from("share_links")
    .insert({
      owner_filter: owner_filter || null,
      category_filter: category_filter || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ link: data }, { status: 201 });
}

export async function GET() {
  const { data, error } = await supabase
    .from("share_links")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ links: data || [] });
}
