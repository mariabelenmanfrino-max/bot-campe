require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const { verificarWebhook, parsearMensaje, enviarMensaje, marcarComoLeido } = require('./src/whatsapp');
const { procesarMensaje } = require('./src/claude');

const LOG_PATH = path.join(__dirname, 'bot.log');
const logStream = fs.createWriteStream(LOG_PATH, { flags: 'a' });

function log(...args) {
  const line = `${new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })} ${args.join(' ')}\n`;
  process.stdout.write(line);
  logStream.write(line);
}
// Reemplazar console.log/warn/error globalmente para que todo vaya al log
const _log = console.log.bind(console);
console.log = (...a) => log(...a);
console.warn = (...a) => log('[WARN]', ...a);
console.error = (...a) => log('[ERR]', ...a);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', bot: 'La Campechana WhatsApp Bot', version: '1.0.0' });
});

// Verificación del webhook de Meta
app.get('/webhook', (req, res) => {
  const resultado = verificarWebhook(req.query);
  if (resultado.ok) {
    return res.status(200).send(resultado.challenge);
  }
  console.warn('[WEBHOOK] Verificación fallida. Token incorrecto.');
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
    // Marcar como leído para mostrar tilde azul
    await marcarComoLeido(messageId);

    // Procesar con Claude
    const respuesta = await procesarMensaje(from, texto);

    // Enviar respuesta por WhatsApp
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

// Endpoint para ver pedidos (protegido con token básico para uso interno)
app.get('/pedidos', (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = process.env.ADMIN_TOKEN;

  if (token && authHeader !== `Bearer ${token}`) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  try {
    const pedidos = require('./src/orders');
    const fs = require('fs');
    const path = require('path');
    const raw = fs.readFileSync(path.join(__dirname, 'data', 'pedidos.json'), 'utf-8');
    res.json(JSON.parse(raw));
  } catch {
    res.status(500).json({ error: 'Error al cargar pedidos' });
  }
});

app.listen(PORT, () => {
  console.log('================================================');
  console.log('  La Campechana - Bot de WhatsApp');
  console.log(`  Servidor corriendo en http://localhost:${PORT}`);
  console.log(`  Webhook: POST http://localhost:${PORT}/webhook`);
  console.log('================================================');
});

// Manejo graceful de cierre
process.on('SIGINT', () => {
  console.log('\n[BOT] Cerrando servidor...');
  process.exit(0);
});
