import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const {
    playerName,
    setName,
    year,
    cardNumber,
    parallel,
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
    if (parallel) parts.push(parallel);
    if (condition === "graded" && gradingCompany) {
      parts.push(gradingCompany);
      if (grade) parts.push(String(grade));
    }

    const sportKeyword =
      category === "football"
        ? "football"
        : category === "basketball"
          ? "basketball"
          : category === "hockey"
            ? "hockey"
            : "baseball";
    if (!setName) parts.push(sportKeyword, "card");

    const query = parts.join(" ");

    const browseRes = await fetch(
      `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(query)}&category_ids=261328&filter=buyingOptions:{FIXED_PRICE},deliveryCountry:US&sort=price&limit=25`,
      { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
    );
    if (!browseRes.ok) {
      return NextResponse.json({ prices: [] });
    }
    const browseData = await browseRes.json();

    const listings = browseData.itemSummaries || [];

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

    // Floor-price model: lowest 5 BIN, 15% discount for market estimate
    // Low = actual lowest BIN (what you could buy it for right now)
    const DISCOUNT = 0.85;
    const floor = listingPrices.slice(0, 5);
    const floorMedian = floor[Math.floor(floor.length / 2)];
    const estimated = Math.round(floorMedian * DISCOUNT * 100) / 100;
    const low = listingPrices[0];
    const high = listingPrices[listingPrices.length - 1];

    return NextResponse.json({
      prices: [
        { source: "ebay", price_usd: estimated, condition_key: "market" },
        { source: "ebay", price_usd: low, condition_key: "low" },
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
