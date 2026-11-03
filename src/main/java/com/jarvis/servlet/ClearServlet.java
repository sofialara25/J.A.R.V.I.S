package com.jarvis.servlet;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import java.io.IOException;
import javax.servlet.annotation.WebServlet;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

/** POST /api/clear: vacía el historial de la conversación de la sesión. */
@WebServlet("/api/clear")
public class ClearServlet extends HttpServlet {

    private static final Gson GSON = new Gson();

    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse res) throws IOException {
        req.getSession().removeAttribute("historial");
        responder(res);
    }

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse res) throws IOException {
        req.getSession().removeAttribute("historial");
        responder(res);
    }

    private void responder(HttpServletResponse res) throws IOException {
        res.setCharacterEncoding("UTF-8");
        res.setContentType("application/json;charset=UTF-8");
        JsonObject salida = new JsonObject();
        salida.addProperty("ok", true);
        res.getWriter().write(GSON.toJson(salida));
    }
}
