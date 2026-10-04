import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../dist/index.js';

test('Cloud API - Health Endpoint', async () => {
  const req = new Request('http://localhost/health');
  const res = await app.fetch(req);
  assert.equal(res.status, 200);
  const data = (await res.json()) as { status: string; service: string };
  assert.equal(data.status, 'ok');
  assert.equal(data.service, 'Voxel+ Cloud API');
});

test('Cloud API - Unauthenticated Request Rejection', async () => {
  const req = new Request('http://localhost/api/library');
  const res = await app.fetch(req);
  assert.equal(res.status, 401);
  const data = (await res.json()) as { code: string };
  assert.equal(data.code, 'UNAUTHORIZED');
});

test('Cloud API - Public Profiles Route', async () => {
  const req = new Request('http://localhost/api/public/profiles');
  const res = await app.fetch(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(Array.isArray(data));
});
