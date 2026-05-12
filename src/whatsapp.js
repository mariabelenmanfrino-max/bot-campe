const axios = require('axios');

const WHATSAPP_API_URL = 'https://graph.facebook.com/v21.0';

// Leídos en cada llamada para reflejar siempre el valor actual de process.env
function getToken() { return process.env.WHATSAPP_TOKEN; }
function getPhoneId() { return process.env.WHATSAPP_PHONE_NUMBER_ID; }

// IDs de mensajes ya procesados para evitar duplicados
const mensajesProcesados = new Set();
const MAX_IDS_CACHE = 500;

function parsearMensaje(body) {
  try {
    const entry = body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    if (!value?.messages?.length) return null;

    const mensaje = value.messages[0];

    if (mensaje.type !== 'text') return null;

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
      `${WHATSAPP_API_URL}/${getPhoneId()}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: destinatario,
        type: 'text',
        text: { body: texto, preview_url: false },
      },
      {
        headers: {
          Authorization: `Bearer ${getToken()}`,
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
      `${WHATSAPP_API_URL}/${getPhoneId()}/messages`,
      {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      },
      {
        headers: {
          Authorization: `Bearer ${getToken()}`,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch {
    // No crítico
  }
}

module.exports = { parsearMensaje, enviarMensaje, marcarComoLeido };
