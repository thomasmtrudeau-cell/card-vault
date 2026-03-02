import { NextRequest, NextResponse } from "next/server";
import { getPricesWithRefresh } from "@/lib/price-fetcher";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ cardId: string }> }
) {
  const { cardId } = await params;
  try {
    const prices = await getPricesWithRefresh(cardId);
    return NextResponse.json({ prices });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch prices" },
      { status: 500 }
    );
  }
}
