const STORAGE_KEY = 'pedidos-lanchonete-v1';
const STATUS_ORDER = ['recebido', 'em-preparo', 'pronto'];

const form = document.getElementById('orderForm');
const ordersList = document.getElementById('ordersList');
const searchInput = document.getElementById('searchInput');
const statusFilter = document.getElementById('statusFilter');
const clearOrdersButton = document.getElementById('clearOrders');
const template = document.getElementById('orderCardTemplate');
const orderCount = document.getElementById('orderCount');
const todayLabel = document.getElementById('todayLabel');
const appMessage = document.getElementById('appMessage');

const summaryEls = {
  total: document.getElementById('totalOrders'),
  received: document.getElementById('receivedCount'),
  preparing: document.getElementById('preparingCount'),
  ready: document.getElementById('readyCount')
};

let orders = [];

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    }
  });
  const result = response.status === 204 ? null : await response.json();

  if (!response.ok) {
    const error = new Error(result?.error || 'Não foi possível concluir a operação.');
    error.status = response.status;
    throw error;
  }

  return result;
}

function showMessage(message) {
  appMessage.textContent = message;
  appMessage.classList.toggle('is-visible', Boolean(message));
}

function formatStatus(status) {
  const map = {
    recebido: 'Recebido',
    'em-preparo': 'Em preparo',
    pronto: 'Pronto'
  };

  return map[status] || status;
}

function getNextStatus(currentStatus) {
  const currentIndex = STATUS_ORDER.indexOf(currentStatus);

  if (currentIndex === -1 || currentIndex === STATUS_ORDER.length - 1) {
    return null;
  }

  return STATUS_ORDER[currentIndex + 1];
}

function updateSummary() {
  const total = orders.length;
  const received = orders.filter((order) => order.status === 'recebido').length;
  const preparing = orders.filter((order) => order.status === 'em-preparo').length;
  const ready = orders.filter((order) => order.status === 'pronto').length;

  summaryEls.total.textContent = total;
  summaryEls.received.textContent = received;
  summaryEls.preparing.textContent = preparing;
  summaryEls.ready.textContent = ready;
}

function renderOrders() {
  const searchValue = searchInput.value.trim().toLowerCase();
  const filterValue = statusFilter.value;
  const filteredOrders = orders.filter((order) => {
    const matchesSearch = order.customerName.toLowerCase().includes(searchValue);
    const matchesFilter = filterValue === 'todos' || order.status === filterValue;
    return matchesSearch && matchesFilter;
  });

  orderCount.textContent = `${filteredOrders.length} ${filteredOrders.length === 1 ? 'pedido' : 'pedidos'}`;

  if (!filteredOrders.length) {
    ordersList.innerHTML = `
      <div class="empty-state">
        <h3>Nenhum pedido encontrado</h3>
        <p>Adicione um novo pedido ou ajuste os filtros.</p>
      </div>
    `;
    return;
  }

  ordersList.innerHTML = '';

  filteredOrders.forEach((order) => {
    const fragment = template.content.cloneNode(true);
    const card = fragment.querySelector('.order-card');
    const statusBadge = fragment.querySelector('.status-badge');
    const customerName = fragment.querySelector('.customer-name');
    const phone = fragment.querySelector('.phone');
    const value = fragment.querySelector('.value');
    const itemsList = fragment.querySelector('.items-list');
    const notesText = fragment.querySelector('.notes-text');
    const advanceButton = fragment.querySelector('.advance-button');
    const deleteButton = fragment.querySelector('.delete-button');

    card.dataset.id = order.id;
    customerName.textContent = order.customerName;
    phone.textContent = order.customerPhone || 'Sem contato';
    value.textContent = order.value || 'Valor não informado';
    statusBadge.textContent = formatStatus(order.status);
    statusBadge.classList.add(`status-${order.status}`);

    order.items.forEach((item) => {
      const listItem = document.createElement('li');
      listItem.textContent = item;
      itemsList.appendChild(listItem);
    });

    notesText.textContent = order.notes || 'Sem observações';

    const nextStatus = getNextStatus(order.status);
    if (nextStatus) {
      advanceButton.textContent = `Avançar para ${formatStatus(nextStatus)}`;
      advanceButton.addEventListener('click', () => updateOrderStatus(order.id, nextStatus));
    } else {
      advanceButton.textContent = 'Pedido concluído';
      advanceButton.disabled = true;
      advanceButton.style.opacity = '0.6';
      advanceButton.style.cursor = 'default';
    }

    deleteButton.addEventListener('click', () => deleteOrder(order.id));
    ordersList.appendChild(fragment);
  });
}

async function updateOrderStatus(id, nextStatus) {
  try {
    const updatedOrder = await apiRequest(`/api/orders/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: nextStatus })
    });
    orders = orders.map((order) => order.id === id ? updatedOrder : order);
    showMessage('');
    updateSummary();
    renderOrders();
  } catch (error) {
    showMessage(`Não foi possível atualizar o status: ${error.message}`);
  }
}

async function deleteOrder(id) {
  try {
    await apiRequest(`/api/orders/${encodeURIComponent(id)}`, { method: 'DELETE' });
    orders = orders.filter((order) => order.id !== id);
    showMessage('');
    updateSummary();
    renderOrders();
  } catch (error) {
    showMessage(`Não foi possível excluir o pedido: ${error.message}`);
  }
}

async function handleSubmit(event) {
  event.preventDefault();

  const formData = new FormData(form);
  const orderItems = (formData.get('orderItems') || '').toString().trim();
  const items = orderItems.split(',').map((item) => item.trim()).filter(Boolean);

  if (!items.length) {
    showMessage('Informe ao menos um item para o pedido.');
    return;
  }

  const order = {
    customerName: (formData.get('customerName') || '').toString().trim(),
    customerPhone: (formData.get('customerPhone') || '').toString().trim(),
    items,
    status: (formData.get('status') || 'recebido').toString(),
    value: (formData.get('orderValue') || '').toString().trim(),
    notes: (formData.get('orderNotes') || '').toString().trim()
  };

  try {
    const createdOrder = await apiRequest('/api/orders', {
      method: 'POST',
      body: JSON.stringify(order)
    });
    orders = [createdOrder, ...orders];
    showMessage('');
    updateSummary();
    renderOrders();
    form.reset();
  } catch (error) {
    showMessage(`Não foi possível salvar o pedido: ${error.message}`);
  }
}

async function clearOrders() {
  if (!orders.length || !window.confirm('Deseja remover todos os pedidos?')) {
    return;
  }

  try {
    await apiRequest('/api/orders', { method: 'DELETE' });
    orders = [];
    showMessage('');
    updateSummary();
    renderOrders();
  } catch (error) {
    showMessage(`Não foi possível limpar os pedidos: ${error.message}`);
  }
}

async function initialize() {
  try {
    orders = await apiRequest('/api/orders');
    const savedOrders = localStorage.getItem(STORAGE_KEY);

    if (!orders.length && savedOrders) {
      const legacyOrders = JSON.parse(savedOrders);
      if (!Array.isArray(legacyOrders)) {
        throw new Error('Os pedidos antigos salvos neste navegador estão em formato inválido.');
      }

      if (legacyOrders.length) {
        try {
          orders = await apiRequest('/api/orders/import', {
            method: 'POST',
            body: JSON.stringify({ orders: legacyOrders })
          });
        } catch (error) {
          if (error.status !== 409) {
            throw error;
          }
          orders = await apiRequest('/api/orders');
        }
      }
      localStorage.removeItem(STORAGE_KEY);
    } else if (savedOrders) {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch (error) {
    showMessage(`Não foi possível carregar os pedidos do servidor: ${error.message}`);
  }

  updateSummary();
  renderOrders();
}

searchInput.addEventListener('input', renderOrders);
statusFilter.addEventListener('change', renderOrders);
clearOrdersButton.addEventListener('click', clearOrders);
form.addEventListener('submit', handleSubmit);

todayLabel.textContent = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long'
}).format(new Date());

initialize();
