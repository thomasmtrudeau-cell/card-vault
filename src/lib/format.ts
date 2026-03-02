export function formatPrice(price: number | null | undefined): string {
  if (price == null || price === 0) return "—";
  return `$${price.toFixed(2)}`;
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
