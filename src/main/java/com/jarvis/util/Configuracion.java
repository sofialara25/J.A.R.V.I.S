package com.jarvis.util;

import java.io.IOException;
import java.io.InputStream;
import java.util.Properties;

/**
 * Lee la configuración de config.properties con respaldo en
 * la variable de entorno GEMINI_API_KEY.
 */
public final class Configuracion {

    private static final String RUTA = "/config.properties";
    // Modelos verificados con generateContent (2.5-flash ya no acepta usuarios nuevos)
    public static final String MODELO_POR_DEFECTO = "gemini-3.5-flash";
    public static final String MODELO_RESPALDO = "gemini-flash-lite-latest";

    private static Properties props;

    private Configuracion() {
    }

    private static Properties cargar() {
        if (props == null) {
            props = new Properties();
            try (InputStream in = Configuracion.class.getResourceAsStream(RUTA)) {
                if (in != null) {
                    props.load(in);
                }
            } catch (IOException e) {
                // Si no se puede leer, se queda vacío y se va a modo mock
            }
        }
        return props;
    }

    /** Clave de la API: config.properties primero, variable de entorno como respaldo. Vacía = modo mock. */
    public static String getApiKey() {
        String key = cargar().getProperty("gemini.api.key", "");
        if (key == null || key.isBlank()) {
            key = System.getenv("GEMINI_API_KEY");
        }
        if (key == null) {
            return "";
        }
        key = key.trim();
        if (key.isEmpty() || key.startsWith("TU_")) {
            return "";
        }
        return key;
    }

    /** Modelo configurado; si falta, el valor por defecto. */
    public static String getModelo() {
        String modelo = cargar().getProperty("gemini.model", "");
        if (modelo == null || modelo.isBlank()) {
            return MODELO_POR_DEFECTO;
        }
        return modelo.trim();
    }

    /** Modelo a usar si el configurado no existe en la API. */
    public static String getModeloRespaldo() {
        String modelo = getModelo();
        return MODELO_RESPALDO.equals(modelo) ? MODELO_POR_DEFECTO : MODELO_RESPALDO;
    }
}
