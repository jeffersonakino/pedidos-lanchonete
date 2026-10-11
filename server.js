const express = require('express');
const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const STATUSES = ['recebido', 'em-preparo', 'pronto'];
const ROOT_DIR = __dirname;
const DEFAULT_DATABASE_PATH = path.join(ROOT_DIR, 'data', 'orders.sqlite');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function normalizeOrder(input, { preserveMetadata = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpError(400, 'Os dados do pedido são inválidos.');
  }

  const customerName = typeof input.customerName === 'string' ? input.customerName.trim() : '';
  const customerPhone = typeof input.customerPhone === 'string' ? input.customerPhone.trim() : '';
  const value = typeof input.value === 'string' ? input.value.trim() : '';
  const notes = typeof input.notes === 'string' ? input.notes.trim() : '';

  if (!customerName || customerName.length > 120) {
    throw new HttpError(400, 'Informe um nome de cliente com até 120 caracteres.');
  }
  if (customerPhone.length > 40 || value.length > 40 || notes.length > 2000) {
    throw new HttpError(400, 'Telefone, valor ou observações excedem o limite permitido.');
  }
  if (!Array.isArray(input.items) || input.items.length === 0 || input.items.length > 100) {
    throw new HttpError(400, 'O pedido deve conter entre 1 e 100 itens.');
  }

  const items = input.items.map((item) => {
    if (typeof item !== 'string' || !item.trim() || item.trim().length > 200) {
      throw new HttpError(400, 'Cada item deve ter entre 1 e 200 caracteres.');
    }
    return item.trim();
  });

  const status = input.status || 'recebido';
  if (!STATUSES.includes(status)) {
    throw new HttpError(400, 'O status informado não é válido.');
  }

  let id = randomUUID();
  let createdAt = new Date().toISOString();
  if (preserveMetadata) {
    if (input.id !== undefined) {
      if (typeof input.id !== 'string' || !input.id.trim() || input.id.length > 100) {
        throw new HttpError(400, 'O identificador do pedido é inválido.');
      }
      id = input.id;
    }
    if (input.createdAt !== undefined) {
      if (typeof input.createdAt !== 'string' || !Number.isFinite(Date.parse(input.createdAt))) {
        throw new HttpError(400, 'A data de criação do pedido é inválida.');
      }
      createdAt = new Date(input.createdAt).toISOString();
    }
  }

  return {
    id,
    customerName,
    customerPhone,
    items,
    status,
    value: value || 'Valor não informado',
    notes,
    createdAt
  };
}

function createApp({ databasePath = DEFAULT_DATABASE_PATH } = {}) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new Database(databasePath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL DEFAULT '',
      items_json TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('recebido', 'em-preparo', 'pronto')),
      value TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    )
  `);

  const listOrders = db.prepare(`
    SELECT id, customer_name, customer_phone, items_json, status, value, notes, created_at
    FROM orders
    ORDER BY created_at DESC, rowid DESC
  `);
  const findOrder = db.prepare(`
    SELECT id, customer_name, customer_phone, items_json, status, value, notes, created_at
    FROM orders
    WHERE id = ?
  `);
  const insertOrder = db.prepare(`
    INSERT INTO orders (id, customer_name, customer_phone, items_json, status, value, notes, created_at)
    VALUES (@id, @customerName, @customerPhone, @itemsJson, @status, @value, @notes, @createdAt)
  `);
  const toOrder = (row) => ({
    id: row.id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    items: JSON.parse(row.items_json),
    status: row.status,
    value: row.value,
    notes: row.notes,
    createdAt: row.created_at
  });
  const insertNormalizedOrder = (order) => insertOrder.run({
    id: order.id,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    itemsJson: JSON.stringify(order.items),
    status: order.status,
    value: order.value,
    notes: order.notes,
    createdAt: order.createdAt
  });

  const app = express();
  app.disable('x-powered-by');
  app.locals.db = db;
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/orders', (_request, response) => {
    response.json(listOrders.all().map(toOrder));
  });

  app.post('/api/orders', (request, response) => {
    const order = normalizeOrder(request.body);
    insertNormalizedOrder(order);
    response.status(201).json(toOrder(findOrder.get(order.id)));
  });

  app.post('/api/orders/import', (request, response) => {
    const importedOrders = request.body?.orders;
    if (!Array.isArray(importedOrders) || importedOrders.length > 1000) {
      throw new HttpError(400, 'A importação deve conter no máximo 1.000 pedidos.');
    }

    const orders = importedOrders.map((order) => normalizeOrder(order, { preserveMetadata: true }));
    const uniqueIds = new Set(orders.map((order) => order.id));
    if (uniqueIds.size !== orders.length) {
      throw new HttpError(400, 'A importação contém identificadores duplicados.');
    }
    if (db.prepare('SELECT COUNT(*) AS total FROM orders').get().total > 0) {
      throw new HttpError(409, 'O banco já contém pedidos; a importação inicial não foi aplicada.');
    }

    const importTransaction = db.transaction((items) => {
      items.forEach(insertNormalizedOrder);
    });
    importTransaction(orders);
    response.status(201).json(listOrders.all().map(toOrder));
  });

  app.patch('/api/orders/:id/status', (request, response) => {
    const { status } = request.body || {};
    if (!STATUSES.includes(status)) {
      throw new HttpError(400, 'O status informado não é válido.');
    }

    const result = db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, request.params.id);
    if (result.changes === 0) {
      throw new HttpError(404, 'Pedido não encontrado.');
    }
    response.json(toOrder(findOrder.get(request.params.id)));
  });

  app.delete('/api/orders/:id', (request, response) => {
    const result = db.prepare('DELETE FROM orders WHERE id = ?').run(request.params.id);
    if (result.changes === 0) {
      throw new HttpError(404, 'Pedido não encontrado.');
    }
    response.status(204).end();
  });

  app.delete('/api/orders', (_request, response) => {
    const result = db.prepare('DELETE FROM orders').run();
    response.json({ deleted: result.changes });
  });

  app.get(['/', '/index.html'], (_request, response) => {
    response.sendFile(path.join(ROOT_DIR, 'index.html'));
  });
  app.get('/styles.css', (_request, response) => {
    response.sendFile(path.join(ROOT_DIR, 'styles.css'));
  });
  app.get('/script.js', (_request, response) => {
    response.sendFile(path.join(ROOT_DIR, 'script.js'));
  });
  app.use('/public', express.static(path.join(ROOT_DIR, 'public')));

  app.use('/api', (_request, response) => {
    response.status(404).json({ error: 'Rota da API não encontrada.' });
  });
  app.use((request, response) => {
    response.status(404).send('Página não encontrada.');
  });
  app.use((error, _request, response, _next) => {
    const status = error instanceof HttpError ? error.status : (error.status || 500);
    if (status >= 500) {
      console.error('Erro ao processar requisição:', error);
    }
    const message = error instanceof HttpError
      ? error.message
      : status === 400
        ? 'O corpo da requisição não contém JSON válido.'
        : status === 413
          ? 'A requisição excede o tamanho permitido.'
          : 'Erro interno ao processar a requisição.';
    response.status(status).json({ error: message });
  });

  return app;
}

function startServer() {
  const port = Number(process.env.PORT || 3000);
  const app = createApp();
  const server = app.listen(port, '127.0.0.1', () => {
    console.log(`Aplicação disponível em http://localhost:${port}`);
    console.log(`Banco SQLite: ${process.env.DB_PATH || DEFAULT_DATABASE_PATH}`);
  });
  server.on('close', () => app.locals.db.close());
}

if (require.main === module) {
  startServer();
}

module.exports = { createApp };
