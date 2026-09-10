import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DoorGo",
  description: "Door Shop Operations",
  applicationName: "DoorGo",
  icons: {
    icon: [
      { url: "/brand/doorgo-favicon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/brand/doorgo-mark.svg", type: "image/svg+xml", sizes: "any" },
    ],
    apple: [{ url: "/brand/doorgo-apple-touch-180.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { capable: true, title: "DoorGo", statusBarStyle: "default" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
