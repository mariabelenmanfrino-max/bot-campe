# Bot de WhatsApp - La Campechana

Bot de WhatsApp Business para La Campechana, empresa argentina de alimentos. Permite consultar precios, stock y tomar pedidos, impulsado por Claude AI de Anthropic.

## Requisitos previos

- Node.js 18 o superior
- Cuenta en [Meta for Developers](https://developers.facebook.com/)
- API Key de [Anthropic](https://console.anthropic.com/)
- URL pública HTTPS (para producción) o ngrok (para desarrollo local)

## Instalación

```bash
cd bot-campechana
npm install
cp .env.example .env
# Editá el archivo .env con tus credenciales
```

## Configuración de Meta WhatsApp Business API

### 1. Crear una app en Meta for Developers

1. Entrá a [developers.facebook.com](https://developers.facebook.com/)
2. Creá una nueva app → tipo **Business**
3. Agregá el producto **WhatsApp**

### 2. Obtener credenciales

En el panel de tu app de Meta:

- **WHATSAPP_TOKEN**: En *WhatsApp > API Setup*, copiá el *Temporary access token* (o generá uno permanente)
- **WHATSAPP_PHONE_NUMBER_ID**: El ID que aparece bajo tu número de teléfono en *API Setup*
- **WEBHOOK_VERIFY_TOKEN**: Elegí cualquier string secreto (ej: `mi_token_secreto_2024`)

### 3. Configurar el webhook

1. En *WhatsApp > Configuration*, configurá el webhook:
   - **URL**: `https://tu-dominio.com/webhook`
   - **Verify token**: el mismo valor que pusiste en `WEBHOOK_VERIFY_TOKEN`
2. Suscribite al campo **messages**

### Desarrollo local con ngrok

```bash
# Instalá ngrok: https://ngrok.com/download
ngrok http 3000
# Usá la URL https://xxxx.ngrok.io/webhook como webhook en Meta
```

## Variables de entorno (.env)

```env
WHATSAPP_TOKEN=EAAxxxxxxxxxxxxx
WHATSAPP_PHONE_NUMBER_ID=1234567890
WEBHOOK_VERIFY_TOKEN=tu_token_secreto
ANTHROPIC_API_KEY=sk-ant-xxxxxxxx
PORT=3000
EMPRESA_DIRECCION=Av. Corrientes 1234, Buenos Aires
EMPRESA_TELEFONO=+54 11 1234-5678
EMPRESA_EMAIL=ventas@lacampechana.com.ar
ADMIN_TOKEN=token_para_ver_pedidos  # opcional
```

## Uso

```bash
# Producción
npm start

# Desarrollo (reinicia automáticamente al guardar cambios)
npm run dev
```

## Funcionalidades del bot

- **Consulta de precios**: El cliente pregunta por un producto y el bot responde con precio y disponibilidad
- **Listado de productos**: Muestra el catálogo completo o por categoría (empanadas, pastas, salsas, tartas, facturas)
- **Toma de pedidos**: El bot recaba los datos, muestra un resumen y confirma el pedido
- **Estado de pedidos**: El cliente puede consultar el estado con su número de pedido
- **Memoria de conversación**: El bot recuerda el contexto de la conversación

## Estructura del proyecto

```
bot-campechana/
├── index.js              # Servidor Express y webhook
├── src/
│   ├── claude.js         # Integración con Anthropic + lógica agéntica
│   ├── whatsapp.js       # Cliente de la API de WhatsApp
│   ├── catalog.js        # Gestión del catálogo de productos
│   └── orders.js         # Gestión de pedidos
├── data/
│   ├── productos.json    # Catálogo de productos (editá para actualizar)
│   └── pedidos.json      # Pedidos registrados (generado automáticamente)
├── .env.example
└── package.json
```

## Actualizar productos

Editá `data/productos.json` directamente. Los cambios se reflejan en tiempo real sin reiniciar el bot.

## Ver pedidos

```bash
curl http://localhost:3000/pedidos \
  -H "Authorization: Bearer tu_admin_token"
```

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/` | Health check |
| GET | `/webhook` | Verificación del webhook de Meta |
| POST | `/webhook` | Recepción de mensajes de WhatsApp |
| GET | `/pedidos` | Lista de pedidos (requiere ADMIN_TOKEN) |

## Escalabilidad

Para producción a mayor escala, considerar:
- Reemplazar el almacenamiento JSON por PostgreSQL o MongoDB
- Usar Redis para el historial de conversaciones
- Agregar una cola de mensajes (Bull/RabbitMQ) para manejar picos de tráfico
- Desplegar en Railway, Render, o un servidor propio
