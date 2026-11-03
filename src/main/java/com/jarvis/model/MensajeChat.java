package com.jarvis.model;

/**
 * Un mensaje del historial de la conversación.
 * role: "user" (la señora) o "model" (J.A.R.V.I.S.).
 */
public class MensajeChat {

    private final String role;
    private final String content;

    public MensajeChat(String role, String content) {
        this.role = role;
        this.content = content;
    }

    public String getRole() {
        return role;
    }

    public String getContent() {
        return content;
    }
}
