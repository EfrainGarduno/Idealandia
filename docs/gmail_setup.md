# Configuración de SMTP para Gmail

Idealandia utiliza Gmail SMTP para enviar correos de recuperación de contraseña a través de la cuenta `idealandiamx@gmail.com`.

Google ha deshabilitado el acceso a aplicaciones menos seguras (autenticación básica con la contraseña normal). Para enviar correos automatizados, es necesario usar una **Contraseña de Aplicación**.

A continuación, se detallan los pasos para configurar la cuenta y el servidor de manera segura.

## 1. Activar la Verificación en 2 pasos
Para generar una contraseña de aplicación, la cuenta de Google debe tener habilitada la verificación en dos pasos:

1. Inicia sesión en la cuenta de Google (e.g. `idealandiamx@gmail.com`).
2. Ve a **Gestionar tu cuenta de Google** -> **Seguridad**.
3. En la sección "Cómo inicias sesión en Google", selecciona **Verificación en dos pasos**.
4. Sigue las instrucciones para activarla usando un número de teléfono o la aplicación Google Authenticator.

## 2. Crear una Contraseña de Aplicación
Una vez activada la verificación en dos pasos:

1. Vuelve a la pestaña **Seguridad** de tu cuenta de Google.
2. Usa la barra de búsqueda superior y busca "Contraseñas de aplicación" (App passwords).
3. Escribe un nombre descriptivo para identificar la contraseña, por ejemplo, "Idealandia SMTP Backend".
4. Haz clic en **Crear**.
5. Aparecerá una contraseña de 16 caracteres. **Cópiala inmediatamente**, ya que no podrás verla de nuevo.

*Nunca guardes esta contraseña en código versionado (como en GitHub).*

## 3. Configurar el Entorno

Idealandia requiere la siguiente configuración para conectarse al SMTP de Gmail. Debes configurar estas variables de entorno en tu entorno de despliegue.

### Desarrollo Local (Archivo `.env`)
Si tienes un archivo `.env` en tu máquina local, no incluyas la contraseña si vas a compartir el código, puedes tenerlo así para tu entorno:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=idealandiamx@gmail.com
SMTP_PASS=xxxx_xxxx_xxxx_xxxx  # La contraseña de 16 caracteres sin espacios
SMTP_FROM='"Idealandia" <idealandiamx@gmail.com>'
```

*(Nota: En el repositorio, el archivo `.env.example` se incluye con la variable `SMTP_PASS` vacía).*

### GitHub Codespaces
Si utilizas Codespaces para desarrollo:
1. Ve a tu repositorio en GitHub.
2. Navega a **Settings** -> **Secrets and variables** -> **Codespaces**.
3. Añade un nuevo "Repository secret" para `SMTP_PASS` y añade el valor generado de 16 caracteres.
4. Reinicia tu Codespace para que reconozca los nuevos secretos.

### Servidor de Producción (Oracle Cloud Infrastructure - OCI)
Para configurar las variables de entorno en tu servidor OCI de producción:
1. Conéctate a tu instancia mediante SSH.
2. Edita el archivo `.env` de producción del proyecto en la ruta donde se ejecuta el servidor.
   ```bash
   nano /ruta/a/tu/proyecto/.env
   ```
3. Añade o actualiza la configuración:
   ```env
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=idealandiamx@gmail.com
   SMTP_PASS=tupasswordde16caracteres  # Pegar la contraseña de aplicación
   SMTP_FROM='"Idealandia" <idealandiamx@gmail.com>'
   ```
4. Reinicia tu servicio (ejemplo si usas PM2 o Systemd):
   ```bash
   pm2 restart server  # O el comando correspondiente a tu entorno
   ```

## 4. Pruebas y Seguridad
Si la configuración falta o es incorrecta, el servidor registrará un error en sus logs pero continuará ejecutándose.
En ningún caso la contraseña de aplicación o tokens se registrarán en los archivos de log para mantener la seguridad.
