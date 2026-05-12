const fs = require('fs');
const path = require('path');

const CATALOG_PATH = path.join(__dirname, '..', 'data', 'productos.json');

function cargarCatalogo() {
  const raw = fs.readFileSync(CATALOG_PATH, 'utf-8');
  return JSON.parse(raw);
}

function guardarCatalogo(catalogo) {
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalogo, null, 2), 'utf-8');
}

function listarProductos(categoria) {
  const { productos, categorias } = cargarCatalogo();

  let lista = productos;
  if (categoria) {
    const cat = categoria.toLowerCase().trim();
    lista = productos.filter(p => p.categoria.includes(cat) || p.nombre.toLowerCase().includes(cat));
  }

  if (lista.length === 0) {
    return {
      encontrado: false,
      mensaje: categoria
        ? `No tenemos productos en la categoría "${categoria}". Las categorías disponibles son: ${categorias.join(', ')}.`
        : 'No hay productos disponibles en este momento.',
    };
  }

  const agrupados = lista.reduce((acc, p) => {
    if (!acc[p.categoria]) acc[p.categoria] = [];
    acc[p.categoria].push({
      id: p.id,
      nombre: p.nombre,
      precio: p.precio,
      stock: p.stock,
      unidad: p.unidad,
      descripcion: p.descripcion,
      disponible: p.stock > 0,
    });
    return acc;
  }, {});

  return { encontrado: true, categorias: agrupados, total_productos: lista.length };
}

function buscarProducto(consulta) {
  const { productos } = cargarCatalogo();
  const termino = consulta.toLowerCase().trim();

  const resultados = productos.filter(p =>
    p.nombre.toLowerCase().includes(termino) ||
    p.descripcion.toLowerCase().includes(termino) ||
    p.categoria.toLowerCase().includes(termino) ||
    p.id.toLowerCase().includes(termino)
  );

  if (resultados.length === 0) {
    return {
      encontrado: false,
      mensaje: `No encontré productos que coincidan con "${consulta}". Podés pedirme que liste todos los productos disponibles.`,
    };
  }

  return {
    encontrado: true,
    productos: resultados.map(p => ({
      id: p.id,
      nombre: p.nombre,
      precio: p.precio,
      precio_formateado: `$${p.precio.toLocaleString('es-AR')}`,
      stock: p.stock,
      unidad: p.unidad,
      descripcion: p.descripcion,
      disponible: p.stock > 0,
    })),
  };
}

function getProductoPorId(id) {
  const { productos } = cargarCatalogo();
  return productos.find(p => p.id === id) || null;
}

function reducirStock(id, cantidad) {
  const catalogo = cargarCatalogo();
  const producto = catalogo.productos.find(p => p.id === id);
  if (!producto) return { ok: false, error: `Producto ${id} no encontrado` };
  if (producto.stock < cantidad) return { ok: false, error: `Stock insuficiente. Disponible: ${producto.stock}` };

  producto.stock -= cantidad;
  guardarCatalogo(catalogo);
  return { ok: true, stock_restante: producto.stock };
}

module.exports = { listarProductos, buscarProducto, getProductoPorId, reducirStock };
