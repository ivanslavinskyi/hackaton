import {decisionScopeSchema} from '@/lib/decision-contracts';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { runAnalyst } from '@/lib/analyst';
import { getConversationStore } from '@/lib/conversations';
import { querySchema, type ChatEvent } from '@/lib/contracts';
import { attachSession, checkOrigin, errorResponse, HttpError, rateLimit, readBody, sessionFor } from '@/lib/http';
export const runtime='nodejs';
export const maxDuration=60;
const requestSchema=z.object({message:z.string().trim().min(1).max(4000),context:querySchema.nullable().optional(),brief:decisionScopeSchema.nullable().optional()}).strict();
export async function POST(req:NextRequest) {
  try {
    checkOrigin(req);rateLimit(req,'analyst');const body=requestSchema.parse(await readBody(req));
    if(!process.env.OPENAI_API_KEY?.trim()) throw new HttpError(503,'LLM_UNAVAILABLE','AI Analyst needs a server API key. You can continue exploring all verified data manually.');
    const id=sessionFor(req);getConversationStore().ensureSession(id);
    const abort=new AbortController();req.signal.addEventListener('abort',()=>abort.abort(),{once:true});
    const stream=new ReadableStream<Uint8Array>({
      async start(controller) {
        const encoder=new TextEncoder();let closed=false;
        const send=(event:ChatEvent)=>{if(!closed&&!abort.signal.aborted)try {controller.enqueue(encoder.encode(JSON.stringify(event)+'\n'));}catch {closed=true;abort.abort();}};
        try { await runAnalyst(id,body.message,body.context||null,send,abort.signal,body.brief); }
        catch(error) {
          const known=error instanceof Error && 'code' in error;
          send({type:'error',code:known?String((error as {code:string}).code):'ANALYST_ERROR',message:known?(error as Error).message:'The analyst could not complete this request. Your previous results are still available.'});
        } finally {closed=true;try {controller.close();}catch {/* Client disconnected. */}}
      },
      cancel(){abort.abort();},
    });
    return attachSession(new NextResponse(stream,{headers:{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store, no-transform','X-Accel-Buffering':'no'}}),req,id);
  } catch(error) {return errorResponse(error);}
}
