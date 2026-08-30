import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nametag — Chat",
  description: "Realtime messaging with unique nametags, without phone numbers.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
