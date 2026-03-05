import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const { playerName, setName, year, cardNumber, category } =
    await request.json();

  if (!playerName) {
    return NextResponse.json(
      { error: "playerName required" },
      { status: 400 }
    );
  }

  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json({ listings: [] });
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
      return NextResponse.json({ listings: [] });
    }
    const tokenData = await tokenRes.json();

    // Build search query
    const parts: string[] = [];
    if (year) parts.push(String(year));
    if (setName) parts.push(setName);
    parts.push(playerName);
    if (cardNumber) parts.push(`#${cardNumber}`);

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

    const query = parts.join(" ");
    const categoryId = isTCG ? "183454" : "261328";

    const fullQuery = query + " -lot -break -box -pack -repack";
    const browseRes = await fetch(
      `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(fullQuery)}&category_ids=${categoryId}&filter=buyingOptions:{FIXED_PRICE},deliveryCountry:US,price:[5..],priceCurrency:USD&sort=price&limit=25`,
      { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
    );
    if (!browseRes.ok) {
      return NextResponse.json({ listings: [] });
    }
    const browseData = await browseRes.json();

    interface EbayItem {
      title?: string;
      image?: { imageUrl?: string };
      price?: { value?: string; currency?: string };
      itemWebUrl?: string;
    }

    const junkPatterns = /you pick|pick your|choose your|complete your set|lot of|mystery|repack/i;
    const listings = (browseData.itemSummaries || [])
      .filter((item: EbayItem) => item.image?.imageUrl && !junkPatterns.test(item.title || ""))
      .map((item: EbayItem) => ({
        title: item.title || "",
        imageUrl: item.image?.imageUrl || "",
        price: item.price?.value ? parseFloat(item.price.value) : null,
        itemWebUrl: item.itemWebUrl || "",
      }));

    return NextResponse.json({ listings, query });
  } catch {
    return NextResponse.json({ listings: [] });
  }
}
