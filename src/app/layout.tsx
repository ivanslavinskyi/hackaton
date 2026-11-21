import type { Metadata } from 'next';
import './globals.css';
import './typography.css';
import './brand.css';

export const metadata: Metadata = { title: 'Market Radar — Swiss IT market intelligence', description: 'Explore verified Swiss IT labour-market data with a connected AI analyst. Built for Powercoders.' };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en" data-scroll-behavior="smooth"><head>{['roboto','inter','bebas-neue'].map(font=><link key={font} rel="preload" href={`/fonts/${font}-latin.woff2`} as="font" type="font/woff2" crossOrigin="anonymous"/>)}</head><body>{children}</body></html>; }
