export function formatPrice(price: number | null | undefined): string {
  if (price == null || price === 0) return "—";
  if (price >= 1000) {
    return `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `$${price.toFixed(2)}`;
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// eBay seller fees: ~13.25% (12.9% FVF + $0.30 per order)
const EBAY_FEE_RATE = 0.1325;
const EBAY_PER_ORDER_FEE = 0.30;

export function afterEbayFees(price: number): number {
  return Math.round((price * (1 - EBAY_FEE_RATE) - EBAY_PER_ORDER_FEE) * 100) / 100;
}

export function formatPriceAfterFees(price: number | null | undefined): string {
  if (price == null || price === 0) return "—";
  return formatPrice(afterEbayFees(price));
}
