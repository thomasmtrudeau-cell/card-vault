import type { CardCategory } from "./types";

export const CATEGORIES: {
  value: CardCategory;
  label: string;
  icon: string;
  searchable: boolean;
}[] = [
  { value: "pokemon", label: "Pokemon", icon: "⚡", searchable: true },
  { value: "magic", label: "Magic: The Gathering", icon: "🧙", searchable: true },
  { value: "yugioh", label: "Yu-Gi-Oh!", icon: "👁️", searchable: true },
  { value: "baseball", label: "Baseball", icon: "⚾", searchable: false },
  { value: "football", label: "Football", icon: "🏈", searchable: false },
  { value: "basketball", label: "Basketball", icon: "🏀", searchable: false },
  { value: "hockey", label: "Hockey", icon: "🏒", searchable: false },
];

export function getCategoryLabel(value: CardCategory): string {
  return CATEGORIES.find((c) => c.value === value)?.label || value;
}

export function getCategoryIcon(value: CardCategory): string {
  return CATEGORIES.find((c) => c.value === value)?.icon || "🃏";
}
