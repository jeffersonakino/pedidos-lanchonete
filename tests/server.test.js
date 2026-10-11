const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { afterEach, beforeEach, test } = require('node:test');
const { createApp } = require('../server');

let app;
let server;
let databaseDirectory;
let baseUrl;

beforeEach(async () => {
  databaseDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pedidos-lanchonete-'));
  app = createApp({ databasePath: path.join(databaseDirectory, 'orders.sqlite') });
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  app.locals.db.close();
  fs.rmSync(databaseDirectory, { recursive: true, force: true });
});

test('creates, lists, updates, and deletes an order', async () => {
  const createResponse = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerName: 'Cliente Teste',
      customerPhone: '(11) 90000-0000',
      items: ['1 X-Burger', '1 Suco'],
      status: 'recebido',
      value: 'R$ 25,00',
      notes: 'Sem cebola'
    })
  });
  assert.equal(createResponse.status, 201);
  const createdOrder = await createResponse.json();
  assert.equal(createdOrder.customerName, 'Cliente Teste');
  assert.deepEqual(createdOrder.items, ['1 X-Burger', '1 Suco']);

  const listResponse = await fetch(`${baseUrl}/api/orders`);
  assert.deepEqual(await listResponse.json(), [createdOrder]);

  const updateResponse = await fetch(`${baseUrl}/api/orders/${createdOrder.id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'em-preparo' })
  });
  assert.equal((await updateResponse.json()).status, 'em-preparo');

  const deleteResponse = await fetch(`${baseUrl}/api/orders/${createdOrder.id}`, { method: 'DELETE' });
  assert.equal(deleteResponse.status, 204);
  assert.deepEqual(await (await fetch(`${baseUrl}/api/orders`)).json(), []);
});

test('rejects invalid orders and unknown order updates', async () => {
  const invalidResponse = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customerName: '', items: [], status: 'cancelado' })
  });
  assert.equal(invalidResponse.status, 400);
  assert.match((await invalidResponse.json()).error, /nome de cliente/i);

  const missingOrderResponse = await fetch(`${baseUrl}/api/orders/missing/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'pronto' })
  });
  assert.equal(missingOrderResponse.status, 404);
});

test('imports legacy browser orders once into an empty database', async () => {
  const response = await fetch(`${baseUrl}/api/orders/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orders: [{
        id: 'legacy-order-1',
        customerName: 'Pedido antigo',
        items: ['1 Café'],
        status: 'pronto',
        createdAt: '2025-01-01T12:00:00.000Z'
      }]
    })
  });
  assert.equal(response.status, 201);
  const [importedOrder] = await response.json();
  assert.equal(importedOrder.id, 'legacy-order-1');
  assert.equal(importedOrder.customerName, 'Pedido antigo');

  const repeatedResponse = await fetch(`${baseUrl}/api/orders/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orders: [] })
  });
  assert.equal(repeatedResponse.status, 409);
});

test('deletes all orders and reports the number removed', async () => {
  const createOrder = (customerName) => fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customerName, items: ['1 Café'] })
  });
  assert.equal((await createOrder('Cliente 1')).status, 201);
  assert.equal((await createOrder('Cliente 2')).status, 201);

  const deleteResponse = await fetch(`${baseUrl}/api/orders`, { method: 'DELETE' });
  assert.deepEqual(await deleteResponse.json(), { deleted: 2 });
  assert.deepEqual(await (await fetch(`${baseUrl}/api/orders`)).json(), []);
});
