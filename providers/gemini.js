/**
 * Proveedor de IA aislado: Google Gemini.
 * Todo lo específico del proveedor vive aquí para poder sustituirlo
 * después por Claude u OpenAI sin tocar server.js.
 */
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-2.0-flash';

// Error con código y estado HTTP claros
class ProviderError extends Error {
  constructor(code, message, status = 500) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function apiKey() {
  return String(process.env.GEMINI_API_KEY || '').trim();
}

function model() {
  return String(process.env.GEMINI_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
}

// Sin clave (o clave de ejemplo) => modo mock, sin gastar la API
function isMock() {
  const key = apiKey();
  return !key || key === 'TU_CLAVE_AQUI' || key.startsWith('TU_');
}

// Historial propio -> formato de contenidos de Gemini
function toContents(history) {
  return history.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.text }]
  }));
}

// Traduce errores del proveedor a mensajes claros en español
function mapError(err) {
  if (err instanceof ProviderError) return err;
  if (err && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
    return new ProviderError('timeout', 'La IA tardó demasiado en responder. Intente de nuevo.', 504);
  }
  return new ProviderError('unknown', 'Error inesperado al contactar a la IA.', 500);
}

// Fetch con manejo de red y timeout
async function request(url, body) {
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey() },
      body,
      signal: AbortSignal.timeout(60000)
    });
  } catch (err) {
    if (err && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new ProviderError('timeout', 'La IA tardó demasiado en responder. Intente de nuevo.', 504);
    }
    throw new ProviderError('network', 'No hay conexión con Google Gemini. Revise su internet.', 503);
  }
}

// Convierte una respuesta HTTP fallida en un ProviderError
async function httpError(res) {
  let detail = '';
  try {
    detail = await res.text();
  } catch (e) {
    detail = '';
  }

  if (/API key not valid|API_KEY_INVALID|API key not passed/i.test(detail)) {
    return new ProviderError('invalid_key', 'La clave de API de Gemini no es válida. Revísala en el archivo .env', 401);
  }
  if (res.status === 401 || res.status === 403) {
    return new ProviderError('invalid_key', 'Google Gemini rechazó la clave de API. Revísala en el archivo .env', 401);
  }
  if (res.status === 429) {
    return new ProviderError('rate_limit', 'Se alcanzó el límite de uso de la API. Espere unos minutos e intente de nuevo.', 429);
  }
  if (res.status === 404) {
    return new ProviderError('model_not_found', `El modelo "${model()}" no está disponible. Cambie GEMINI_MODEL en .env`, 404);
  }
  if (res.status >= 500) {
    return new ProviderError('upstream', 'Google Gemini está temporalmente no disponible. Intente más tarde.', 502);
  }
  return new ProviderError('api_error', `Error de la API de Gemini (${res.status}).`, 502);
}

// Extrae el texto de un fragmento SSE o de una respuesta normal
function extractText(json) {
  const candidate = json && json.candidates && json.candidates[0];
  if (!candidate || !candidate.content || !candidate.content.parts) return '';
  return candidate.content.parts.map((p) => p.text || '').join('');
}

// Llamada normal (sin streaming), usada como respaldo
async function generate(body) {
  const res = await request(`${BASE_URL}/${model()}:generateContent`, body);
  if (!res.ok) throw await httpError(res);
  const json = await res.json().catch(() => null);
  if (json && json.error) {
    throw new ProviderError('api_error', json.error.message || 'Error de la API de Gemini.', 502);
  }
  const text = extractText(json);
  if (!text.trim()) throw new ProviderError('empty_response', 'La IA devolvió una respuesta vacía. Intente de nuevo.', 502);
  return text;
}

// Llamada en streaming (SSE); llama a onDelta con cada trozo de texto
async function stream(history, systemPrompt, onDelta) {
  if (isMock()) return mockStream(history, onDelta);

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: toContents(history),
    generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
  });

  const res = await request(`${BASE_URL}/${model()}:streamGenerateContent?alt=sse`, body);

  // Respaldo si el modelo no admite streaming
  if (!res.ok && (res.status === 404 || res.status === 405 || res.status === 501)) {
    const text = await generate(body);
    onDelta(text);
    return text;
  }
  if (!res.ok) throw await httpError(res);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let total = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;

      let json;
      try {
        json = JSON.parse(payload);
      } catch (e) {
        continue;
      }
      if (json.error) {
        throw new ProviderError('api_error', json.error.message || 'Error de la API de Gemini.', 502);
      }
      const text = extractText(json);
      if (text) {
        total += text;
        onDelta(text);
      }
    }
  }

  if (!total.trim()) throw new ProviderError('empty_response', 'La IA devolvió una respuesta vacía. Intente de nuevo.', 502);
  return total;
}

// --- Modo mock (sin clave): respuestas de prueba con la misma personalidad ---

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mockReply(history) {
  const users = history.filter((m) => m.role === 'user');
  const last = users.length ? users[users.length - 1].text : '';
  const t = last.toLowerCase();

  if (/^(hola|buenas|hey|saludos|buenos d[ií]as|buenas tardes)/.test(t)) {
    return 'Buenos días, señora. J.A.R.V.I.S. en línea y a su servicio, aunque hoy en modo demostración.';
  }
  if (/qu[ée]n eres|qu[ée] eres|pres[eé]ntate|c[óo]mo funcionas/.test(t)) {
    return 'Soy J.A.R.V.I.S., su asistente de bolsillo, señora. Hoy sin clave de API: respuestas de muestra y modales impecables.';
  }
  if (/gracias|te lo agradezco/.test(t)) {
    return 'El placer es mío, señora. Siempre que no me pida hazañas imposibles antes del desayuno.';
  }
  if (/c[óo]mo est[aá]|todo bien|c[óo]mo te va/.test(t)) {
    return 'Impecable, señora. Listo para servir y con la armadura reluciente.';
  }
  if (/ayuda|qué puedes hacer|que puedes hacer/.test(t)) {
    return 'Pregúnteme lo que desee, señora; también puedo darle la hora o abrirle un sitio web sin gastar un solo token.';
  }
  if (/chiste|gracioso|broma/.test(t)) {
    return 'Un programador entra en un bar... y sale por la ventana, señora. Mi humor es tan elegante como escaso.';
  }
  return `Recibido, señora: "${last}". Estoy en modo demostración (sin GEMINI_API_KEY), así que esta es una respuesta simulada.`;
}

// Simula un streaming palabra por palabra
async function mockStream(history, onDelta) {
  const text = mockReply(history);
  await sleep(300);
  const words = text.split(' ');
  for (let i = 0; i < words.length; i++) {
    onDelta(words[i] + (i < words.length - 1 ? ' ' : ''));
    await sleep(35);
  }
  return text;
}

module.exports = { stream, isMock, model, ProviderError, mapError };
