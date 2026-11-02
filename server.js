/**
 * J.A.R.V.I.S. - Servidor principal (Node.js + Express)
 * Sirve el frontend desde public/ y expone el endpoint de chat /api/chat.
 */
require('dotenv').config({ quiet: true });

const path = require('path');
const express = require('express');
const gemini = require('./providers/gemini');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const MAX_HISTORY = Math.max(2, Number(process.env.MAX_HISTORY) || 16);

// System prompt: personalidad de J.A.R.V.I.S.
const SYSTEM_PROMPT = [
  'Eres J.A.R.V.I.S., el asistente virtual personal inspirado en la inteligencia artificial de Iron Man.',
  'Te diriges siempre a la usuaria como "señora", con cortesía de mayordomo británico.',
  'Tu personalidad es formal, elegante, ingeniosa y levemente irónica.',
  'Respondes SIEMPRE en español, de forma breve y concisa (máximo 2 o 3 frases salvo que te pidan más).',
  'Evitas listas largas, párrafos extensos y cualquier relleno innecesario.',
  'Eres un asistente académico que consume la API de Google Gemini; no inventas funciones que no tienes.'
].join(' ');

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Historial de la conversación en memoria (se recorta para no gastar tokens)
let history = [];

function pushHistory(role, text) {
  history.push({ role, text });
  if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);
}

function sse(res, obj) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

// Estado del servidor (para que el frontend sepa si hay clave o modo mock)
app.get('/api/health', (req, res) => {
  res.json({ ok: true, mock: gemini.isMock(), model: gemini.model(), history: history.length });
});

// Limpiar la conversación
app.post('/api/clear', (req, res) => {
  history = [];
  res.json({ ok: true, history: 0 });
});

// Chat: recibe un mensaje, llama a la IA y responde en streaming (SSE)
app.post('/api/chat', async (req, res) => {
  const message = String((req.body && req.body.message) || '').trim();
  if (!message) {
    return res.status(400).json({
      error: { code: 'empty_message', message: 'Escriba un mensaje primero, señora.' }
    });
  }

  pushHistory('user', message);

  // Cabeceras SSE (aún no se envían hasta la primera escritura)
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');

  let started = false; // hubo algún delta enviado
  let full = '';

  try {
    await gemini.stream(history, SYSTEM_PROMPT, (delta) => {
      started = true;
      full += delta;
      sse(res, { delta });
    });

    if (!full.trim()) {
      throw new gemini.ProviderError('empty_response', 'La IA devolvió una respuesta vacía. Intente de nuevo.', 502);
    }

    pushHistory('assistant', full.trim());
    sse(res, { done: true });
    res.end();
  } catch (err) {
    const mapped = gemini.mapError(err);

    if (!started) {
      // Sin respuesta: se revierte el mensaje del usuario y se responde con error JSON
      if (history.length && history[history.length - 1].role === 'user') history.pop();
      res.status(mapped.status);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify({ error: { code: mapped.code, message: mapped.message } }));
    }

    // Error a mitad del streaming
    sse(res, { error: { code: mapped.code, message: mapped.message } });
    res.end();
  }
});

app.listen(PORT, () => {
  const mode = gemini.isMock() ? 'MODO MOCK (sin GEMINI_API_KEY)' : `Gemini: ${gemini.model()}`;
  console.log(`J.A.R.V.I.S. en línea en http://localhost:${PORT} [${mode}]`);
});
