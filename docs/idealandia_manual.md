# Proyecto Idealandia - Manual de Usuario y Documentación Técnica

## PARTE A. Manual de Usuario

### 1. Presentación y propósito de Idealandia
Idealandia es una plataforma digital interactiva diseñada para ofrecer diversos servicios (como asesoría en pensiones y gestión de ideas) integrados con un asistente virtual impulsado por inteligencia artificial llamado **Idealita**.

### 2. Navegación y página de Inicio
El menú principal se genera de forma dinámica. La página de Inicio presenta la plataforma y las opciones básicas disponibles para cualquier visitante sin necesidad de autenticarse.

### 3. Registro, inicio de sesión, cierre de sesión y recuperación de contraseña
- **Crear cuenta:** Clic en "Register", ingresar nombre, email, usuario y contraseña.
- **Iniciar sesión:** Clic en "Login", ingresando con usuario o correo electrónico.
- **Recuperar contraseña:** Usar "Olvidé mi contraseña" para recibir un enlace seguro válido por 10 minutos (requiere configuración SMTP).
- **Cierre de sesión:** Disponible para usuarios autenticados, revoca la validez del token en la base de datos.

### 4. Gestión de Ideas
- **Funcionalidad:** Permite registrar, consultar, filtrar, editar y eliminar ideas.
- **Restricciones:** Cada usuario solo puede ver y modificar sus propias ideas, garantizado por aislamiento en el backend. Los estados disponibles son: pendiente, completada, en progreso, descartada.

### 5. Servicios y submenús
- **Asesoría en Pensiones:** Herramienta pública para calcular un estimado de pensión (ej. Ley 73 IMSS) pidiendo semanas cotizadas y salario promedio.
- **Submenús adicionales (Ideas Innovadoras, Emprendimientos, Clases de Inglés, Perfilamiento):** Servicios complementarios en desarrollo para usuarios autenticados.

### 6. Recursos Gratis
Biblioteca pública de herramientas y recursos gratuitos (en desarrollo).

### 7. Contáctanos
Formulario e información de contacto pública (en desarrollo).

### 8. Acerca de
Información sobre Idealandia y su equipo, disponible públicamente.

### 9. Idealita Chat y Gemini Live
- **Idealita Chat:** Interfaz de texto. El modelo de IA procesa la consulta y devuelve texto enriquecido con formato Markdown.
- **Idealita Live:** Integración avanzada con la API de Gemini Live por WebSockets. Permite envío bidireccional de voz y texto con un Avatar 3D VRM (lip-sync reactivo). Idealita tiene herramientas integradas como consultar el manual y recuperar las ideas del usuario actual.

### 10. Administración y submenús
Panel de control protegido para gestionar *Usuarios*, *Roles*, *Permisos*, *Funcionalidades* y *Menús*. Exclusivo para administradores.

### 11. Preguntas frecuentes y solución de errores
- **Avatar 3D no carga:** Puede ocurrir si el dispositivo no soporta WebGL. Se mostrará un modo de texto (fallback).
- **Acceso denegado:** Asegurarse de haber iniciado sesión y tener los permisos correspondientes.
- **Fallo en recuperación de contraseña:** Verificar que el enlace no haya superado los 10 minutos de validez y no se haya utilizado previamente.

---

## PARTE B. Documentación Técnica

### Arquitectura frontend y backend
- **Frontend (SPA):** Single Page Application en HTML, CSS, y JS puro. Manejo de vistas dinámicas mostrando/ocultando secciones (`.content-section`). Uso de Three.js para el renderizado VRM.
- **Backend:** Node.js con Express, integración MySQL y uso de `mysql2/promise` para consultas SQL.

### Menú dinámico y RBAC
El sistema lee el árbol de navegación desde la tabla `menu_items` cruzando con `usuario_roles` y `rol_permisos` para renderizar únicamente las opciones a las que el usuario tiene acceso.

### Autenticación, JWT, cookies y revocación de sesiones
Mecanismo JWT almacenado en cookies (`auth_token`). La tabla `usuarios` incluye `jwt_version` para invalidar sesiones globalmente si se cierra sesión o se cambia la contraseña de forma forzada.

### Endpoints y métodos HTTP
- `/api/login`, `/api/register`, `/api/recover` (Autenticación)
- `/api/ideas` (GET, POST, DELETE, PUT para gestionar ideas con validación de `usuario_id`)
- `/api/live-token` (Genera tokens temporales para conectarse a Gemini Live)
- `/api/chat` (Fallback de ejecución en texto para Gemini)

### Integración con Gemini, Carga de Contexto y Herramientas
- **WebSockets y Live API:** Conexión directa desde `index.html` enviando un `setupMessage`.
- **Herramientas (Function Calling):**
  - `consultar_documentacion`: Busca en la base de conocimientos manual.
  - `consultar_ideas_usuario`: Consulta SQL parametrizada a `/api/ideas` inyectada como un `FunctionResponse`.
- **Carga y Composición del Contexto Inicial:** Para proveer a Idealita con memoria de sesión, el frontend realiza una pre-carga (`fetch`) a `/api/ideas` al momento de configurar la conexión de voz o texto, construyendo un bloque estructurado ("CONTEXTO PERSONAL DEL USUARIO AUTENTICADO") que se inyecta directamente en las `systemInstructions` del `setupMessage`. Esto evita sobrecargar a la IA con mensajes secundarios de `clientContent` y elimina los problemas de saturación de atención en Gemini.
- **Actualizaciones:** Si el usuario solicita datos actualizados durante la sesión, Idealita utilizará la herramienta `consultar_ideas_usuario` para hacer fetch al servidor en tiempo real.

### Recuperación de contraseña y SMTP
Módulo `nodemailer` configurado con variables SMTP. Los tokens expiran estrictamente a los 10 minutos validados a nivel de base de datos usando `DATE_ADD(NOW(), INTERVAL 10 MINUTE)`.

### Pruebas automatizadas y Despliegue
Incluye baterías de JSDOM para pruebas de UI y `mysql2` mockeado para pruebas de endpoints. Limitación verificada: El contador de visitas se persiste en `visitas.json`.
