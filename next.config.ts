import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { hostname: "images.pokemontcg.io" },
      { hostname: "cards.scryfall.io" },
      { hostname: "c1.scryfall.com" },
      { hostname: "storage.googleapis.com" },
      { hostname: "images.ygoprodeck.com" },
      { hostname: "r2.thesportsdb.com" },
      { hostname: "www.thesportsdb.com" },
    ],
  },
};

export default nextConfig;
