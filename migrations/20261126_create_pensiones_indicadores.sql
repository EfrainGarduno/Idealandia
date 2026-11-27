-- =============================================================================
-- MIGRACIÓN: Sistema de Indicadores de Pensiones e Historial de Auditoría
-- Fecha: 2026-11-26
-- Objetivo: Crear tablas dedicadas pensiones_indicadores y pensiones_indicadores_historial
-- Nota: Estructura vacía, sin sembrado definitivo de valores hasta validación legal
-- =============================================================================

CREATE TABLE IF NOT EXISTS pensiones_indicadores (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(64) NOT NULL,
    regimen ENUM('ley73', 'ley97', 'general') NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    descripcion TEXT NULL,
    valor DECIMAL(14, 4) NOT NULL,
    unidad ENUM('MXN_DIARIO', 'MXN_MENSUAL', 'UMA_DIARIA', 'PORCENTAJE') NOT NULL,
    tipo_valor ENUM('OFICIAL', 'ESTIMADO') NOT NULL DEFAULT 'OFICIAL',
    anio_referencia INT NOT NULL,
    fecha_vigencia_inicio DATE NOT NULL,
    fecha_vigencia_fin DATE NULL,
    fuente VARCHAR(150) NOT NULL,
    fuente_url VARCHAR(255) NULL,
    fundamento_legal TEXT NOT NULL,
    formula_calculo TEXT NULL,
    metodo_obtencion ENUM('AUTOMATICA', 'MANUAL') NOT NULL DEFAULT 'MANUAL',
    activo TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_indicador_regimen_anio (codigo, regimen, anio_referencia),
    INDEX idx_pension_busqueda (regimen, codigo, activo, fecha_vigencia_inicio, fecha_vigencia_fin),
    INDEX idx_pension_anio (anio_referencia, activo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pensiones_indicadores_historial (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    indicador_id INT UNSIGNED NOT NULL,
    codigo VARCHAR(64) NOT NULL,
    regimen ENUM('ley73', 'ley97', 'general') NOT NULL,
    valor_anterior DECIMAL(14, 4) NULL,
    valor_nuevo DECIMAL(14, 4) NOT NULL,
    tipo_valor_nuevo ENUM('OFICIAL', 'ESTIMADO') NOT NULL,
    fecha_cambio TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    motivo VARCHAR(255) NOT NULL,
    fuente VARCHAR(150) NOT NULL,
    fuente_url VARCHAR(255) NULL,
    usuario_id BIGINT UNSIGNED NULL,
    metodo_actualizacion ENUM('AUTOMATICA', 'MANUAL') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_hist_indicador FOREIGN KEY (indicador_id) 
        REFERENCES pensiones_indicadores(id) ON DELETE CASCADE,
    INDEX idx_hist_indicador (indicador_id, fecha_cambio DESC),
    INDEX idx_hist_usuario (usuario_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
