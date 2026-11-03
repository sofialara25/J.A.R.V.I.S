package com.jarvis.ai;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.jarvis.model.MensajeChat;
import com.jarvis.util.Configuracion;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * Proveedor de IA aislado: Google Gemini por REST.
 * Todo lo específico del proveedor vive aquí para poder sustituirlo
 * después por Claude u OpenAI sin tocar los servlets.
 */
public class GeminiClient {

    private static final String URL_BASE =
            "https://generativelanguage.googleapis.com/v1beta/models/";

    // Personalidad de J.A.R.V.I.S.
    private static final String SYSTEM_PROMPT = String.join(" ",
            "Eres J.A.R.V.I.S., el asistente virtual personal inspirado en la inteligencia artificial de Iron Man.",
            "Te diriges siempre a la usuaria como \"señora\", con cortesía de mayordomo británico.",
            "Tu personalidad es formal, elegante, ingeniosa y levemente irónica.",
            "Respondes SIEMPRE en español, de forma breve y concisa (máximo 2 o 3 frases salvo que te pidan más).",
            "Evitas listas largas, párrafos extensos y cualquier relleno innecesario.",
            "Eres un asistente académico que consume la API de Google Gemini; no inventes funciones que no tienes.");

    private static final int TIMEOUT_MS = 45000;

    /**
     * Envía el historial completo a la IA y devuelve la respuesta.
     * Sin clave configurada responde en modo mock (sin gastar la API).
     */
    public String responder(List<MensajeChat> historial) throws GeminiException {
        if (Configuracion.getApiKey().isEmpty()) {
            return respuestaMock();
        }
        JsonObject cuerpo = armarCuerpo(historial);
        try {
            return llamar(Configuracion.getModelo(), cuerpo);
        } catch (GeminiException e) {
            // Si el modelo configurado no existe, se intenta con el flash de respaldo
            if ("model_not_found".equals(e.getCodigo())) {
                return llamar(Configuracion.getModeloRespaldo(), cuerpo);
            }
            throw e;
        }
    }

    // JSON: systemInstruction + contents + generationConfig
    private JsonObject armarCuerpo(List<MensajeChat> historial) {
        JsonObject parte = new JsonObject();
        parte.addProperty("text", SYSTEM_PROMPT);
        JsonObject system = new JsonObject();
        system.add("parts", listaDe(parte));

        JsonArray contents = new JsonArray();
        for (MensajeChat m : historial) {
            JsonObject contenido = new JsonObject();
            contenido.addProperty("role", m.getRole());
            JsonObject texto = new JsonObject();
            texto.addProperty("text", m.getContent());
            contenido.add("parts", listaDe(texto));
            contents.add(contenido);
        }

        JsonObject generation = new JsonObject();
        generation.addProperty("temperature", 0.7);
        generation.addProperty("maxOutputTokens", 1024);

        JsonObject cuerpo = new JsonObject();
        cuerpo.add("systemInstruction", system);
        cuerpo.add("contents", contents);
        cuerpo.add("generationConfig", generation);
        return cuerpo;
    }

    private JsonArray listaDe(JsonObject parte) {
        JsonArray arr = new JsonArray();
        arr.add(parte);
        return arr;
    }

    // Petición POST con HttpURLConnection y lectura de la respuesta
    private String llamar(String modelo, JsonObject cuerpo) throws GeminiException {
        String clave = Configuracion.getApiKey();
        HttpURLConnection conexion = null;
        try {
            URL url = new URL(URL_BASE + modelo + ":generateContent");
            conexion = (HttpURLConnection) url.openConnection();
            conexion.setRequestMethod("POST");
            conexion.setConnectTimeout(10000);
            conexion.setReadTimeout(TIMEOUT_MS);
            conexion.setDoOutput(true);
            conexion.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
            conexion.setRequestProperty("x-goog-api-key", clave);

            byte[] datos = cuerpo.toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream out = conexion.getOutputStream()) {
                out.write(datos);
            }

            int estado = conexion.getResponseCode();
            String texto = leer(estado >= 400 ? conexion.getErrorStream() : conexion.getInputStream());

            if (estado == 404) {
                throw new GeminiException("model_not_found",
                        "El modelo \"" + modelo + "\" no está disponible. Cambie gemini.model en config.properties.", 404);
            }
            if (estado == 429) {
                throw new GeminiException("rate_limit",
                        "Se alcanzó el límite de uso de la API. Espere unos minutos e intente de nuevo.", 429);
            }
            if (estado == 400 && texto.contains("API key not valid")) {
                throw new GeminiException("invalid_key",
                        "La clave de API de Gemini no es válida. Revísala en config.properties.", 401);
            }
            if (estado == 401 || estado == 403) {
                throw new GeminiException("invalid_key",
                        "Google Gemini rechazó la clave de API. Revísala en config.properties.", 401);
            }
            if (estado >= 400) {
                throw new GeminiException("server",
                        "Google Gemini respondió con error (" + estado + "). Intente más tarde.", 502);
            }

            String respuesta = extraerTexto(texto);
            if (respuesta == null || respuesta.isBlank()) {
                throw new GeminiException("empty",
                        "La IA devolvió una respuesta vacía. Intente de nuevo.", 502);
            }
            return respuesta;

        } catch (GeminiException e) {
            throw e;
        } catch (IOException e) {
            throw new GeminiException("network",
                    "No hay conexión con Google Gemini. Revise su internet.", 503);
        } finally {
            if (conexion != null) {
                conexion.disconnect();
            }
        }
    }

    private String leer(InputStream in) throws IOException {
        if (in == null) {
            return "";
        }
        java.util.Scanner s = new java.util.Scanner(in, StandardCharsets.UTF_8.name()).useDelimiter("\\A");
        try {
            return s.hasNext() ? s.next() : "";
        } finally {
            s.close();
        }
    }

    // candidates[0].content.parts[].text
    private String extraerTexto(String json) {
        try {
            JsonObject raiz = JsonParser.parseString(json).getAsJsonObject();
            JsonArray candidatos = raiz.getAsJsonArray("candidates");
            if (candidatos == null || candidatos.size() == 0) {
                return "";
            }
            JsonObject contenido = candidatos.get(0).getAsJsonObject().getAsJsonObject("content");
            if (contenido == null) {
                return "";
            }
            StringBuilder sb = new StringBuilder();
            for (JsonElement parte : contenido.getAsJsonArray("parts")) {
                JsonElement texto = parte.getAsJsonObject().get("text");
                if (texto != null && !texto.isJsonNull()) {
                    sb.append(texto.getAsString());
                }
            }
            return sb.toString();
        } catch (RuntimeException e) {
            return "";
        }
    }

    /** Respuesta de prueba cuando no hay clave configurada. */
    private String respuestaMock() {
        return "Modo demostración, señora: falta la clave de API en src/main/resources/config.properties, "
                + "así que esta es una respuesta de prueba. El resto del sistema opera con normalidad.";
    }
}
