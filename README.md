# J.A.R.V.I.S.

Asistente virtual inspirado en la IA de Iron Man. Proyecto académico de consumo de APIs con IA (Google Gemini).

## Instalación

```bash
npm install
```

## API key

1. Crea tu clave en https://aistudio.google.com/apikey
2. Copia `.env.example` a `.env`
3. Pega la clave en `GEMINI_API_KEY`

Si la clave queda vacía, el servidor arranca en modo mock (respuestas de prueba, sin gastar la API).

## Ejecutar

```bash
npm start
```

Abre http://localhost:3000 en el navegador. Modo desarrollo: `npm run dev`.
