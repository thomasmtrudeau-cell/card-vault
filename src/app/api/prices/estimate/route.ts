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

    const baseFilter = "buyingOptions:{FIXED_PRICE},deliveryCountry:US,price:[5..],priceCurrency:USD";
    const headers = { Authorization: `Bearer ${tokenData.access_token}` };

    // Two parallel queries: sort=price for true floor, best-match for range
    const [floorRes, rangeRes] = await Promise.all([
      fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(query)}&category_ids=${categoryId}&filter=${baseFilter}&sort=price&limit=20`, { headers }),
      fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(query)}&category_ids=${categoryId}&filter=${baseFilter}&limit=50`, { headers }),
    ]);

    const floorData = floorRes.ok ? await floorRes.json() : { itemSummaries: [] };
    const rangeData = rangeRes.ok ? await rangeRes.json() : { itemSummaries: [] };

    const junkPatterns = /you pick|pick your|choose your|complete your set|lot of|mystery|repack/i;
    const bulkPatterns = /\d+\/\d+\/\d+/;
    const targetGrade = (condition === "graded" && grade) ? parseFloat(String(grade)) : null;

    type EbayItem = { title?: string; price?: { value?: string }; image?: { imageUrl?: string } };

    const isValid = (item: EbayItem) => {
      const t = (item.title || "").toLowerCase();
      if (junkPatterns.test(t)) return false;
      if (bulkPatterns.test(item.title || "")) return false;
      // If card is NOT 1st edition, filter out 1st edition listings
      if (!variant || !/1st\s*edition/i.test(variant)) {
        if (/1st\s*edition/i.test(t)) return false;
      }
      // Filter listings with a lower grade than target
      if (targetGrade) {
        const gradePattern = /\b(?:psa|bgs|cgc|sgc)\s*(\d+(?:\.\d+)?)\b/gi;
        let match;
        while ((match = gradePattern.exec(t)) !== null) {
          const mentioned = parseFloat(match[1]);
          if (!isNaN(mentioned) && mentioned < targetGrade) return false;
        }
      }
      return true;
    };

    const floorListings = (floorData.itemSummaries || []).filter(isValid);
    const rangeListings = (rangeData.itemSummaries || []).filter(isValid);

    const DISCOUNT = 0.85;

    const toSorted = (items: EbayItem[]) =>
      items
        .map((item) => item.price?.value ? parseFloat(item.price.value) : null)
        .filter((p): p is number => p !== null && p > 0)
        .sort((a, b) => a - b);

    const floorPrices = toSorted(floorListings);
    const rangePrices = toSorted(rangeListings);
    const allPrices = floorPrices.length > 0 ? floorPrices : rangePrices;

    if (allPrices.length === 0) {
      return NextResponse.json({ prices: [], query });
    }

    // Market = true cheapest BIN from sort=price query
    const cheapest = floorPrices.length > 0 ? floorPrices[0] : rangePrices[0];
    const rangeForMedian = rangePrices.length > 0 ? rangePrices : floorPrices;
    const median = rangeForMedian[Math.floor(rangeForMedian.length / 2)];

    const market = Math.round(cheapest * DISCOUNT * 100) / 100;
    const mid = Math.round(median * DISCOUNT * 100) / 100;
    const high = Math.round(rangeForMedian[rangeForMedian.length - 1] * DISCOUNT * 100) / 100;

    // Grab listing image from the range query (more relevant)
    const allListings = rangeListings.length > 0 ? rangeListings : floorListings;
    const listingImageUrl =
      allListings.find((item: EbayItem) => item.image?.imageUrl)?.image?.imageUrl || null;

    return NextResponse.json({
      prices: [
        { source: "ebay", price_usd: market, condition_key: "market" },
        { source: "ebay", price_usd: mid, condition_key: "mid" },
        { source: "ebay", price_usd: high, condition_key: "high" },
      ],
      query,
      listingCount: allListings.length,
      listingImageUrl,
    });
  } catch {
    return NextResponse.json({ prices: [] });
  }
}
