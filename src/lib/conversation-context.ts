import {z} from 'zod';
import {querySchema} from './contracts';
import {decisionScopeSchema} from './decision-contracts';
import {validateDecisionScope} from './decision-briefs';
import {queryMetrics} from './analytics';
import type {ConversationStore} from './conversations';

const contextSchema=z.object({brief:decisionScopeSchema.nullable(),context:querySchema.optional()}).strict();

/** Save explicit UI handoffs before navigation, independently of an AI turn. */
export function updateConversationContext(store:ConversationStore,id:string,input:unknown){
  const body=contextSchema.parse(input);
  const brief=body.brief===null?null:validateDecisionScope(body.brief);
  // Validate both inputs before changing either part of the conversation.
  const result=body.context?queryMetrics(body.context):null;
  store.ensureSession(id);
  const lock=store.acquireLock(id);
  try{
    if(result){store.putResult(id,result);store.setScope(id,result.query,'manual');}
    store.setBriefScope(id,brief);
    return {brief,result};
  }finally{store.releaseLock(id,lock);}
}
