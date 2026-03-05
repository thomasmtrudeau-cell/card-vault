import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const {
    playerName,
    setName,
    year,
    cardNumber,
    parallel,
    variant,
    category,
    condition,
    gradingCompany,
    grade,
  } = await request.json();

  if (!playerName) {
    return NextResponse.json({ error: "playerName required" }, { status: 400 });
  }

  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json({ prices: [] });
  }

  try {
    // Get OAuth token
    const tokenRes = await fetch(
      "https://api.ebay.com/identity/v1/oauth2/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        },
        body: "grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope",
      }
    );
    if (!tokenRes.ok) {
      return NextResponse.json({ prices: [] });
    }
    const tokenData = await tokenRes.json();

    // Build a specific search query with ALL card details + grading
    const parts: string[] = [];
    if (year) parts.push(String(year));
    if (setName) parts.push(setName);
    parts.push(playerName);
    if (cardNumber) parts.push(`#${cardNumber}`);
    if (variant) parts.push(variant);
    if (parallel) parts.push(parallel);
    if (condition === "graded" && gradingCompany) {
      parts.push(gradingCompany);
      if (grade) parts.push(String(grade));
    }

    const TCG_CATEGORIES = ["pokemon", "magic", "yugioh"];
    const isTCG = TCG_CATEGORIES.includes(category);

    if (isTCG) {
      if (!setName) parts.push(category === "pokemon" ? "pokemon card" : category === "magic" ? "mtg card" : "yugioh card");
    } else {
      const sportKeyword =
        category === "football"
          ? "football"
          : category === "basketball"
            ? "basketball"
            : category === "hockey"
              ? "hockey"
              : "baseball";
      if (!setName) parts.push(sportKeyword, "card");
    }

    const query = parts.join(" ") + " -lot -break -box -pack -repack";

    // 261328 = sports trading cards, 183454 = CCG individual cards
    const categoryId = isTCG ? "183454" : "261328";

    const browseRes = await fetch(
      `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(query)}&category_ids=${categoryId}&filter=buyingOptions:{FIXED_PRICE},deliveryCountry:US,price:[5..],priceCurrency:USD&limit=50`,
      { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
    );
    if (!browseRes.ok) {
      return NextResponse.json({ prices: [] });
    }
    const browseData = await browseRes.json();

    const junkPatterns = /you pick|pick your|choose your|complete your set|lot of|mystery|repack/i;
    const listings = (browseData.itemSummaries || []).filter(
      (item: { title?: string }) => !junkPatterns.test(item.title || "")
    );

    // Grab the first listing's image as a representative card image
    const listingImageUrl =
      listings.find(
        (item: { image?: { imageUrl?: string } }) => item.image?.imageUrl
      )?.image?.imageUrl || null;

    const listingPrices: number[] = listings
      .map(
        (item: { price?: { value?: string } }) =>
          item.price?.value ? parseFloat(item.price.value) : null
      )
      .filter((p: number | null): p is number => p !== null && p > 0)
      .sort((a: number, b: number) => a - b);

    if (listingPrices.length === 0) {
      return NextResponse.json({ prices: [], query });
    }

    // Market = lowest BIN × 0.85 (what you'd realistically pay)
    // Low/High from the full range for context
    const DISCOUNT = 0.85;
    const market = Math.round(listingPrices[0] * DISCOUNT * 100) / 100;
    const median = listingPrices[Math.floor(listingPrices.length / 2)];
    const mid = Math.round(median * DISCOUNT * 100) / 100;
    const high = Math.round(listingPrices[listingPrices.length - 1] * DISCOUNT * 100) / 100;

    return NextResponse.json({
      prices: [
        { source: "ebay", price_usd: market, condition_key: "market" },
        { source: "ebay", price_usd: mid, condition_key: "mid" },
        { source: "ebay", price_usd: high, condition_key: "high" },
      ],
      query,
      listingCount: listings.length,
      listingImageUrl,
    });
  } catch {
    return NextResponse.json({ prices: [] });
  }
}
