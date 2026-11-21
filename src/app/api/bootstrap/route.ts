import { NextResponse } from 'next/server';
import { getCatalog, getOverview, queryMetrics } from '@/lib/analytics';
import { errorResponse } from '@/lib/http';
import { getDataInventory, getMarketOverview } from '@/lib/data-inventory';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET() {
  try {
    const initialResult=queryMetrics({seriesIds:['itboard_monitor_python_open_ads','itboard_monitor_docker_open_ads'],measure:'share',mode:'history',geography:'CH'});
    return NextResponse.json({catalog:getCatalog(),overview:getOverview(),initialResult,inventory:getDataInventory(),marketOverview:getMarketOverview(),aiAvailable:Boolean(process.env.OPENAI_API_KEY?.trim()),model:process.env.OPENAI_MODEL||'gpt-6.1-terra',release:initialResult.release},{headers:{'Cache-Control':'no-store'}});
  } catch(error) { return errorResponse(error); }
}
