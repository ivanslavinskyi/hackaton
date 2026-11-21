import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ConversationStore, DATA_RELEASE } from '../src/lib/conversations';
import { queryMetrics } from '../src/lib/analytics';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const pythonQuery = { seriesIds: ['itboard_monitor_python_open_ads'], mode: 'history' as const, measure: 'share' as const, geography: 'CH' };

test('original question and twenty follow-ups survive reopening; first exact result remains retrievable', () => {
  const folder = mkdtempSync(path.join(tmpdir(), 'market-radar-conversation-test-'));
  const filename = path.join(folder, 'conversation.sqlite');
  let store = new ConversationStore(filename);
  try {
    store.ensureSession(A);
    const first = store.appendTurn(A, 'user', 'How has Python changed in Switzerland?');
    const result = queryMetrics(pythonQuery);
    store.putResult(A, result);
    store.setScope(A, result.query, 'manual');
    const answer = store.appendTurn(A, 'assistant', 'The original Python comparison.', { resultIds: [result.id] });
    for (let i = 1; i <= 20; i++) {
      store.appendTurn(A, 'user', `Follow-up ${i}: keep this original message intact.`);
      store.appendTurn(A, 'assistant', `Clarification ${i}.`);
    }
    assert.equal(store.getTurns(A).length, 42);
    store.close();
    store = new ConversationStore(filename);
    assert.equal(store.getTurns(A)[0].content, 'How has Python changed in Switzerland?');
    assert.equal(store.getTurns(A).at(-2)?.content, 'Follow-up 20: keep this original message intact.');
    const restored = store.inspectContext(A, { turnIds: [first.id, answer.id] });
    assert.equal(restored.results[0].id, result.id);
    assert.deepEqual(restored.results[0].query, result.query);
    assert.deepEqual(restored.results[0].series, result.series);
    assert.deepEqual(store.getScope(A), result.query);
    assert.equal(restored.results[0].series[0].points.at(-1)?.count, 188);
  } finally {
    store.close();
    assert.equal(path.dirname(folder), tmpdir());
    assert.ok(path.basename(folder).startsWith('market-radar-conversation-test-'));
    rmSync(folder, { recursive: true, force: true });
  }
});

test('sessions cannot retrieve another conversation, result, or foreign turn ID', () => {
  const store = new ConversationStore(':memory:');
  try {
    store.ensureSession(A); store.ensureSession(B);
    const result = queryMetrics(pythonQuery);
    store.putResult(A, result);
    const privateTurn = store.appendTurn(A, 'user', 'Only session A should see this.');
    store.appendTurn(A, 'assistant', 'Private analysis', { resultIds: [result.id] });
    assert.deepEqual(store.getResults(B, [result.id]), []);
    assert.deepEqual(store.getTurns(B), []);
    assert.deepEqual(store.inspectContext(B, { turnIds: [privateTurn.id] }).turns, []);
    assert.throws(() => store.appendTurn(B, 'assistant', 'Borrowed citation', { resultIds: [result.id] }), /unavailable result/);
    assert.throws(() => store.getTurns("' OR 1=1 --"), /Invalid conversation/);
  } finally { store.close(); }
});

test('session lock prevents simultaneous turns and does not let an old token release a new lock', () => {
  const store = new ConversationStore(':memory:');
  try {
    store.ensureSession(A);
    const first = store.acquireLock(A);
    assert.throws(() => store.acquireLock(A), /already running/);
    store.releaseLock(A, 'wrong-token');
    assert.throws(() => store.acquireLock(A), /already running/);
    store.releaseLock(A, first);
    const second = store.acquireLock(A);
    store.releaseLock(A, first);
    assert.throws(() => store.acquireLock(A), /already running/);
    store.releaseLock(A, second);
  } finally { store.close(); }
});

test('conversation pins its data release and rejects incompatible stored result versions', () => {
  const store = new ConversationStore(':memory:');
  try {
    store.ensureSession(A, DATA_RELEASE);
    assert.throws(() => store.ensureSession(A, 'different-release'), /data release changed/);
    const result = queryMetrics(pythonQuery);
    assert.throws(() => store.putResult(A, { ...result, release: 'different-release' }), /different data release/);
  } finally { store.close(); }
});
