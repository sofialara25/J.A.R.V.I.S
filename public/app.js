/**
 * J.A.R.V.I.S. - Lógica del frontend
 * Chat, streaming SSE, voz (entrada y salida) y comandos locales.
 */
(function () {
  'use strict';

  // Elementos
  const messagesEl = document.getElementById('messages');
  const form = document.getElementById('chatForm');
  const input = document.getElementById('input');
  const sendBtn = document.getElementById('sendBtn');
  const voiceBtn = document.getElementById('voiceBtn');
  const micBtn = document.getElementById('micBtn');
  const clearBtn = document.getElementById('clearBtn');
  const statusText = document.getElementById('statusText');
  const statusDot = document.getElementById('statusDot');

  // Estado
  let busy = false;
  let voiceOn = true;
  let recognition = null;
  let listening = false;

  const ERROR_FALLBACK = 'Se presentó un problema inesperado, señora. Intente de nuevo.';

  // ---------- Utilidades de interfaz ----------

  function setStatus(text, kind) {
    statusText.textContent = text;
    statusDot.classList.remove('busy', 'error');
    if (kind) statusDot.classList.add(kind);
  }

  function setThinking(on) {
    document.body.classList.toggle('thinking', on);
  }

  function setSpeaking(on) {
    document.body.classList.toggle('speaking', on);
  }

  function scrollBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function addMessage(role, text) {
    const wrap = document.createElement('div');
    wrap.className = 'msg ' + role;

    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = role === 'user' ? 'Señora' : role === 'error' ? 'Error' : 'J.A.R.V.I.S.';
    wrap.appendChild(who);

    const body = document.createElement('span');
    body.className = 'body';
    body.textContent = text || '';
    wrap.appendChild(body);

    messagesEl.appendChild(wrap);
    scrollBottom();
    return wrap;
  }

  function showError(text) {
    addMessage('error', text);
    setStatus('ERROR', 'error');
  }

  // ---------- Voz de salida (speechSynthesis) ----------

  function pickVoice() {
    const voices = window.speechSynthesis.getVoices();
    return (
      voices.find((v) => v.lang === 'es-CO') ||
      voices.find((v) => v.lang === 'es-ES') ||
      voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('es')) ||
      null
    );
  }

  function speak(text) {
    if (!voiceOn || !('speechSynthesis' in window) || !text) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'es-CO';
    const voice = pickVoice();
    if (voice) utter.voice = voice;
    utter.rate = 1;
    utter.pitch = 0.95;
    utter.onstart = () => setSpeaking(true);
    utter.onend = () => setSpeaking(false);
    utter.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utter);
  }

  function stopSpeaking() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setSpeaking(false);
  }

  // ---------- Comandos locales (sin gastar la API) ----------

  function localCommand(raw) {
    const t = raw.toLowerCase().trim();

    // Abrir sitios web
    const siteMatch = t.match(/\b(abrir|abre|abreme|abre me|ir a|visita|entrar a|ve a)\b.*\b(youtube|google|github)\b/);
    if (siteMatch) {
      const sites = {
        youtube: { url: 'https://www.youtube.com', name: 'YouTube' },
        google: { url: 'https://www.google.com', name: 'Google' },
        github: { url: 'https://github.com', name: 'GitHub' }
      };
      const site = sites[siteMatch[2]];
      window.open(site.url, '_blank', 'noopener');
      return 'Abriendo ' + site.name + ' en una nueva pestaña, señora.';
    }

    // Hora
    if (/\b(hora|las cu[aá]ntas)\b/.test(t) && !/\b(video|llamada|reuni[oó]n)\b/.test(t)) {
      const hora = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
      return 'Son las ' + hora + ', señora.';
    }

    // Fecha
    if (/\b(fecha|qu[eé] d[ií]a|d[ií]a es|calendario)\b/.test(t)) {
      const fecha = new Date().toLocaleDateString('es-CO', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
      return 'Hoy es ' + fecha + ', señora.';
    }

    return null;
  }

  // ---------- Streaming de la respuesta ----------

  async function readStream(res, onDelta) {
    if (!res.body || typeof res.body.getReader !== 'function') {
      // Respaldo sin streaming
      const data = await res.json().catch(() => null);
      if (data && data.error) throw new Error(data.error.message);
      if (data && data.text) onDelta(data.text);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let gotDone = false;
    let content = '';

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';

      for (const part of parts) {
        const line = part.split('\n').find((l) => l.startsWith('data:'));
        if (!line) continue;

        let json;
        try {
          json = JSON.parse(line.slice(5).trim());
        } catch (e) {
          continue;
        }

        if (json.error) throw new Error(json.error.message || ERROR_FALLBACK);
        if (json.done) gotDone = true;
        if (json.delta) {
          content += json.delta;
          onDelta(json.delta);
        }
      }
    }

    if (!gotDone && !content) throw new Error('La respuesta se interrumpió, señora. Intente de nuevo.');
  }

  // ---------- Envío del mensaje ----------

  async function handleUserMessage(raw) {
    const text = String(raw || '').trim();
    if (!text || busy) return;

    addMessage('user', text);
    input.value = '';
    scrollBottom();

    // Comandos locales: no tocan la API
    const local = localCommand(text);
    if (local) {
      addMessage('assistant', local);
      speak(local);
      return;
    }

    busy = true;
    sendBtn.disabled = true;
    setThinking(true);
    setStatus('PROCESANDO...', 'busy');

    const bubble = addMessage('assistant', '');
    bubble.classList.add('streaming');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      });

      if (!res.ok && res.headers.get('content-type')?.includes('application/json')) {
        const data = await res.json().catch(() => null);
        throw new Error((data && data.error && data.error.message) || ERROR_FALLBACK);
      }

      await readStream(res, (delta) => {
        bubble.querySelector('.body').textContent += delta;
        scrollBottom();
      });

      const answer = bubble.querySelector('.body').textContent.trim();
      bubble.classList.remove('streaming');

      if (!answer) {
        bubble.remove();
        throw new Error('La IA devolvió una respuesta vacía, señora. Intente de nuevo.');
      }

      setStatus('EN LÍNEA');
      speak(answer);
    } catch (err) {
      bubble.classList.remove('streaming');
      const message =
        err && err.message === 'Failed to fetch'
          ? 'Sin conexión con el servidor, señora. Verifique su red.'
          : (err && err.message) || ERROR_FALLBACK;
      bubble.remove();
      showError(message);
    } finally {
      busy = false;
      sendBtn.disabled = false;
      setThinking(false);
      scrollBottom();
      input.focus();
    }
  }

  // ---------- Micrófono (Web Speech API) ----------

  function setupRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;

    const rec = new SR();
    rec.lang = 'es-CO';
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      listening = true;
      micBtn.classList.add('active');
      setStatus('ESCUCHANDO...', 'busy');
    };

    rec.onresult = (event) => {
      let interim = '';
      let finalText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const chunk = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += chunk;
        else interim += chunk;
      }
      input.value = (finalText || interim).trim();
      if (finalText.trim()) handleUserMessage(finalText.trim());
    };

    rec.onerror = (event) => {
      listening = false;
      micBtn.classList.remove('active');
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        showError('Permiso de micrófono denegado, señora. Habilítelo en el navegador.');
      } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
        showError('No se pudo escuchar. Intente de nuevo, señora.');
      }
      setStatus('EN LÍNEA');
    };

    rec.onend = () => {
      listening = false;
      micBtn.classList.remove('active');
      if (!busy) setStatus('EN LÍNEA');
    };

    return rec;
  }

  function toggleMic() {
    if (!recognition) {
      showError('Este navegador no soporta reconocimiento de voz, señora. Use Chrome o Edge.');
      return;
    }
    if (listening) {
      recognition.stop();
      return;
    }
    stopSpeaking();
    try {
      recognition.start();
    } catch (e) {
      /* ya iniciado */
    }
  }

  // ---------- Eventos ----------

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    handleUserMessage(input.value);
  });

  voiceBtn.addEventListener('click', () => {
    voiceOn = !voiceOn;
    voiceBtn.textContent = 'VOZ: ' + (voiceOn ? 'ON' : 'OFF');
    voiceBtn.classList.toggle('active', !voiceOn);
    if (!voiceOn) stopSpeaking();
  });

  micBtn.addEventListener('click', toggleMic);

  clearBtn.addEventListener('click', async () => {
    stopSpeaking();
    messagesEl.innerHTML = '';
    try {
      await fetch('/api/clear', { method: 'POST' });
    } catch (e) {
      /* sin servidor: solo se limpia la vista */
    }
    const greeting = 'Conversación reiniciada, señora. A su disposición.';
    addMessage('assistant', greeting);
    speak(greeting);
    setStatus('EN LÍNEA');
  });

  // Voz: cargar la lista de voces (Chrome la llena de forma asíncrona)
  if ('speechSynthesis' in window) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
  }

  // ---------- Arranque ----------

  async function init() {
    recognition = setupRecognition();
    if (!('speechSynthesis' in window)) {
      voiceOn = false;
      voiceBtn.textContent = 'VOZ: N/D';
      voiceBtn.disabled = true;
    }

    addMessage('assistant', 'Sistema en línea, señora. J.A.R.V.I.S. a su servicio. ¿En qué puedo ayudarle?');

    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      setStatus(data.mock ? 'MODO MOCK' : 'EN LÍNEA');
      if (data.mock) {
        addMessage(
          'assistant',
          'Nota técnica: no detecté una clave de API en .env, así que opero en modo demostración, señora.'
        );
      }
    } catch (e) {
      setStatus('SIN SERVICIO', 'error');
    }

    input.focus();
  }

  init();
})();
