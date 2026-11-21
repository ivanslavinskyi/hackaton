import type { Metadata } from 'next';
import { ExploreScreen } from '@/components/market-radar';
export const metadata:Metadata={title:'Market explorer | Market Radar'};
export default function Page(){return <ExploreScreen/>;}
