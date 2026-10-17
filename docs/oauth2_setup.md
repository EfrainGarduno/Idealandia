# Configuración de OAuth2 para Outlook/Hotmail

Microsoft ha deshabilitado la autenticación básica (usuario y contraseña) para el envío de correos SMTP en cuentas personales (`@outlook.com`, `@hotmail.com`, etc.). Para continuar enviando correos desde estas cuentas usando Nodemailer, es necesario configurar OAuth2.

A continuación, se detallan los pasos para obtener las credenciales necesarias sin exponer tus contraseñas personales y para configurar el servidor de manera segura.

## 1. Registrar una aplicación en Microsoft Azure / Entra ID
1. Ingresa a [Portal de Azure](https://portal.azure.com/) utilizando la cuenta personal de Microsoft desde la cual enviarás los correos.
2. Navega a **Microsoft Entra ID** (anteriormente Azure Active Directory) y luego a **App registrations** (Registros de aplicaciones).
3. Haz clic en **New registration** (Nuevo registro).
4. **Name**: Ingresa un nombre reconocible (por ejemplo, `Idealandia SMTP`).
5. **Supported account types**: Selecciona **"Accounts in any organizational directory (Any Microsoft Entra ID tenant - Multitenant) and personal Microsoft accounts (e.g. Skype, Xbox)"**. Es *muy importante* seleccionar esta opción para cuentas personales.
6. **Redirect URI**: Selecciona **Web** e introduce una URL segura que controles (si solo usarás un script local para obtener el token, puedes usar `http://localhost`).
7. Haz clic en **Register**.

## 2. Obtener el Client ID y generar el Client Secret
1. Una vez registrada, copia el valor de **Application (client) ID**. Este será tu `SMTP_CLIENT_ID`.
2. Ve a **Certificates & secrets** (Certificados y secretos) en el panel izquierdo.
3. Haz clic en **New client secret**.
4. Añade una descripción y selecciona una expiración (hasta 24 meses). Haz clic en **Add**.
5. **¡IMPORTANTE!** Copia el **Value** del secreto que acaba de aparecer. Solo se mostrará una vez. Este será tu `SMTP_CLIENT_SECRET`.

## 3. Configurar Permisos de API
1. En el panel izquierdo de tu aplicación, ve a **API permissions** (Permisos de API).
2. Haz clic en **Add a permission** -> **Microsoft Graph** -> **Delegated permissions**.
3. Busca y marca los siguientes permisos:
   - `Mail.Send` (Para poder enviar correos)
   - `offline_access` (Necesario para obtener el `refresh_token` de larga duración)
   - `User.Read` (Generalmente añadido por defecto, no lo elimines)
4. Haz clic en **Add permissions**.

## 4. Obtener el Refresh Token (Una sola vez)
Puesto que esta aplicación enviará correos de manera automatizada en el backend sin intervención de un usuario, necesitamos obtener un `refresh_token` que se usará para obtener nuevos tokens de acceso cada vez que se necesite enviar un correo.

Debes ejecutar este flujo una vez desde tu navegador o desde herramientas como Postman u OAuth2 Playground (como la herramienta para obtener tokens OAuth de Microsoft).

**Paso A: Autorización**
Abre la siguiente URL en tu navegador web, reemplazando `TU_CLIENT_ID` por el ID obtenido en el paso 2 y `URL_REDIRECCION` por la configurada en el paso 1 (ej: `http://localhost`):

```
https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=TU_CLIENT_ID&response_type=code&redirect_uri=URL_REDIRECCION&response_mode=query&scope=offline_access%20Mail.Send&state=12345
```

Accede con la cuenta que envía los correos, y otorga los permisos solicitados.
Serás redirigido a una URL que contendrá un parámetro `code`. Por ejemplo:
`http://localhost/?code=M.R3_BAY.xxxxxxx&state=12345`

Copia todo el valor de `code` (es un código muy largo).

**Paso B: Intercambiar por el Refresh Token**
Inmediatamente (el código expira rápido), haz una petición POST (puedes usar `curl` o Postman) a la siguiente URL:

```bash
curl -X POST https://login.microsoftonline.com/common/oauth2/v2.0/token \
     -d "client_id=TU_CLIENT_ID" \
     -d "scope=offline_access Mail.Send" \
     -d "code=EL_CODIGO_COPIADO" \
     -d "redirect_uri=URL_REDIRECCION" \
     -d "grant_type=authorization_code" \
     -d "client_secret=TU_CLIENT_SECRET"
```

La respuesta JSON contendrá un `refresh_token`. Cópialo. ¡Cuidado, este token da acceso permanente (hasta que lo revoques o expire por inactividad prolongada) a enviar correos en tu nombre!

## 5. Configurar el Entorno en Idealandia

Guarda los siguientes valores en tu archivo `.env` o en las variables de entorno de tu servidor de producción:

```env
SMTP_USER=tu_correo@hotmail.com
SMTP_CLIENT_ID=TU_CLIENT_ID
SMTP_CLIENT_SECRET=TU_CLIENT_SECRET
SMTP_REFRESH_TOKEN=EL_REFRESH_TOKEN
```

No configures `SMTP_PASS` si usas OAuth2 para evitar confusiones.

El servidor de Idealandia detectará automáticamente la presencia de `SMTP_CLIENT_ID` y usará el flujo OAuth2 de forma segura en las peticiones de recuperación de contraseña.

## 6. Rotación y Renovación
Si el `refresh_token` alguna vez expira, falla o es comprometido:
1. Elimina el secreto anterior en el Portal de Azure.
2. Crea un nuevo Client Secret.
3. Repite el Paso 4 para obtener un nuevo `refresh_token`.
4. Actualiza las variables de entorno en producción y reinicia el servicio.
