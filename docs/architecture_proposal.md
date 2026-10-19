# Propuesta de Arquitectura: Integración de Conocimiento en Idealita (v2)

## 1. Servicio Compartido de Conocimiento
Para que Idealita Chat (texto) e Idealita Live (voz) utilicen la misma base de conocimiento de forma coherente y segura, se creará un módulo unificado (`knowledgeService.js`) en el backend.
- Realizará búsquedas locales (basadas en secciones, títulos y palabras clave o expresiones regulares) sobre `docs/idealandia_manual.md` y `docs/idealandia_capabilities.json`.
- **No se integrarán bases de datos vectoriales** (ej. Pinecone) ni dependencias adicionales, ya que el tamaño del manual y el catálogo actual es manejable en memoria, y un buscador local por palabras clave/secciones es suficiente para el alcance del proyecto, minimizando dependencias y costos de infraestructura.

## 2. Autenticación y Control de Acceso (RBAC)
El `knowledgeService.js` no confiará en que el cliente o la IA envíe un `userId`. En su lugar:
1. Extraerá el token de autenticación directamente de las cookies de la sesión (`req.cookies.auth_token`).
2. Utilizará la función centralizada `verifyToken(token, pool)` (existente en `server.js`) para garantizar que la solicitud provenga de una sesión válida y no revocada.
3. Consultará a la base de datos a través de las tablas de RBAC (`usuario_roles`, `rol_permisos`, `funcionalidad_permisos`) para obtener los permisos *efectivos* de esa sesión antes de proporcionar respuestas.
4. Jamás revelará rutas protegidas, información de otros usuarios o menús administrativos a usuarios que no posean los roles correspondientes. La herramienta de la IA se limitará a leer lo que el backend le autoriza.

## 3. Consulta Real de Menús Dinámicos
Para evitar proporcionar información obsoleta basada en el JSON, el sistema cruzará la documentación con la realidad de la plataforma:
- Se reutilizará la lógica del endpoint interno `/api/menu` (o se refactorizará para ser una función compartida en el backend) que genera el árbol de navegación.
- Esta consulta pasará por el filtro RBAC del usuario autenticado.
- Idealita recibirá un objeto que diferencie claramente: *"Esta opción existe en la documentación, pero no tienes acceso a ella"* frente a *"Esta opción la tienes disponible en tu menú actual"*.
- No se simulará una petición HTTP interna, se llamará a la lógica de negocio (por ejemplo, `buildUserMenuTree(userId)`) de forma directa y segura.

## 4. Integración con Idealita Live y Chat (Herramientas)
**Idealita Live (Mecanismo Actual en `index.html`):**
La implementación actual de Idealita Live instancia la conexión WebSocket directamente desde el frontend e inicializa las herramientas mediante el mensaje `setup`. Para no romper esto ni requerir un nuevo endpoint innecesario (`/api/knowledge`), se aprovechará un endpoint ya estructurado para este propósito, por ejemplo, creando `GET /api/knowledge/context` o combinando la información del menú y capacidades dentro de `GET /api/me`.
1. En el frontend, agregaremos la herramienta `consultar_documentacion` al array de `tools` en el evento `setup`.
2. Al recibir un `functionCall` para `consultar_documentacion`, el frontend realizará un `fetch('/api/knowledge?query=...')` enviando las cookies de sesión de forma automática.
3. El backend validará la sesión, filtrará el RBAC, consultará el manual/menú y devolverá JSON.
4. El frontend responderá al WebSocket con `functionResponse`.

**Idealita Chat (Texto en `server.js`):**
El chat de texto actual en `/api/chat` instancia el cliente `@google/genai`. Se agregará la declaración de la herramienta (Tool Calling) en el backend y se ejecutará el `knowledgeService` de manera nativa sin pasar por peticiones HTTP.

## 5. Respuestas Fundamentadas y Sin Alucinaciones
Cada fragmento devuelto a la IA incluirá la cita (ej. `[Fuente: Manual, Sección 4]`).
Las **System Instructions** de Gemini serán estrictas:
*"Eres Idealita. Responde estrictamente basado en los datos proporcionados por tus herramientas. Siempre menciona la fuente de la documentación si la utilizas. Si un usuario te pregunta por algo y la herramienta responde que no hay acceso o no existe, DEBES responder exactamente eso: 'Lo siento, no tienes acceso a esa función' o 'No tengo información sobre esa capacidad'. NO INVENTES pasos. NO UTILICES la herramienta para eludir restricciones del sistema."*

## 6. Estrategia de Documentación Vigente
Dado que la DB real y el código pueden evolucionar:
- El JSON (`idealandia_capabilities.json`) actuará como contrato.
- Durante la consulta de conocimiento, el servicio comparará las rutas/funcionalidades del JSON con las obtenidas *en vivo* de la DB.
- Si un menú aparece en la DB pero no en el JSON, el modelo de IA informará al usuario basándose en el título real de la DB, indicando: *"La opción está en tu menú, pero no hay documentación ampliada al respecto."*
- Se agregará un script de validación (ej. `npm run check-docs`) que en CI compare las capacidades documentadas con la estructura actual del proyecto para levantar *warnings* si quedan desactualizadas.

## 7. Pruebas Requeridas
Se deben añadir pruebas integrales para garantizar la seguridad:
- **Unitarias:**
  - Búsqueda en MD/JSON con términos correctos e incorrectos.
  - Generación del árbol de menú RBAC desde Node.js (función refactorizada).
- **Integración (`test_knowledge.js`):**
  - Un usuario *Guest* intenta preguntar por el panel administrador (Debe recibir un "No autorizado").
  - Un *Admin* pregunta por el panel y recibe las instrucciones correctas.
- **E2E (Mock UI):**
  - Que el evento `functionCall` en Idealita Live dispare correctamente el `fetch` al backend y procese el `functionResponse`.
  - Confirmar que el flujo actual de `consultar_ideas_usuario` no se interrumpe.
