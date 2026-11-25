import type { Metadata } from "next";
import {
  Inter,
  Manrope,
  Noto_Sans_Devanagari,
  JetBrains_Mono,
} from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-manrope",
  display: "swap",
});

const notoDevanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-devanagari",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Sajilo Commerce — Every channel. One business.",
    template: "%s | Sajilo Commerce",
  },
  description:
    "The complete commerce operating system for Nepali entrepreneurs. Create your online store, manage social orders, control inventory, and reconcile COD from one dashboard.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${manrope.variable} ${notoDevanagari.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-screen bg-ivory text-charcoal antialiased">
        {children}
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}