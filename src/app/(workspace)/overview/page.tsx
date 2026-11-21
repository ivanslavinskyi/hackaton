import type { Metadata } from 'next';
import { OverviewScreen } from '@/components/market-radar';
export const metadata:Metadata={title:'Market overview | Market Radar'};
export default function Page(){return <OverviewScreen/>;}
