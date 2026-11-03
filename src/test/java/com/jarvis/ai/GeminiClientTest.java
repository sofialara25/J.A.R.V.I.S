package com.jarvis.ai;

import com.jarvis.util.Configuracion;
import org.junit.Test;
import static org.junit.Assert.*;

/** Pruebas sin red: modo mock y configuración. */
public class GeminiClientTest {

    @Test
    public void modeloPorDefectoNoVacio() {
        assertNotNull(Configuracion.getModelo());
        assertFalse(Configuracion.getModelo().isBlank());
        assertNotNull(Configuracion.getModeloRespaldo());
        assertFalse(Configuracion.getModeloRespaldo().isBlank());
    }

    @Test
    public void mockRespondeTextoEnPersonaje() {
        // Se prueba la respuesta mock directamente: la prueba no debe depender de red ni de la clave
        String respuesta = new GeminiClient().respuestaMock();
        assertNotNull(respuesta);
        assertFalse(respuesta.isBlank());
        assertTrue(respuesta.toLowerCase().contains("señora"));
    }
}
