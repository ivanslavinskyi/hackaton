import { Suspense } from 'react';
import MarketRadar from '@/components/market-radar';
export default function WorkspaceLayout({children}:{children:React.ReactNode}) {
  return <Suspense fallback={<main className="initial-state" role="status"><h1>Opening your market workspace</h1><p>Loading your view…</p></main>}><MarketRadar>{children}</MarketRadar></Suspense>;
}
