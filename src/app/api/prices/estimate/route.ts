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
    isFirstEdition,
    isAuto,
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
    // Strip leading # from card number to avoid double-# (user may type "#29")
    const cleanNumber = cardNumber ? String(cardNumber).replace(/^#+/, "") : null;

    const parts: string[] = [];
    if (year) parts.push(String(year));
    if (setName) parts.push(setName);
    parts.push(playerName);
    if (cleanNumber) parts.push(`#${cleanNumber}`);
    if (variant) parts.push(variant);
    if (parallel) parts.push(parallel);
    if (isFirstEdition) parts.push("1st edition");
    if (isAuto) parts.push("auto");
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

    const query = parts.join(" ") + " -lot -break -box -pack -repack -japanese";

    // 261328 = sports trading cards, 183454 = CCG individual cards
    const categoryId = isTCG ? "183454" : "261328";

    const baseFilter = "buyingOptions:{FIXED_PRICE},deliveryCountry:US,price:[1..],priceCurrency:USD";
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
    const nonEnglishPatterns = /\bjapanese\b|\bjpn\b|\bjp\b|\bkorean\b|\bchinese\b|\bfrench\b|\bgerman\b|\bitalian\b|\bspanish\b|\bportuguese\b|\bdutch\b|\bsv2a\b|\bs\d+a\b|\bsm\d+a\b|\bxy\d+a\b/i;
    const noveltyPatterns = /\bkeychain\b|\bslabbie\b|\breplica\b|\bcustom\b|\bproxy\b|\bsticker\b|\bmagnet\b|\bpin\b|\bposter\b|\bdisplay\b|\bstand\b|\bfridge\b|\btoy\b|\bplush\b|\bfigur/i;
    const targetGrade = (condition === "graded" && grade) ? parseFloat(String(grade)) : null;
    const playerNameLower = playerName.toLowerCase();

    type EbayItem = { title?: string; price?: { value?: string }; image?: { imageUrl?: string }; condition?: string };

    const isValid = (item: EbayItem) => {
      const t = (item.title || "").toLowerCase();
      if (junkPatterns.test(t)) return false;
      if (bulkPatterns.test(item.title || "")) return false;
      if (nonEnglishPatterns.test(t)) return false;
      if (noveltyPatterns.test(t)) return false;
      // Listing title must contain the key words from the card/player name
      const nameWords = playerNameLower
        .replace(/[-]/g, " ") // hyphens → spaces (e.g. "Heatran-EX" → "Heatran EX")
        .replace(/[^a-z0-9\s]/g, "")
        .split(/\s+/)
        .filter((w: string) => w.length >= 3);
      const missing = nameWords.filter((w: string) => !t.includes(w));
      if (missing.length > nameWords.length * 0.3) return false;
      // If card is NOT 1st edition, filter out 1st edition listings
      if (!isFirstEdition && (!variant || !/1st\s*edition/i.test(variant))) {
        if (/1st\s*edition/i.test(t)) return false;
      }
      // If searching for graded, reject listings explicitly marked "Ungraded"
      if (condition === "graded" && gradingCompany && item.condition) {
        if (item.condition.toLowerCase().trim().startsWith("ungraded")) return false;
      }
      // If searching for raw, exclude graded listings (they inflate the price)
      if (condition === "raw") {
        const gradedPattern = /\b(?:psa|bgs|cgc|sgc)\s*\d+(?:\.\d+)?\b/i;
        if (gradedPattern.test(t)) return false;
      }
      // Grade + company validation for graded cards
      if (targetGrade && condition === "graded" && gradingCompany) {
        const targetCompany = gradingCompany.toLowerCase();
        // Require the listing to mention the target grading company
        const companyPattern = new RegExp(`\\b${targetCompany}\\b`, "i");
        if (!companyPattern.test(t)) return false;
        // Require the exact company + grade combo (e.g. "PSA 10")
        const exactPattern = new RegExp(`\\b${targetCompany}\\s*${targetGrade}\\b`, "i");
        if (!exactPattern.test(t)) return false;
        // Reject listings that also mention a different company grade
        const allCompanies = ["psa", "bgs", "cgc", "sgc"];
        const otherCompanies = allCompanies.filter((c) => c !== targetCompany);
        const otherPattern = new RegExp(`\\b(?:${otherCompanies.join("|")})\\s*\\d+(?:\\.\\d+)?\\b`, "i");
        const hasDifferentCompany = otherPattern.test(t);
        if (hasDifferentCompany) return false;
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

    // If no results, retry with a simpler query (just name + set + category keyword)
    if (allPrices.length === 0) {
      const simpleParts: string[] = [];
      if (setName) simpleParts.push(setName);
      simpleParts.push(playerName);
      if (cleanNumber) simpleParts.push(`#${cleanNumber}`);
      if (condition === "graded" && gradingCompany) {
        simpleParts.push(gradingCompany);
        if (grade) simpleParts.push(String(grade));
      }
      if (isTCG && !setName) {
        simpleParts.push(category === "pokemon" ? "pokemon card" : category === "magic" ? "mtg card" : "yugioh card");
      }
      const simpleQuery = simpleParts.join(" ") + " -lot -break -box -pack -repack -japanese";

      if (simpleQuery !== query) {
        const [sFloorRes, sRangeRes] = await Promise.all([
          fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(simpleQuery)}&category_ids=${categoryId}&filter=${baseFilter}&sort=price&limit=20`, { headers }),
          fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(simpleQuery)}&category_ids=${categoryId}&filter=${baseFilter}&limit=50`, { headers }),
        ]);
        const sFloorData = sFloorRes.ok ? await sFloorRes.json() : { itemSummaries: [] };
        const sRangeData = sRangeRes.ok ? await sRangeRes.json() : { itemSummaries: [] };

        const sFloorListings = (sFloorData.itemSummaries || []).filter(isValid);
        const sRangeListings = (sRangeData.itemSummaries || []).filter(isValid);
        const sFloorPrices = toSorted(sFloorListings);
        const sRangePrices = toSorted(sRangeListings);
        const sAllPrices = sFloorPrices.length > 0 ? sFloorPrices : sRangePrices;

        if (sAllPrices.length > 0) {
          const sCheapest = sFloorPrices.length > 0 ? sFloorPrices[0] : sRangePrices[0];
          const sRangeForMedian = sRangePrices.length > 0 ? sRangePrices : sFloorPrices;
          const sMedian = sRangeForMedian[Math.floor(sRangeForMedian.length / 2)];
          const sMarket = Math.round(sCheapest * DISCOUNT * 100) / 100;
          const sMid = Math.round(sMedian * DISCOUNT * 100) / 100;
          const sHigh = Math.round(sRangeForMedian[sRangeForMedian.length - 1] * DISCOUNT * 100) / 100;
          const sAll = sRangeListings.length > 0 ? sRangeListings : sFloorListings;
          const sImageUrl = sAll.find((item: EbayItem) => item.image?.imageUrl)?.image?.imageUrl || null;

          return NextResponse.json({
            prices: [
              { source: "ebay", price_usd: sMarket, condition_key: "market" },
              { source: "ebay", price_usd: sMid, condition_key: "mid" },
              { source: "ebay", price_usd: sHigh, condition_key: "high" },
            ],
            query: simpleQuery,
            listingCount: sAll.length,
            listingImageUrl: sImageUrl,
          });
        }
      }

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
