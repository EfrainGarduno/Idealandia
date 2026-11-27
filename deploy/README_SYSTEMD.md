# Configuración y Despliegue de Systemd Timer para Idealandia (Fase 4)

Este directorio contiene los archivos de configuración para la ejecución periódica desacoplada de la sincronización de indicadores legales en el servidor de producción / staging (Oracle Cloud Linux VM).

> **IMPORTANTE**: Estos archivos NO se activan en producción de forma automática. Su instalación y activación en el sistema operativo del host requerirá tu autorización explícita previa.

---

## 1. Archivos incluidos
- **`idealandia-pension-sync.service`**: Unidad oneshot que invoca el endpoint local `/api/admin/pensiones/indicadores/sincronizar` enviando la cabecera `X-Sync-Cron-Secret` cargada de forma segura desde `/var/www/idealandia/.env`.
- **`idealandia-pension-sync.timer`**: Temporizador que dispara el servicio de lunes a viernes a las 06:00 AM, con persistencia ante reinicios y desfase aleatorio (*jitter*) de 5 minutos.

---

## 2. Parámetros de Seguridad y Variables
El servicio lee `/home/opc/Idealandia/.env`:
```bash
# Secreto interno para autorizar el cron sin sesión de usuario en navegador
SYNC_CRON_SECRET=cadena_secreta_aleatoria_64_bits

# Credenciales oficiales para APIs externas (nunca en Git ni logs)
BANXICO_TOKEN=tu_token_oficial_banxico_sie
INEGI_TOKEN=tu_token_oficial_inegi_bie
```

---

## 3. Comportamiento y Resiliencia
- **Usuario**: Corre bajo el usuario de sistema `opc` (mismo usuario que ejecuta la app Node.js).
- **Reintentos**: En caso de fallo transitorio, reintenta tras 30 segundos.
- **Reinicios del Servidor**: Con `Persistent=true`, si el servidor estuvo apagado durante las 06:00 AM, systemd ejecuta la sincronización inmediatamente después del arranque.
- **Logs**: Se registran en `journalctl -u idealandia-pension-sync` y en la tabla de base de datos `pensiones_sincronizaciones`.
