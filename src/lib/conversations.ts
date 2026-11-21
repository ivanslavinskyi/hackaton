import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { AnalyticsResult, AnalystAnswer, ChatTurn, Evidence, QuerySpec } from './contracts';
import {isEvidenceEnabled,isQueryEnabled,isResultEnabled} from './source-policy';
import {decisionScopeSchema,type DecisionScope} from './decision-contracts';

const SESSION_LIFETIME = 48 * 60 * 60 * 1000;
export const DATA_RELEASE = '0.6.0-local';

export class ConversationError extends Error {
  status: number;
  constructor(public code: string, message: string) {
    super(message); this.name = 'ConversationError';
    this.status = code === 'SESSION_BUSY' ? 409 : code === 'SESSION_CAPACITY' ? 503 : 400;
  }
}

type TurnRow = {
  id: number; role: 'user' | 'assistant'; content: string; created_at: string;
  answer_json: string | null; result_ids_json: string; error: string | null;
};
type SessionRow = { id: string; release: string; scope_json: string | null; updated_at: number };

function assertSessionId(id: string) {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new ConversationError('INVALID_SESSION', 'Invalid conversation session.');
}
function readTurn(row: TurnRow): ChatTurn {
  return {
    id: row.id, role: row.role, content: row.content, createdAt: row.created_at,
    resultIds: JSON.parse(row.result_ids_json),
    ...(row.answer_json ? { answer: JSON.parse(row.answer_json) as AnalystAnswer } : {}),
    ...(row.error ? { error: row.error } : {}),
  };
}

/** Private conversations never share the read-only public analytics file. */
export class ConversationStore {
  private db: DatabaseSync;
  constructor(filename: string) {
    if (filename !== ':memory:') mkdirSync(path.dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    this.db.exec(`
      PRAGMA foreign_keys=ON;
      PRAGMA busy_timeout=5000;
      PRAGMA journal_mode=WAL;
      PRAGMA synchronous=NORMAL;
      PRAGMA wal_autocheckpoint=100;
      PRAGMA journal_size_limit=1048576;
      PRAGMA max_page_count=32768;
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY, release TEXT NOT NULL, created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL, scope_json TEXT, lock_until INTEGER NOT NULL DEFAULT 0, lock_token TEXT
      );
      CREATE TABLE IF NOT EXISTS turns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK(role IN ('user','assistant')), content TEXT NOT NULL,
        created_at TEXT NOT NULL, answer_json TEXT, result_ids_json TEXT NOT NULL, error TEXT
      );
      CREATE INDEX IF NOT EXISTS turns_session ON turns(session_id,id);
      CREATE TABLE IF NOT EXISTS conversation_results (
        session_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        result_id TEXT NOT NULL, created_at INTEGER NOT NULL, result_json TEXT NOT NULL,
        PRIMARY KEY(session_id,result_id)
      );
      CREATE TABLE IF NOT EXISTS conversation_evidence (
        session_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        evidence_id TEXT NOT NULL, evidence_json TEXT NOT NULL,
        PRIMARY KEY(session_id,evidence_id)
      );
      CREATE TABLE IF NOT EXISTS scope_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL, origin TEXT NOT NULL, scope_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS conversation_tool_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL, name TEXT NOT NULL, arguments_json TEXT NOT NULL,
        outcome_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS conversation_briefs (
        session_id TEXT PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
        scope_json TEXT NOT NULL
      );
    `);
  }

  ensureSession(id: string, release = DATA_RELEASE) {
    assertSessionId(id);
    const now = Date.now();
    this.db.prepare('DELETE FROM conversations WHERE updated_at < ? AND lock_until < ?').run(now - SESSION_LIFETIME, now);
    const existing = this.db.prepare('SELECT * FROM conversations WHERE id=?').get(id) as SessionRow | undefined;
    if (existing && existing.release !== release) {
      throw new ConversationError('DATA_RELEASE_CHANGED', 'The data release changed. Start a new conversation to use the new release.');
    }
    if (!existing) {
      const count = this.db.prepare('SELECT count(*) AS n FROM conversations').get() as { n: number };
      if (count.n >= 100) throw new ConversationError('SESSION_CAPACITY', 'The conversation store is at capacity. Please try again later.');
      this.db.prepare('INSERT INTO conversations(id,release,created_at,updated_at) VALUES(?,?,?,?)').run(id, release, now, now);
    } else {
      this.db.prepare('UPDATE conversations SET updated_at=? WHERE id=?').run(now, id);
    }
    return { id, release };
  }

  private session(id: string) {
    assertSessionId(id);
    const row = this.db.prepare('SELECT id,release,scope_json,updated_at FROM conversations WHERE id=?').get(id) as SessionRow | undefined;
    if (!row || row.updated_at < Date.now() - SESSION_LIFETIME) throw new ConversationError('SESSION_EXPIRED', 'This conversation expired. Start a new conversation.');
    return row;
  }

  acquireLock(id: string) {
    this.session(id);
    const token = randomBytes(16).toString('hex');
    const now = Date.now();
    const changed = this.db.prepare('UPDATE conversations SET lock_until=?,lock_token=? WHERE id=? AND lock_until < ?').run(now + 60_000, token, id, now);
    if (changed.changes !== 1) throw new ConversationError('SESSION_BUSY', 'An analysis is already running in this conversation.');
    return token;
  }

  releaseLock(id: string, token: string) {
    assertSessionId(id);
    this.db.prepare('UPDATE conversations SET lock_until=0,lock_token=NULL WHERE id=? AND lock_token=?').run(id, token);
  }

  getScope(id: string): QuerySpec | null {
    const row = this.session(id);
    const scope=row.scope_json ? JSON.parse(row.scope_json) as QuerySpec : null;
    return scope&&isQueryEnabled(scope)?scope:null;
  }

  getBriefScope(id:string):DecisionScope|null {
    this.session(id);
    const row=this.db.prepare('SELECT scope_json FROM conversation_briefs WHERE session_id=?').get(id) as {scope_json:string}|undefined;
    if(!row)return null;
    const parsed=decisionScopeSchema.safeParse(JSON.parse(row.scope_json));return parsed.success?parsed.data:null;
  }
  setBriefScope(id:string,scope:DecisionScope|null){
    this.session(id);
    if(scope===null){this.db.prepare('DELETE FROM conversation_briefs WHERE session_id=?').run(id);return;}
    const value=decisionScopeSchema.parse(scope);
    this.db.prepare('INSERT INTO conversation_briefs(session_id,scope_json) VALUES(?,?) ON CONFLICT(session_id) DO UPDATE SET scope_json=excluded.scope_json').run(id,JSON.stringify(value));
  }

  setScope(id: string, scope: QuerySpec, origin: 'manual' | 'analyst' | 'restored' = 'analyst') {
    this.session(id);
    if(!isQueryEnabled(scope))throw new ConversationError('SOURCE_REMOVED','This source is no longer available in the workspace.');
    const json = JSON.stringify(scope);
    const previous = this.getScope(id);
    if (JSON.stringify(previous) !== json) {
      this.db.prepare('INSERT INTO scope_events(session_id,created_at,origin,scope_json) VALUES(?,?,?,?)').run(id, new Date().toISOString(), origin, json);
    }
    this.db.prepare('UPDATE conversations SET scope_json=?,updated_at=? WHERE id=?').run(json, Date.now(), id);
  }

  appendTurn(id: string, role: 'user' | 'assistant', content: string, options: { answer?: AnalystAnswer; resultIds?: string[]; error?: string } = {}) {
    this.session(id);
    if (role === 'user') {
      const count = this.db.prepare("SELECT count(*) AS n FROM turns WHERE session_id=? AND role='user'").get(id) as { n: number };
      if (count.n >= 100) throw new ConversationError('SESSION_LIMIT', 'This conversation has reached 100 questions. Start a new conversation; existing history is preserved.');
    }
    const resultIds = options.resultIds ?? [];
    if (resultIds.some(resultId => {
      const row=this.db.prepare('SELECT result_json FROM conversation_results WHERE session_id=? AND result_id=?').get(id,resultId) as {result_json:string}|undefined;
      return !row||!isResultEnabled(JSON.parse(row.result_json) as AnalyticsResult);
    })) {
      throw new ConversationError('UNKNOWN_RESULT', 'A conversation message referenced an unavailable result.');
    }
    const createdAt = new Date().toISOString();
    const write = this.db.prepare('INSERT INTO turns(session_id,role,content,created_at,answer_json,result_ids_json,error) VALUES(?,?,?,?,?,?,?)')
      .run(id, role, content, createdAt, options.answer ? JSON.stringify(options.answer) : null, JSON.stringify(resultIds), options.error ?? null);
    this.db.prepare('UPDATE conversations SET updated_at=? WHERE id=?').run(Date.now(), id);
    return { id: Number(write.lastInsertRowid), role, content, createdAt, resultIds, ...options } as ChatTurn;
  }

  getTurns(id: string, limit = 200): ChatTurn[] {
    this.session(id);
    const bounded = Math.min(200, Math.max(1, Math.trunc(limit)));
    const rows = this.db.prepare('SELECT * FROM (SELECT * FROM turns WHERE session_id=? ORDER BY id DESC LIMIT ?) ORDER BY id').all(id, bounded) as TurnRow[];
    const availability=new Map<string,boolean>();
    const lookup=this.db.prepare('SELECT result_json FROM conversation_results WHERE session_id=? AND result_id=?');
    const available=(resultId:string)=>{
      if(!availability.has(resultId)){
        const row=lookup.get(id,resultId) as {result_json:string}|undefined;
        availability.set(resultId,Boolean(row&&isResultEnabled(JSON.parse(row.result_json) as AnalyticsResult)));
      }
      return availability.get(resultId)!;
    };
    return rows.map(readTurn).map(turn=>{
      const resultIds=[...turn.resultIds,...(turn.answer?.findings.flatMap(finding=>finding.resultIds)||[]),...(turn.answer?.views.map(view=>view.resultId)||[])];
      const evidenceIds=turn.answer?.findings.flatMap(finding=>finding.evidenceIds)||[];
      if(resultIds.some(resultId=>!available(resultId))||evidenceIds.some(id=>!isEvidenceEnabled({id}))){
        // Preserve original stored history, but never feed removed evidence back
        // into the interface, the turn ledger or an exact-context recall tool.
        return {id:turn.id,role:turn.role,createdAt:turn.createdAt,resultIds:[],error:'SOURCE_REMOVED',
          content:'This earlier answer references a source that is no longer available. Ask again to use the current dataset.'};
      }
      return turn;
    });
  }

  putResult(id: string, result: AnalyticsResult) {
    const session = this.session(id);
    if (result.release !== session.release) throw new ConversationError('DATA_RELEASE_CHANGED', 'The result belongs to a different data release.');
    if(!isResultEnabled(result))throw new ConversationError('SOURCE_REMOVED','This source is no longer available in the workspace.');
    this.db.prepare(`INSERT INTO conversation_results(session_id,result_id,created_at,result_json) VALUES(?,?,?,?)
      ON CONFLICT(session_id,result_id) DO UPDATE SET result_json=excluded.result_json,created_at=excluded.created_at`)
      .run(id, result.id, Date.now(), JSON.stringify(result));
  }

  getResults(id: string, ids?: string[]): AnalyticsResult[] {
    this.session(id);
    if (ids && !ids.length) return [];
    let rows: { result_json: string }[];
    if (ids) {
      if (ids.length > 32) throw new ConversationError('INVALID_QUERY', 'Request at most 32 stored results.');
      rows = this.db.prepare(`SELECT result_json FROM conversation_results WHERE session_id=? AND result_id IN (${ids.map(() => '?').join(',')}) ORDER BY created_at`)
        .all(id, ...ids) as { result_json: string }[];
    } else {
      rows = this.db.prepare('SELECT result_json FROM conversation_results WHERE session_id=? ORDER BY created_at DESC LIMIT 12').all(id) as { result_json: string }[];
    }
    return rows.map(row => JSON.parse(row.result_json) as AnalyticsResult).filter(isResultEnabled);
  }

  putEvidence(id: string, evidence: Evidence[]) {
    this.session(id);
    if(evidence.some(item=>!isEvidenceEnabled(item)))throw new ConversationError('SOURCE_REMOVED','This source is no longer available in the workspace.');
    for (const item of evidence) this.db.prepare('INSERT OR REPLACE INTO conversation_evidence(session_id,evidence_id,evidence_json) VALUES(?,?,?)')
      .run(id, item.id, JSON.stringify(item));
  }

  getEvidence(id: string): Evidence[] {
    this.session(id);
    return (this.db.prepare('SELECT evidence_json FROM conversation_evidence WHERE session_id=? LIMIT 30').all(id) as { evidence_json: string }[])
      .map(row => JSON.parse(row.evidence_json) as Evidence).filter(isEvidenceEnabled);
  }

  recordTool(id: string, name: string, args: string, outcome: { error?: string; message?: string; resultId?: string; evidenceIds?: string[] }) {
    this.session(id);
    this.db.prepare('INSERT INTO conversation_tool_events(session_id,created_at,name,arguments_json,outcome_json) VALUES(?,?,?,?,?)')
      .run(id, new Date().toISOString(), name.slice(0, 100), args.slice(0, 12_000), JSON.stringify(outcome));
  }

  inspectContext(id: string, input: { search?: string; turnIds?: number[]; limit?: number } = {}) {
    this.session(id);
    const limit = Math.min(8, Math.max(1, input.limit ?? 6));
    let turns = this.getTurns(id);
    if (input.turnIds?.length) {
      const wanted = new Set(input.turnIds);
      turns = turns.filter(turn => wanted.has(turn.id));
    } else if (input.search?.trim()) {
      const words = input.search.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
      const ranked = turns.map(turn => ({ turn, score: words.reduce((n, word) => n + (turn.content.toLocaleLowerCase().includes(word) ? 1 : 0), 0) }))
        .filter(row => row.score > 0).sort((a, b) => b.score - a.score || a.turn.id - b.turn.id);
      const matches = new Set(ranked.slice(0, Math.max(1, Math.floor(limit / 2))).map(row => row.turn.id));
      const adjacent = new Set<number>();
      for (const [index, turn] of turns.entries()) if (matches.has(turn.id)) {
        adjacent.add(turn.id);
        if (turn.role === 'user' && turns[index + 1]?.role === 'assistant') adjacent.add(turns[index + 1].id);
        if (turn.role === 'assistant' && turns[index - 1]?.role === 'user') adjacent.add(turns[index - 1].id);
      }
      turns = turns.filter(turn => adjacent.has(turn.id));
    }
    const matchingCount = turns.length;
    turns = turns.slice(0, limit);
    const resultIds = [...new Set(turns.flatMap(turn => turn.resultIds))].slice(0, 8);
    const results = this.getResults(id, resultIds);
    const events = (this.db.prepare('SELECT id,created_at,origin,scope_json FROM scope_events WHERE session_id=? ORDER BY id DESC LIMIT 12').all(id) as { id:number; created_at:string; origin:string; scope_json:string }[])
      .map(row => ({ id: row.id, at: row.created_at, origin: row.origin, query: JSON.parse(row.scope_json) as QuerySpec })).filter(event=>isQueryEnabled(event.query));
    return { turns, results, activeScope: this.getScope(id), scopeEvents: events, matchingCount, hasMore: matchingCount > turns.length };
  }

  close() { this.db.close(); }
}

const stores = new Map<string, ConversationStore>();
export function getConversationStore() {
  const filename = process.env.MARKET_RADAR_SESSION_DB || path.join(process.cwd(), '.runtime', 'conversations.sqlite');
  let store = stores.get(filename);
  if (!store) { store = new ConversationStore(filename); stores.set(filename, store); }
  return store;
}
