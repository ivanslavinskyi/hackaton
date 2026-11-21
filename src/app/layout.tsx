import type { Metadata } from 'next';
import './globals.css';
import './typography.css';

export const metadata: Metadata = { title: 'Market Radar — Swiss IT market intelligence', description: 'Explore verified Swiss IT labour-market data with a connected AI analyst. Built for Powercoders.' };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en"><body>{children}</body></html>; }
