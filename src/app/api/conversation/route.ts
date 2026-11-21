import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getConversationStore } from '@/lib/conversations';
import { searchEvidence } from '@/lib/analytics';
import { attachSession, checkOrigin, errorResponse, HttpError, rateLimit, sessionFor } from '@/lib/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest) {
  try {
    rateLimit(req,'session');const id=sessionFor(req),store=getConversationStore();store.ensureSession(id);
    const resultIds=req.nextUrl.searchParams.getAll('resultId');
    if(resultIds.length) {
      if(resultIds.length>8||resultIds.some(value=>!/^result_[a-f0-9]{20}$/.test(value)))throw new HttpError(400,'INVALID_RESULT_ID','Choose valid stored result identifiers.');
      const results=store.getResults(id,resultIds);
      if(results.length!==new Set(resultIds).size)throw new HttpError(404,'RESULT_NOT_FOUND','This result is not available in the current conversation.');
      return attachSession(NextResponse.json({results,scope:store.getScope(id)}),req,id);
    }
    return attachSession(NextResponse.json({turns:store.getTurns(id),results:store.getResults(id),scope:store.getScope(id),brief:store.getBriefScope(id),evidence:store.getEvidence(id).length?store.getEvidence(id):searchEvidence('')}),req,id);
  } catch(error) {return errorResponse(error);}
}
export async function POST(req:NextRequest) {
  try {
    checkOrigin(req);rateLimit(req,'session');const id=randomBytes(32).toString('hex');getConversationStore().ensureSession(id);
    return attachSession(NextResponse.json({turns:[],results:[],scope:null,brief:null,evidence:[]}),req,id);
  } catch(error) {return errorResponse(error);}
}
