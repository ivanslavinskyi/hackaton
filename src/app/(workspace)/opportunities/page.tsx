import type {Metadata} from 'next';
import {DecisionScreen} from '@/components/market-radar';
export const metadata:Metadata={title:'Graduate opportunities | Market Radar'};
export default function Page(){return <DecisionScreen kind="opportunities"/>;}
