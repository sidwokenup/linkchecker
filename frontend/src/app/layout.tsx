import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Link Checker Dashboard",
  description: "Real-time link monitoring and batch checking tool",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased text-gray-900">{children}</body>
    </html>
  );
}
