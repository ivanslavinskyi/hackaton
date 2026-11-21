import test from 'node:test';
import assert from 'node:assert/strict';
import {NextRequest} from 'next/server';
import {checkOrigin,readBody,sessionFor,HttpError,errorResponse} from '../src/lib/http';

test('cross-site requests cannot invoke server analytics or AI tools',()=>{
  assert.throws(()=>checkOrigin(new NextRequest('http://localhost:3000/api/analyst',{headers:{host:'localhost:3000',origin:'https://attacker.example','sec-fetch-site':'cross-site'}})),(e:unknown)=>e instanceof HttpError&&e.status===403);
  assert.throws(()=>checkOrigin(new NextRequest('http://localhost:3000/api/analyst',{headers:{host:'localhost:3000',origin:'https://attacker.example'}})),(e:unknown)=>e instanceof HttpError&&e.status===403);
  assert.doesNotThrow(()=>checkOrigin(new NextRequest('http://localhost:3000/api/analytics',{headers:{host:'localhost:3000',origin:'http://localhost:3000'}})));
});
test('body limit is enforced against actual bytes, not only a content-length header',async()=>{
  const req=new NextRequest('http://localhost:3000/api/analyst',{method:'POST',headers:{'content-type':'application/json','content-length':'1'},body:JSON.stringify({message:'x'.repeat(17000)})});
  await assert.rejects(()=>readBody(req),(e:unknown)=>e instanceof HttpError&&e.status===413);
});
test('cookie parsing only accepts a fixed high-entropy session identifier shape',()=>{
  const id=sessionFor(new NextRequest('http://localhost:3000'));
  assert.match(id,/^[a-f0-9]{64}$/);
  assert.equal(sessionFor(new NextRequest('http://localhost:3000',{headers:{cookie:`market_radar_session=${id}`}})),id);
  assert.notEqual(sessionFor(new NextRequest('http://localhost:3000',{headers:{cookie:'market_radar_session=../../other'}})),'../../other');
});
test('unexpected exceptions do not expose local paths or credentials',async()=>{
  const response=errorResponse(new Error('internal secret-path and credential-like value'));
  assert.equal(response.status,500);
  assert.equal((await response.json()).error.code,'INTERNAL_ERROR');
  assert.doesNotMatch(JSON.stringify(await errorResponse(new Error('secret')).json()),/secret/);
});
