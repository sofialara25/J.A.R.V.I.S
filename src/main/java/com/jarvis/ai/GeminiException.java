package com.jarvis.ai;

/**
 * Error del proveedor de IA con código y estado HTTP claros
 * para devolverlos al frontend.
 */
public class GeminiException extends Exception {

    private final String codigo;
    private final int httpStatus;

    public GeminiException(String codigo, String mensaje, int httpStatus) {
        super(mensaje);
        this.codigo = codigo;
        this.httpStatus = httpStatus;
    }

    public String getCodigo() {
        return codigo;
    }

    public int getHttpStatus() {
        return httpStatus;
    }
}
