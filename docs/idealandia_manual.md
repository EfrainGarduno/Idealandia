# Proyecto Idealandia - Manual de Usuario y Documentación Técnica

## 1. Presentación y propósito de Idealandia
Idealandia es una plataforma digital interactiva diseñada para ofrecer diversos servicios (como asesoría en pensiones y gestión de ideas) integrados con un asistente virtual impulsado por inteligencia artificial llamado **Idealita**. La plataforma busca centralizar utilidades y herramientas en una interfaz unificada, permitiendo a los usuarios interactuar tanto de manera tradicional como mediante un modelo de lenguaje avanzado en modalidades de chat escrito y de voz en tiempo real (Live) utilizando un avatar 3D.

## 2. Arquitectura general y componentes
La arquitectura de Idealandia se divide en dos capas principales:
- **Frontend (SPA):** Una aplicación de página única desarrollada con HTML, CSS y JavaScript (Vanilla). Utiliza `Three.js` y `@pixiv/three-vrm` cargados vía CDN para el renderizado del avatar 3D de Idealita. No utiliza bundlers tradicionales. El enrutamiento se maneja mostrando/ocultando secciones (`.content-section`).
- **Backend (Node.js/Express):** Servidor REST que maneja la autenticación basada en JWT, la integración con la base de datos MySQL, y la conexión con APIs externas (como Gemini AI para Idealita). Implementa Control de Acceso Basado en Roles (RBAC).

## 3. Menú principal y submenús
El menú principal se genera de forma dinámica desde la base de datos (tabla `menu_items`), dependiendo de los permisos y estado de autenticación del usuario. Opciones principales observadas:
- **Inicio:** Página principal de bienvenida.
- **Ideas:** Sección para registrar y consultar ideas generadas por el usuario.
- **Servicios:** Contiene submenús, actualmente enfocado en *Asesoría en Pensiones*.
- **Administrador:** Panel de control con submenús para gestionar *Usuarios*, *Roles*, *Permisos*, *Funcionalidades* y *Menús*.
- **CHAT:** Sección fija para interactuar con Idealita.

## 4. Descripción funcional de cada opción
- **Inicio:** Presenta la plataforma y opciones básicas.
- **Asesoría en Pensiones:** Herramienta que permite calcular un estimado de pensión bajo esquemas específicos (ej. Ley 73 IMSS en México), pidiendo datos como semanas cotizadas y salario promedio.
- **Ideas:** CRUD (Crear, Leer, Actualizar, Borrar) de ideas. El usuario puede guardar conceptos e Idealita puede consultarlos usando herramientas conectadas a la API (`consultar_ideas_usuario`).
- **Chat (Idealita):** Interfaz para interactuar con la IA. Muestra el avatar 3D de Idealita que reacciona (lip-sync) al audio generado.
- **Panel Administrador:** Permite a los usuarios con rol de administrador ver y modificar entidades del sistema (tablas de RBAC y menús dinámicos).

## 5. Requisitos de acceso, autenticación, roles y permisos
Idealandia emplea autenticación por token JWT, almacenado en cookies (`auth_token`).
- **Público:** Inicio, Asesoría en Pensiones, Login, Registro, Recuperación de contraseña.
- **Autenticado (Usuario General):** Chat con Idealita, sección de Ideas.
- **Administrador:** Acceso protegido por el middleware `requireAdmin`, el cual verifica el token contra la base de datos (usando `jwt_version` para revocar sesiones) y los permisos asignados en `usuario_roles`. Acceso completo a `GET/POST/PUT/DELETE` en endpoints `/api/admin/*`.

## 6. Guías paso a paso para los usuarios
- **Crear cuenta:** Clic en "Register", ingresar nombre, email, usuario y contraseña.
- **Iniciar sesión:** Clic en "Login", puede ingresar con su nombre de usuario o correo electrónico y contraseña.
- **Recuperar contraseña:** Desde el Login, usar "Olvidé mi contraseña" para recibir un enlace seguro (requiere email configurado en el servidor).
- **Usar Idealita:** Navegar al CHAT, permitir el acceso al micrófono si se desea usar Idealita Live, e interactuar vía voz o texto.
- **Calcular Pensión:** Ir a Servicios -> Asesoría en Pensiones, llenar el formulario con semanas y salario, y presionar Calcular.

## 7. Idealita Chat e Idealita Live
- **Idealita Chat:** Modo basado en texto. Las respuestas se envían a la API, el modelo de IA procesa la consulta y devuelve un texto (con formato Markdown, sanitizado con DOMPurify).
- **Idealita Live:** Integración avanzada con la API de Gemini Live por WebSockets. Permite el envío bidireccional de audio. Utiliza un Avatar VRM en 3D cuyas expresiones faciales (lip-sync) responden al espectro de audio recibido, manteniendo animaciones de descanso (respiración) independientes. La lógica se interrumpe limpiamente usando `stopLive`. Soporta llamadas a funciones (`functionCalling`).

## 8. API y servicios internos relevantes
- **Autenticación:** `/api/login`, `/api/register`, `/api/recover`, `/api/logout`, `/api/me`.
- **Menú y Vistas:** `/api/menu` (Devuelve el árbol jerárquico según permisos).
- **Ideas:** `/api/ideas` (CRUD de ideas).
- **Idealita:** `/api/chat` (Modo texto), `/api/live-token` (Token de sesión para Gemini Live).
- **Administrador:** `/api/admin/*` (Gestión completa de entidades).
- **Correo:** Se usa `nodemailer` configurado con SMTP de Gmail.

## 9. Modelo de datos (Entidades relevantes)
- `usuarios`: Almacena credenciales, email y `jwt_version` para invalidar sesiones.
- `roles`, `permisos`, `funcionalidades`: Tablas catálogo para el esquema RBAC.
- `usuario_roles`, `rol_permisos`, `funcionalidad_permisos`: Tablas intermedias/unión (Junction tables).
- `menu_items`: Controla el menú dinámico (`id`, `nombre`, `parent_id`, `orden`, `funcionalidad_id`, `publico`).
- `ideas`: Registra las ideas (`id`, `usuario_id`, `titulo`, `descripcion`, `estado`).
- `password_resets`: Manejo seguro de recuperación (`token_hash`, `expires_at`).

## 10. Preguntas frecuentes, errores habituales y posibles soluciones
- **Error: "Acceso denegado" al entrar al Administrador.** Solución: Asegurarse de tener el rol adecuado activo; si es recién asignado, recargar sesión.
- **Error: El avatar 3D no carga.** Solución: Puede ocurrir si el dispositivo no soporta WebGL o si las librerías CDN fallan. La app muestra un "fallback".
- **Error: No recibo el correo de recuperación.** Solución: El administrador debe revisar la configuración de variables SMTP en el archivo `.env`. Si no está configurado, el sistema reporta éxito por seguridad (para evitar enumeración).
- **Problema: Lip-sync extraño durante escucha.** Solución: Es un comportamiento esperado, cuando Idealita escucha el micrófono (`isListening`), la escala de la boca se fija en 1.

## 11. Limitaciones conocidas y funcionalidades pendientes
- Las visitas de la plataforma se guardan en un archivo local `visitas.json` en lugar de una base de datos, lo cual puede ser un cuello de botella para alta concurrencia.
- La gestión de menú dinámico asume dos niveles (padre-hijo). Árboles más complejos no están visualmente implementados.
- Funcionalidades experimentales pendientes de integración completa: La respuesta con voz usando Web Speech API en Chat normal (no-Live) está en desarrollo/alternativa.

## 12. Glosario de términos de Idealandia
- **Idealita:** Asistente IA de Idealandia.
- **RBAC (Role-Based Access Control):** Control de acceso en la base de datos usando Roles y Permisos.
- **VRM:** Formato de modelo 3D utilizado para el avatar de Idealita (`idealita.vrm`).
- **Gemini Live:** API en tiempo real que permite interacciones de voz y herramientas (function calling) directamente desde el frontend.
- **Fallback:** Comportamiento por defecto cuando el avatar 3D no se puede cargar (ej. en pruebas JSDOM).
