import {NextRequest,NextResponse} from 'next/server';
import {getDecisionBrief} from '@/lib/decision-briefs';
import {decisionScopeSchema} from '@/lib/decision-contracts';
import {checkOrigin,errorResponse,rateLimit,readBody} from '@/lib/http';
export const runtime='nodejs';
export async function POST(req:NextRequest){
  try{
    checkOrigin(req);rateLimit(req);
    const brief=getDecisionBrief(decisionScopeSchema.parse(await readBody(req)));
    return NextResponse.json(brief,{headers:{'Cache-Control':'no-store'}});
  }catch(error){return errorResponse(error);}
}
