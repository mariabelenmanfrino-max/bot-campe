const fs = require('fs');
const path = require('path');
const { getProductoPorId, reducirStock } = require('./catalog');

const PEDIDOS_PATH = path.join(__dirname, '..', 'data', 'pedidos.json');

function cargarPedidos() {
  try {
    const raw = fs.readFileSync(PEDIDOS_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function guardarPedidos(pedidos) {
  fs.writeFileSync(PEDIDOS_PATH, JSON.stringify(pedidos, null, 2), 'utf-8');
}

function generarId() {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `PED-${ts}-${rand}`;
}

function crearPedido(nombreCliente, telefonoCliente, items, notas = '') {
  if (!nombreCliente || !telefonoCliente || !items || items.length === 0) {
    return { ok: false, error: 'Faltan datos obligatorios: nombre del cliente, teléfono e ítems del pedido.' };
  }

  const itemsDetallados = [];
  let total = 0;
  const errores = [];

  for (const item of items) {
    const producto = getProductoPorId(item.producto_id);
    if (!producto) {
      errores.push(`Producto con ID "${item.producto_id}" no encontrado.`);
      continue;
    }
    if (producto.stock < item.cantidad) {
      errores.push(`Stock insuficiente para "${producto.nombre}". Disponible: ${producto.stock} ${producto.unidad}(s).`);
      continue;
    }

    const subtotal = producto.precio * item.cantidad;
    total += subtotal;
    itemsDetallados.push({
      producto_id: producto.id,
      nombre: producto.nombre,
      cantidad: item.cantidad,
      precio_unitario: producto.precio,
      subtotal,
    });
  }

  if (errores.length > 0) {
    return { ok: false, error: errores.join(' '), errores };
  }

  // Descontar stock
  for (const item of itemsDetallados) {
    reducirStock(item.producto_id, item.cantidad);
  }

  const pedido = {
    id: generarId(),
    cliente: { nombre: nombreCliente, telefono: telefonoCliente },
    items: itemsDetallados,
    total,
    notas,
    estado: 'pendiente',
    fecha: new Date().toISOString(),
  };

  const pedidos = cargarPedidos();
  pedidos.push(pedido);
  guardarPedidos(pedidos);

  console.log(`[PEDIDO] Nuevo pedido creado: ${pedido.id} - Cliente: ${nombreCliente} - Total: $${total.toLocaleString('es-AR')}`);

  return {
    ok: true,
    pedido_id: pedido.id,
    cliente: pedido.cliente,
    items: itemsDetallados.map(i => ({
      nombre: i.nombre,
      cantidad: i.cantidad,
      subtotal_formateado: `$${i.subtotal.toLocaleString('es-AR')}`,
    })),
    total_formateado: `$${total.toLocaleString('es-AR')}`,
    estado: pedido.estado,
    mensaje: `¡Pedido registrado exitosamente! Tu número de pedido es ${pedido.id}.`,
  };
}

function consultarPedido(pedidoId) {
  const pedidos = cargarPedidos();
  const pedido = pedidos.find(p => p.id === pedidoId);

  if (!pedido) {
    return { ok: false, error: `No encontré ningún pedido con el ID "${pedidoId}".` };
  }

  const estados = {
    pendiente: 'Pendiente de confirmación',
    confirmado: 'Confirmado - en preparación pronto',
    en_preparacion: 'En preparación',
    listo: 'Listo para retirar/entregar',
    entregado: 'Entregado',
    cancelado: 'Cancelado',
  };

  return {
    ok: true,
    pedido_id: pedido.id,
    cliente: pedido.cliente.nombre,
    estado: pedido.estado,
    estado_descripcion: estados[pedido.estado] || pedido.estado,
    total_formateado: `$${pedido.total.toLocaleString('es-AR')}`,
    fecha: new Date(pedido.fecha).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }),
    items: pedido.items.map(i => `${i.cantidad}x ${i.nombre}`),
  };
}

module.exports = { crearPedido, consultarPedido };
