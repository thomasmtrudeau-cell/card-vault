import { NextRequest, NextResponse } from "next/server";
import { getPricesWithRefresh } from "@/lib/price-fetcher";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const { cardId, gradingCompany, grade } = await request.json();
  if (!cardId) {
    return NextResponse.json({ error: "cardId required" }, { status: 400 });
  }
  try {
    const prices = await getPricesWithRefresh(cardId, true, { gradingCompany, grade });
    return NextResponse.json({ prices });
  } catch {
    return NextResponse.json(
      { error: "Failed to refresh prices" },
      { status: 500 }
    );
  }
}
