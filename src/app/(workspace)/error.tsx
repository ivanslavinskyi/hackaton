'use client';
import Link from 'next/link';
export default function WorkspaceError({reset}:{reset:()=>void}) {
  return <section className="initial-state" role="alert"><h1>This view could not be displayed</h1><p>Your saved conversation remains available. Try opening this view again.</p><button className="button button-primary" onClick={reset}>Try again</button><Link className="text-button" href="/overview">Back to market overview</Link></section>;
}
