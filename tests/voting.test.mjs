import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

async function endpoint(path) {
  const hashSource = readFileSync(new URL('../src/lib/credentials.ts', import.meta.url), 'utf8').replace('export async', 'async');
  const source = readFileSync(new URL(`../src/pages/api/polls/${path}`, import.meta.url), 'utf8')
    .replace('import { env } from "cloudflare:workers";', 'const env = globalThis.testEnv;')
    .replace(/import \{ hashCredential \} from .*;/, hashSource);
  return import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`);
}

test('API: validación, participantes, estados y voto único', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(readFileSync(new URL('../migrations/0001_initial_schema.sql', import.meta.url), 'utf8'));
  const wrapper = {
    prepare(sql) {
      const statement = db.prepare(sql);
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        async first() { return statement.get(...args) ?? null; },
        async run() { return { meta: { changes: Number(statement.run(...args).changes) } }; }
      };
    },
    async batch(statements) {
      db.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        db.exec('COMMIT');
        return results;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    }
  };
  globalThis.testEnv = { DB: wrapper, ADMIN_KEY: 'test-key', QR_SECRET: 'test-qr-secret' };
  const create = await endpoint('index.ts');
  const manage = await endpoint('[code]/manage.ts');
  const votes = await endpoint('[code]/votes.ts');
  const enter = await endpoint('[code]/enter.ts');
  const call = async (api, body, code = '', key = 'test-key') => {
    const headers = { 'Content-Type': 'application/json', 'x-admin-key': key };
    if (api === votes) {
      const expires = Math.floor(Date.now() / 1000) + 600;
      const hmacKey = await crypto.subtle.importKey('raw', new TextEncoder().encode('test-qr-secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const signature = Buffer.from(await crypto.subtle.sign('HMAC', hmacKey, new TextEncoder().encode(`presence:${code}:${expires}`))).toString('base64url');
      headers.cookie = `votalive_${code}=${expires}.${signature}`;
    }
    return api.POST({ params: { code }, request: new Request('https://example.test/api', { method: 'POST', headers, body: JSON.stringify(body) }) });
  };
  const callWithoutPresence = (body, code) => votes.POST({ params: { code }, request: new Request('https://example.test/api', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  }) });
  assert.equal((await call(create, null)).status, 400);
  assert.equal((await call(create, [])).status, 400);
  assert.equal((await call(create, {}, '', 'wrong')).status, 401);
  assert.equal((await call(create, { question: 'Pregunta', options: ['Uno', 'uno'] })).status, 400);
  const response = await call(create, { question: '¿Quién será delegado?', options: ['Ana', 'Luis'] });
  assert.equal(response.status, 201);
  const { code } = await response.json();
  assert.match(code, /^[A-F0-9]{12}$/);
  assert.equal((await call(manage, { action: 'open' }, code)).status, 409);
  assert.equal((await call(manage, null, code)).status, 400);
  const participants = await call(manage, { action: 'participants', count: 2 }, code);
  assert.equal(participants.status, 200);
  const { credentials } = await participants.json();
  const expired = await call(enter, { slot: Math.floor(Date.now() / 30000) - 2, sig: 'stale' }, code);
  assert.equal(expired.status, 403, 'rechaza QR vencido');
  const optionId = db.prepare('SELECT id FROM options LIMIT 1').get().id;
  const vote = { optionId, credential: credentials[0] };
  assert.equal((await call(votes, vote, code)).status, 409, 'borrador no admite votos');
  assert.equal((await call(manage, { action: 'open' }, code)).status, 200);
  assert.equal((await call(manage, { action: 'participants', count: 1 }, code)).status, 409);
  assert.equal((await callWithoutPresence(vote, code)).status, 403, 'requiere cookie de presencia');
  assert.equal((await call(votes, { ...vote, credential: '0'.repeat(32) }, code)).status, 409);
  assert.equal((await call(votes, { ...vote, optionId: 'otra-opcion' }, code)).status, 409);
  assert.equal((await call(votes, vote, code)).status, 201);
  assert.equal((await call(votes, vote, code)).status, 409, 'no admite voto duplicado');
  assert.equal((await call(manage, { action: 'closed' }, code)).status, 200);
  assert.equal((await call(votes, { ...vote, credential: credentials[1] }, code)).status, 409);
  assert.equal((await call(manage, { action: 'open' }, code)).status, 409);
  assert.equal(db.prepare('SELECT count(*) AS n FROM votes').get().n, 1);
  assert.equal(db.prepare('SELECT count(*) AS n FROM participants').get().n, 2);
  globalThis.testEnv.DB = undefined;
  const previousError = console.error;
  console.error = () => {};
  try {
    assert.equal((await call(create, { question: 'Pregunta válida', options: ['A', 'B'] })).status, 500);
  } finally { console.error = previousError; }
  db.close();
  delete globalThis.testEnv;
});
