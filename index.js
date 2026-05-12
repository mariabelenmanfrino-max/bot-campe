require('dotenv').config();
const express = require('express');
const { parsearMensaje, enviarMensaje, marcarComoLeido } = require('./src/whatsapp');
const { procesarMensaje } = require('./src/claude');

const app = express();

// Railway inyecta PORT automáticamente. Nunca hardcodear 3000 en producción.
const PORT = process.env.PORT;
if (!PORT) {
  console.error('[ERROR] La variable de entorno PORT no está definida. Railway debe inyectarla automáticamente.');
  process.exit(1);
}

app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', bot: 'La Campechana WhatsApp Bot', version: '1.0.0' });
});

// Verificación del webhook de Meta
app.get('/webhook', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const expected  = process.env.WEBHOOK_VERIFY_TOKEN;

  console.log(`[WEBHOOK] mode=${mode} token=${token} expected=${expected}`);

  if (mode === 'subscribe' && token === expected) {
    console.log('[WEBHOOK] Verificación exitosa');
    return res.status(200).send(challenge);
  }

  console.warn('[WEBHOOK] Verificación fallida: token no coincide');
  res.sendStatus(403);
});

// Recepción de mensajes
app.post('/webhook', async (req, res) => {
  // Meta requiere respuesta 200 inmediata para no reintentar
  res.sendStatus(200);

  const mensaje = parsearMensaje(req.body);
  if (!mensaje) return;

  const { messageId, from, nombre, texto } = mensaje;
  console.log(`[MSG] De: ${nombre} (${from}) | Texto: "${texto}"`);

  try {
    await marcarComoLeido(messageId);
    const respuesta = await procesarMensaje(from, texto);
    await enviarMensaje(from, respuesta);
  } catch (error) {
    console.error(`[ERROR] Al procesar mensaje de ${from}:`, error.message);
    try {
      await enviarMensaje(
        from,
        'Lo siento, tuve un problema técnico. Por favor, intentá de nuevo o contactanos directamente. 🙏'
      );
    } catch {
      console.error('[ERROR] No se pudo enviar mensaje de error al cliente.');
    }
  }
});

// Ver pedidos (uso interno)
app.get('/pedidos', (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = process.env.ADMIN_TOKEN;

  if (token && authHeader !== `Bearer ${token}`) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  try {
    const fs = require('fs');
    const path = require('path');
    const raw = fs.readFileSync(path.join(__dirname, 'data', 'pedidos.json'), 'utf-8');
    res.json(JSON.parse(raw));
  } catch {
    res.status(500).json({ error: 'Error al cargar pedidos' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('================================================');
  console.log('  La Campechana - Bot de WhatsApp');
  console.log(`  Puerto: ${PORT}`);
  console.log('================================================');
});

process.on('SIGTERM', () => {
  console.log('[BOT] Cerrando servidor (SIGTERM)...');
  process.exit(0);
});
