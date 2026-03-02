"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Dashboard", icon: "🏠" },
  { href: "/collection", label: "Collection", icon: "📦" },
  { href: "/add", label: "Add Card", icon: "➕" },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-card-border bg-card-bg/95 backdrop-blur-sm md:relative md:bottom-auto md:border-t-0 md:border-r">
      <div className="flex items-center justify-around md:flex-col md:justify-start md:gap-1 md:p-3 md:h-screen md:w-56">
        <div className="hidden md:flex items-center gap-2 px-3 py-4 mb-4">
          <span className="text-2xl">🃏</span>
          <span className="text-lg font-bold text-foreground">Card Vault</span>
        </div>
        {links.map((link) => {
          const isActive =
            link.href === "/"
              ? pathname === "/"
              : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-colors md:w-full ${
                isActive
                  ? "text-accent bg-accent/10"
                  : "text-muted hover:text-foreground hover:bg-card-border/30"
              }`}
            >
              <span className="text-lg">{link.icon}</span>
              <span className="hidden md:inline">{link.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
