import Link from 'next/link';
export default function NotFound() {
  return <main className="initial-state"><span className="eyebrow">404 · MARKET RADAR</span><h1>This page could not be found</h1><p>Check the address or return to the market overview.</p><Link className="button button-primary" href="/overview">Open market overview</Link></main>;
}
