import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PromptForge — Token & Prompt Toolkit',
  description: 'Token estimation and AI prompt expansion toolkit.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
