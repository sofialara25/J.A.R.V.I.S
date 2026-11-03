# J.A.R.V.I.S.

Asistente virtual inspirado en la IA de Iron Man. Proyecto académico de consumo de APIs con IA (Google Gemini).

## Requisitos

- JDK 17 o superior
- Apache Tomcat 9
- Apache NetBeans con Maven

## API key

1. Consigue tu clave en https://aistudio.google.com/apikey
2. Edita `src/main/resources/config.properties`
3. Pega la clave en `gemini.api.key`

Sin clave, la app corre en modo mock (respuestas de prueba). También se lee de la variable de entorno `GEMINI_API_KEY`. El modelo va en `gemini.model` (por defecto `gemini-2.5-flash`).

## Ejecutar

1. Abre el proyecto con **File > Open Project** en NetBeans
2. Clic derecho sobre el proyecto > **Run** (se despliega en Tomcat 9)
3. Abre http://localhost:8080/jarvis/

Compilar desde terminal: `mvn clean package` (genera `target/jarvis.war`).
