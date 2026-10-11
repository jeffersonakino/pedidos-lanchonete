# Pedidos da Lanchonete

Painel responsivo para cadastrar pedidos e acompanhar o preparo. A interface usa HTML, CSS e JavaScript; o servidor Node.js fornece uma API Express e armazena os dados em SQLite.

## Funcionalidades

- Cadastro de cliente, telefone, itens, valor, observações e status inicial.
- Consulta, busca e filtro de pedidos.
- Atualização de status entre recebido, em preparo e pronto.
- Exclusão individual ou de todos os pedidos.
- Persistência compartilhada entre navegadores que acessam o mesmo servidor.
- Migração inicial dos pedidos que ainda estejam salvos no `localStorage` do navegador.
- Banco de dados criado automaticamente em `data/orders.sqlite`.

## Requisitos

- Node.js 20 ou superior.
- npm.

## Executar

Na pasta do projeto, instale as dependências e inicie o servidor:

```bash
npm install
npm start
```

Abra `http://localhost:3000` no navegador. O servidor atende somente neste computador por padrão. A porta pode ser alterada pela variável de ambiente `PORT`; o caminho do banco pode ser alterado com `DB_PATH`.

## API

- `GET /api/orders` — lista pedidos.
- `POST /api/orders` — cadastra um pedido.
- `POST /api/orders/import` — importa pedidos locais antigos quando o banco ainda está vazio.
- `PATCH /api/orders/:id/status` — altera o status.
- `DELETE /api/orders/:id` — exclui um pedido.
- `DELETE /api/orders` — exclui todos os pedidos.

## Testes

```bash
npm test
```

## Observações

O banco fica no computador onde o servidor está rodando e persiste entre reinicializações. Esta versão ainda não inclui login, permissões por funcionário, cópia de segurança automática ou sincronização em nuvem; não exponha o servidor à internet sem implementar essas proteções.
