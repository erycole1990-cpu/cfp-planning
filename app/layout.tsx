import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CFP Planning",
  description: "Advisor workspace for customer goals, progress, and coaching actions",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
