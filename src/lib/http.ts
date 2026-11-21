import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(public status:number, public code:string, message:string) { super(message); }
}
export const SESSION_COOKIE='market_radar_session';
export function sessionFor(req:NextRequest) {
  const stored=req.cookies.get(SESSION_COOKIE)?.value;
  return stored && /^[a-f0-9]{64}$/.test(stored) ? stored : randomBytes(32).toString('hex');
}
export function attachSession(response:NextResponse, req:NextRequest, id:string) {
  response.cookies.set(SESSION_COOKIE,id,{httpOnly:true,sameSite:'lax',secure:req.nextUrl.protocol==='https:',path:'/',maxAge:24*60*60});
  response.headers.set('Cache-Control','no-store');
  return response;
}
export function checkOrigin(req:NextRequest) {
  const origin=req.headers.get('origin');
  if(req.headers.get('sec-fetch-site')==='cross-site') throw new HttpError(403,'ORIGIN_REJECTED','This request must come from the Market Radar workspace.');
  if(origin) {
    try { if(new URL(origin).host!==req.headers.get('host')) throw new Error(); }
    catch { throw new HttpError(403,'ORIGIN_REJECTED','This request must come from the Market Radar workspace.'); }
  }
}
const globalLimits=globalThis as typeof globalThis & { radarRateLimits?:Map<string,{start:number,count:number}> };
const limits=globalLimits.radarRateLimits ??= new Map();
export function rateLimit(req:NextRequest, kind:'analytics'|'analyst'|'session'='analytics') {
  const ip=req.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() || 'local';
  const key=kind+':'+ip, now=Date.now();
  for(const [k,v] of limits) if(now-v.start>60_000) limits.delete(k);
  if(limits.size>2000) throw new HttpError(429,'BUSY','The workspace is busy. Please try again shortly.');
  let entry=limits.get(key);
  if(!entry) { entry={start:now,count:0}; limits.set(key,entry); }
  const max=kind==='analyst'?12:kind==='session'?30:90;
  if(++entry.count>max) throw new HttpError(429,'RATE_LIMIT','Too many requests. Please wait a minute and try again.');
}
export async function readBody(req:NextRequest):Promise<unknown> {
  if(!req.headers.get('content-type')?.includes('application/json')) throw new HttpError(415,'JSON_REQUIRED','Send a JSON request.');
  if(Number(req.headers.get('content-length')||0)>16384) throw new HttpError(413,'BODY_TOO_LARGE','The request is too large.');
  const reader=req.body?.getReader(); if(!reader) throw new HttpError(400,'EMPTY_BODY','A request body is required.');
  const chunks:Uint8Array[]=[]; let total=0;
  while(true) { const {value,done}=await reader.read(); if(done)break; total+=value.length; if(total>16384) {await reader.cancel();throw new HttpError(413,'BODY_TOO_LARGE','The request is too large.');} chunks.push(value); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new HttpError(400,'INVALID_JSON','The request is not valid JSON.'); }
}
export function errorResponse(error:unknown) {
  if(error instanceof ZodError) return NextResponse.json({error:{code:'INVALID_PARAMETERS',message:'Check the selected filters and parameters.',details:error.issues.map(x=>({path:x.path.join('.'),message:x.message}))}},{status:400});
  if(error instanceof Error && 'code' in error && 'status' in error) {
    const e=error as Error & {code:string;status:number};
    if(Number.isInteger(e.status)&&e.status>=400&&e.status<=599) return NextResponse.json({error:{code:e.code,message:e.message}},{status:e.status});
  }
  return NextResponse.json({error:{code:'INTERNAL_ERROR',message:'The request could not be completed. Please try again.'}},{status:500});
}
