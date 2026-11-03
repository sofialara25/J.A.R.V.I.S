package com.jarvis.ai;

import com.jarvis.util.Configuracion;
import java.util.ArrayList;
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
    public void mockRespondeTextoEnPersonaje() throws Exception {
        String respuesta = new GeminiClient().responder(new ArrayList<>());
        assertNotNull(respuesta);
        assertFalse(respuesta.isBlank());
        assertTrue(respuesta.toLowerCase().contains("señora"));
    }
}
