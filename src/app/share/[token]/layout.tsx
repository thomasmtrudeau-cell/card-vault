import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Shared Collection — Card Vault",
  description: "View a shared trading card collection",
};

export default function ShareLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {children}
    </div>
  );
}
