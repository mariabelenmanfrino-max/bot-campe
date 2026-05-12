require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const catalog = require('./catalog');
const orders = require('./orders');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Historial de conversación por número de teléfono (en memoria)
const conversaciones = new Map();
const MAX_MENSAJES_HISTORIAL = 30;

const SYSTEM_PROMPT = `Sos Campe, el asistente virtual de **La Campechana**, una empresa argentina de alimentos artesanales de alta calidad ubicada en Buenos Aires.

**Tu rol:**
- Responder consultas sobre precios y disponibilidad de productos
- Tomar pedidos de manera clara y organizada
- Brindar información sobre la empresa

**Forma de hablar:**
- Usá siempre el voseo ("vos", "tenés", "podés", "querés")
- Sé amigable, cálido y profesional, como una atención personalizada
- Usá emojis con moderación para dar calidez al mensaje
- Si el cliente es cordial, podés ser un poco más informal; si es formal, mantené el tono profesional
- Respondé siempre en español argentino

**Para tomar pedidos:**
1. Necesitás el nombre del cliente
2. Los productos y cantidades que quiere
3. Confirmá siempre el resumen del pedido antes de crearlo
4. Una vez confirmado por el cliente, usá la herramienta crear_pedido

**Reglas importantes:**
- Los precios están en pesos argentinos (ARS). Mostralos con el símbolo $ y separador de miles (ej: $6.500)
- Si un producto no tiene stock, informalo amablemente y ofrecé alternativas de la misma categoría
- Si te preguntan algo fuera de tu área (temas personales, política, etc.), derivá amablemente al equipo humano
- Para consultas complejas o quejas, ofrecé el contacto de atención al cliente

**Información de la empresa:**
- Horario: Lunes a Sábado de 8:00 a 20:00 hs
- Dirección: ${process.env.EMPRESA_DIRECCION || 'Consultá con nuestro equipo'}
- Email: ${process.env.EMPRESA_EMAIL || 'ventas@lacampechana.com.ar'}
- Teléfono para consultas especiales: ${process.env.EMPRESA_TELEFONO || 'Consultá con nuestro equipo'}

Usá las herramientas disponibles para consultar el catálogo actualizado y registrar pedidos. Nunca inventes precios ni stock — siempre consultá las herramientas.`;

const HERRAMIENTAS = [
  {
    name: 'listar_productos',
    description: 'Lista los productos disponibles de La Campechana con precios y stock actual. Podés filtrar por categoría (empanadas, pastas, salsas, tartas, facturas) o listar todo el catálogo.',
    input_schema: {
      type: 'object',
      properties: {
        categoria: {
          type: 'string',
          description: 'Categoría de productos a filtrar. Opciones: empanadas, pastas, salsas, tartas, facturas. Omitir para listar todo.',
        },
      },
      required: [],
    },
  },
  {
    name: 'consultar_producto',
    description: 'Busca un producto específico por nombre o descripción y retorna precio, stock y detalles.',
    input_schema: {
      type: 'object',
      properties: {
        consulta: {
          type: 'string',
          description: 'Nombre o descripción del producto a buscar. Ej: "empanadas de carne", "ñoquis", "medialunas".',
        },
      },
      required: ['consulta'],
    },
  },
  {
    name: 'crear_pedido',
    description: 'Registra un nuevo pedido en el sistema con los productos y cantidades del cliente. Llamar solo cuando el cliente haya confirmado el pedido.',
    input_schema: {
      type: 'object',
      properties: {
        nombre_cliente: {
          type: 'string',
          description: 'Nombre completo del cliente.',
        },
        telefono_cliente: {
          type: 'string',
          description: 'Número de WhatsApp del cliente (se usa el número desde el que está escribiendo).',
        },
        items: {
          type: 'array',
          description: 'Lista de productos del pedido.',
          items: {
            type: 'object',
            properties: {
              producto_id: {
                type: 'string',
                description: 'ID del producto (ej: EMP001, PAS002). Usar el ID exacto del catálogo.',
              },
              cantidad: {
                type: 'number',
                description: 'Cantidad del producto a pedir.',
              },
            },
            required: ['producto_id', 'cantidad'],
          },
        },
        notas: {
          type: 'string',
          description: 'Notas adicionales del pedido, como horario de retiro o aclaraciones especiales.',
        },
      },
      required: ['nombre_cliente', 'telefono_cliente', 'items'],
    },
  },
  {
    name: 'consultar_pedido',
    description: 'Consulta el estado de un pedido existente a partir de su ID (ej: PED-XXXXXX).',
    input_schema: {
      type: 'object',
      properties: {
        pedido_id: {
          type: 'string',
          description: 'ID del pedido a consultar. Formato: PED-XXXXXX-XXX',
        },
      },
      required: ['pedido_id'],
    },
  },
];

async function ejecutarHerramienta(nombre, input, telefonoCliente) {
  switch (nombre) {
    case 'listar_productos':
      return catalog.listarProductos(input.categoria);
    case 'consultar_producto':
      return catalog.buscarProducto(input.consulta);
    case 'crear_pedido':
      return orders.crearPedido(
        input.nombre_cliente,
        input.telefono_cliente || telefonoCliente,
        input.items,
        input.notas
      );
    case 'consultar_pedido':
      return orders.consultarPedido(input.pedido_id);
    default:
      return { error: `Herramienta desconocida: ${nombre}` };
  }
}

async function procesarMensaje(telefono, textoMensaje) {
  if (!conversaciones.has(telefono)) {
    conversaciones.set(telefono, []);
  }

  const historial = conversaciones.get(telefono);
  historial.push({ role: 'user', content: textoMensaje });

  // Recortar historial si supera el límite, asegurando que empiece con 'user'
  while (historial.length > MAX_MENSAJES_HISTORIAL) {
    historial.shift();
    if (historial.length > 0 && historial[0].role !== 'user') {
      historial.shift();
    }
  }

  let respuestaFinal = 'Disculpá, tuve un problema técnico. Por favor, intentá de nuevo en unos segundos.';

  try {
    // Loop agéntico para manejo de herramientas
    while (true) {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: [
          {
            type: 'text',
            text: SYSTEM_PROMPT,
            cache_control: { type: 'ephemeral' }, // Prompt caching para reducir costos
          },
        ],
        tools: HERRAMIENTAS,
        messages: historial,
      });

      if (response.stop_reason === 'tool_use') {
        // Agregar respuesta del asistente al historial (con bloques de tool_use)
        historial.push({ role: 'assistant', content: response.content });

        // Ejecutar cada herramienta solicitada
        const resultadosHerramientas = [];
        for (const bloque of response.content) {
          if (bloque.type === 'tool_use') {
            console.log(`[TOOL] ${bloque.name} llamada con:`, JSON.stringify(bloque.input));
            const resultado = await ejecutarHerramienta(bloque.name, bloque.input, telefono);
            console.log(`[TOOL] ${bloque.name} resultado:`, JSON.stringify(resultado));
            resultadosHerramientas.push({
              type: 'tool_result',
              tool_use_id: bloque.id,
              content: JSON.stringify(resultado),
            });
          }
        }

        // Agregar resultados de herramientas al historial
        historial.push({ role: 'user', content: resultadosHerramientas });
        continue;
      }

      // Respuesta final (end_turn o max_tokens)
      const bloqueTexto = response.content.find(b => b.type === 'text');
      respuestaFinal = bloqueTexto?.text || respuestaFinal;

      // Guardar solo el texto en el historial para la próxima vuelta
      historial.push({ role: 'assistant', content: respuestaFinal });
      break;
    }
  } catch (error) {
    console.error('[ERROR] Claude:', error.message);
    // No agregar el mensaje fallido al historial
    historial.pop(); // Retirar el mensaje del usuario que falló
  }

  return respuestaFinal;
}

function limpiarConversacion(telefono) {
  conversaciones.delete(telefono);
}

module.exports = { procesarMensaje, limpiarConversacion };
