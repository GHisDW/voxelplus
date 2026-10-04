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

test('Cloud API - Unauthenticated Request Rejection on Protected Endpoints', async () => {
  const protectedRoutes = [
    { url: 'http://localhost/api/library', method: 'GET' },
    { url: 'http://localhost/api/profile', method: 'GET' },
    { url: 'http://localhost/api/sync', method: 'GET' },
    { url: 'http://localhost/api/cosmetics', method: 'GET' },
    { url: 'http://localhost/api/cosmetics/select', method: 'PUT' },
    { url: 'http://localhost/api/achievements', method: 'GET' },
    { url: 'http://localhost/api/achievements/event', method: 'POST' },
    { url: 'http://localhost/api/avatar/upload', method: 'POST' },
    { url: 'http://localhost/api/owner/check', method: 'GET' },
    { url: 'http://localhost/api/owner/users', method: 'GET' },
    { url: 'http://localhost/api/owner/bulk', method: 'DELETE' }
  ];

  for (const route of protectedRoutes) {
    const req = new Request(route.url, { method: route.method });
    const res = await app.fetch(req);
    assert.equal(res.status, 401, `Route ${route.method} ${route.url} should be 401 UNAUTHORIZED`);
    const data = (await res.json()) as { code: string };
    assert.equal(data.code, 'UNAUTHORIZED');
  }
});

test('Cloud API - Public Profiles Route', async () => {
  const req = new Request('http://localhost/api/public/profiles');
  const res = await app.fetch(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(Array.isArray(data));
});

test('Cloud API - Public Cosmetics Catalog Route', async () => {
  const req = new Request('http://localhost/api/cosmetics/catalog');
  const res = await app.fetch(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(Array.isArray(data));
});

test('Cloud API - Public Achievements Catalog Route', async () => {
  const req = new Request('http://localhost/api/achievements/catalog');
  const res = await app.fetch(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(Array.isArray(data));
});

test('Cloud API - Owner Route Authorization Boundaries', async () => {
  // Test with invalid token - must reject with 401 (if db configured) or 503 (if unconfigured)
  const req = new Request('http://localhost/api/owner/users', {
    headers: {
      'Authorization': 'Bearer invalid-mock-token-xyz'
    }
  });
  const res = await app.fetch(req);
  assert.ok(res.status === 401 || res.status === 503, `Expected 401 or 503, got ${res.status}`);
});

test('Cloud API - Bulk Deletion Protected Flow Rejection', async () => {
  // Request without auth token
  const req = new Request('http://localhost/api/owner/bulk', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmPhrase: 'DELETE_ALL_ACCOUNTS_PERMANENTLY' })
  });
  const res = await app.fetch(req);
  assert.equal(res.status, 401);
});
