import { NextResponse } from 'next/server';
import { getCatalog } from '@/lib/analytics';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export function GET() {
  try {return NextResponse.json({status:'ok',data:'ready',series:getCatalog().length,ai:process.env.OPENAI_API_KEY?.trim()?'configured':'not_configured'},{headers:{'Cache-Control':'no-store'}});}
  catch {return NextResponse.json({status:'error',data:'unavailable'},{status:503});}
}
