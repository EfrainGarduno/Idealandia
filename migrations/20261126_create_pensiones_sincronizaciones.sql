-- =============================================================================
-- MIGRACIÓN: Tabla de Telemetría de Sincronizaciones y Bloqueo Manual (Fase 4)
-- Fecha: 2026-11-26
-- Objetivo: Crear tabla pensiones_sincronizaciones y agregar columna de bloqueo
-- =============================================================================

CREATE TABLE IF NOT EXISTS pensiones_sincronizaciones (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    fuente VARCHAR(64) NOT NULL,
    indicador_codigo VARCHAR(64) NOT NULL,
    ejercicio_fiscal INT NOT NULL,
    estado ENUM(
        'EXITO_ACTUALIZADO',
        'EXITO_SIN_CAMBIOS',
        'ERROR_TIMEOUT',
        'ERROR_HTTP',
        'ERROR_PARSER',
        'RECHAZADO_VALIDACION',
        'ERROR_DISCREPANCIA',
        'BLOQUEO_MANUAL_ACTIVO',
        'SINCRONIZACION_OMITIDA',
        'ERROR_BD'
    ) NOT NULL,
    valor_anterior DECIMAL(14, 4) NULL,
    valor_candidato DECIMAL(14, 4) NULL,
    es_dry_run TINYINT(1) NOT NULL DEFAULT 0,
    detalles TEXT NULL,
    duracion_ms INT UNSIGNED NULL,
    ip_origen VARCHAR(45) NULL,
    usuario_id BIGINT UNSIGNED NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_sync_estado (estado, created_at DESC),
    INDEX idx_sync_indicador (indicador_codigo, ejercicio_fiscal),
    INDEX idx_sync_fecha (created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
