package com.jarvis.servlet;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.jarvis.ai.GeminiClient;
import com.jarvis.ai.GeminiException;
import com.jarvis.model.MensajeChat;
import java.io.BufferedReader;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import javax.servlet.ServletException;
import javax.servlet.annotation.WebServlet;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.servlet.http.HttpSession;

/**
 * POST /api/chat: recibe el mensaje, consulta la IA con el historial
 * de la sesión y devuelve JSON con la respuesta.
 */
@WebServlet("/api/chat")
public class ChatServlet extends HttpServlet {

    private static final int MAX_HISTORIAL = 20;
    private static final Gson GSON = new Gson();

    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse res)
            throws ServletException, IOException {

        req.setCharacterEncoding("UTF-8");
        res.setCharacterEncoding("UTF-8");
        res.setContentType("application/json;charset=UTF-8");

        String mensaje;
        try {
            JsonObject cuerpo = JsonParser.parseString(leerCuerpo(req)).getAsJsonObject();
            mensaje = cuerpo.has("message") && !cuerpo.get("message").isJsonNull()
                    ? cuerpo.get("message").getAsString() : "";
        } catch (RuntimeException e) {
            mensaje = "";
        }
        mensaje = mensaje == null ? "" : mensaje.trim();

        if (mensaje.isEmpty()) {
            enviarError(res, 400, "empty_message", "Escriba un mensaje primero, señora.");
            return;
        }

        HttpSession sesion = req.getSession();
        List<MensajeChat> historial = obtenerHistorial(sesion);

        // Se envía el historial + el mensaje nuevo; se guarda solo si la IA responde
        List<MensajeChat> paraEnviar = new ArrayList<>(historial);
        paraEnviar.add(new MensajeChat("user", mensaje));

        try {
            String respuesta = new GeminiClient().responder(paraEnviar);
            historial.add(new MensajeChat("user", mensaje));
            historial.add(new MensajeChat("model", respuesta));
            while (historial.size() > MAX_HISTORIAL) {
                historial.remove(0);
            }
            JsonObject salida = new JsonObject();
            salida.addProperty("reply", respuesta);
            res.getWriter().write(GSON.toJson(salida));

        } catch (GeminiException e) {
            enviarError(res, e.getHttpStatus(), e.getCodigo(), e.getMessage());
        } catch (Exception e) {
            enviarError(res, 500, "server", "Error del servidor al procesar la consulta.");
        }
    }

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse res) throws IOException {
        res.setCharacterEncoding("UTF-8");
        res.setContentType("application/json;charset=UTF-8");
        enviarError(res, 405, "method_not_allowed", "Use POST para chatear, señora.");
    }

    // Historial en sesión (máximo 20 mensajes)
    @SuppressWarnings("unchecked")
    private List<MensajeChat> obtenerHistorial(HttpSession sesion) {
        List<MensajeChat> historial = (List<MensajeChat>) sesion.getAttribute("historial");
        if (historial == null) {
            historial = new ArrayList<>();
            sesion.setAttribute("historial", historial);
        }
        return historial;
    }

    private String leerCuerpo(HttpServletRequest req) throws IOException {
        StringBuilder sb = new StringBuilder();
        try (BufferedReader lector = req.getReader()) {
            String linea;
            while ((linea = lector.readLine()) != null) {
                sb.append(linea);
            }
        }
        return sb.toString();
    }

    private void enviarError(HttpServletResponse res, int estado, String codigo, String mensaje)
            throws IOException {
        res.setStatus(estado);
        JsonObject salida = new JsonObject();
        salida.addProperty("error", mensaje);
        salida.addProperty("code", codigo);
        res.getWriter().write(GSON.toJson(salida));
    }
}
