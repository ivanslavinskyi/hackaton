import { NextRequest, NextResponse } from 'next/server';
import { queryMetrics } from '@/lib/analytics';
import { getConversationStore } from '@/lib/conversations';
import { attachSession, checkOrigin, errorResponse, rateLimit, readBody, sessionFor } from '@/lib/http';
export const runtime='nodejs';
export async function POST(req:NextRequest) {
  try {
    checkOrigin(req);rateLimit(req);
    const result=queryMetrics(await readBody(req) as never);
    const id=sessionFor(req),store=getConversationStore();store.ensureSession(id);
    const lock=store.acquireLock(id);
    try {
      store.putResult(id,result);
      if(result.status==='ok'){
        store.setScope(id,result.query,'manual');
        if(req.headers.get('x-radar-context')==='chart')store.setBriefScope(id,null);
      }
    } finally { store.releaseLock(id,lock); }
    return attachSession(NextResponse.json(result,{headers:{'Cache-Control':'no-store'}}),req,id);
  }
  catch(error) {return errorResponse(error);}
}
