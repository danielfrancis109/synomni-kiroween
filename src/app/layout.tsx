import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Synomni Chamber",
  description: "Multi-LLM comparison and conference workspace",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#0d0d0d] text-gray-100 font-mono">
        {children}
      </body>
    </html>
  );
}
