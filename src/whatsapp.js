require('dotenv').config();
const axios = require('axios');

const WHATSAPP_API_URL = 'https://graph.facebook.com/v21.0';
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const TOKEN = process.env.WHATSAPP_TOKEN;
const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN;

// IDs de mensajes ya procesados para evitar duplicados
const mensajesProcesados = new Set();
const MAX_IDS_CACHE = 500;

function verificarWebhook(query) {
  const mode = query['hub.mode'];
  const token = query['hub.verify_token'];
  const challenge = query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[WEBHOOK] Verificación exitosa');
    return { ok: true, challenge };
  }
  return { ok: false };
}

function parsearMensaje(body) {
  try {
    const entry = body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    if (!value?.messages?.length) return null;

    const mensaje = value.messages[0];

    // Solo procesar mensajes de texto
    if (mensaje.type !== 'text') return null;

    // Deduplicación
    if (mensajesProcesados.has(mensaje.id)) {
      console.log(`[WEBHOOK] Mensaje duplicado ignorado: ${mensaje.id}`);
      return null;
    }
    mensajesProcesados.add(mensaje.id);
    if (mensajesProcesados.size > MAX_IDS_CACHE) {
      const [primero] = mensajesProcesados;
      mensajesProcesados.delete(primero);
    }

    const contacto = value.contacts?.[0];
    return {
      messageId: mensaje.id,
      from: mensaje.from,
      nombre: contacto?.profile?.name || 'Cliente',
      texto: mensaje.text.body,
      timestamp: mensaje.timestamp,
    };
  } catch (error) {
    console.error('[WEBHOOK] Error al parsear mensaje:', error.message);
    return null;
  }
}

async function enviarMensaje(destinatario, texto) {
  try {
    const response = await axios.post(
      `${WHATSAPP_API_URL}/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: destinatario,
        type: 'text',
        text: { body: texto, preview_url: false },
      },
      {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log(`[WA] Mensaje enviado a ${destinatario}: ${texto.substring(0, 60)}...`);
    return response.data;
  } catch (error) {
    const detalle = error.response?.data || error.message;
    console.error('[WA] Error al enviar mensaje:', JSON.stringify(detalle));
    throw error;
  }
}

async function marcarComoLeido(messageId) {
  try {
    await axios.post(
      `${WHATSAPP_API_URL}/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      },
      {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch {
    // No crítico, ignoramos errores de read receipt
  }
}

module.exports = { verificarWebhook, parsearMensaje, enviarMensaje, marcarComoLeido };
