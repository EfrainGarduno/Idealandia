-- =============================================================================
-- Migración: Tabla de Configuración de Estrategias de Inversión Diversificada
-- Archivo: migrations/20261123_create_finanzas_estrategias_config.sql
-- Propósito: Almacena los parámetros dinámicos de diversificación (concentración
--            máxima por institución, límites por tipo, número mínimo de entidades)
--            para alimentar el simulador financiero sin valores quemados en código.
-- =============================================================================

CREATE TABLE IF NOT EXISTS finanzas_estrategias_config (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(50) NOT NULL UNIQUE,
    nombre VARCHAR(100) NOT NULL,
    color VARCHAR(20) NOT NULL DEFAULT '#16a34a',
    icono VARCHAR(50) NOT NULL DEFAULT 'fas fa-chart-line',
    max_concentracion_inst DECIMAL(5,2) NOT NULL,
    min_instituciones INT UNSIGNED DEFAULT 1,
    max_concentracion_tipo DECIMAL(5,2) NULL,
    diversificar_tipos TINYINT(1) DEFAULT 0,
    asignacion_minima_viable DECIMAL(12,2) DEFAULT 1000.00,
    descripcion_criterio TEXT NOT NULL,
    orden_visual INT DEFAULT 1,
    activo TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Semillas iniciales para las tres estrategias oficiales
INSERT INTO finanzas_estrategias_config 
    (codigo, nombre, color, icono, max_concentracion_inst, min_instituciones, max_concentracion_tipo, diversificar_tipos, asignacion_minima_viable, descripcion_criterio, orden_visual, activo)
VALUES 
    (
        'maximo_rendimiento',
        'Máximo rendimiento',
        '#16a34a',
        'fas fa-trophy',
        100.00,
        1,
        NULL,
        0,
        1000.00,
        'Se priorizaron las instituciones con mayor rendimiento estimado, permitiendo una mayor concentración del capital dentro de los límites configurados y respetando tramos y restricciones.',
        1,
        1
    ),
    (
        'equilibrada',
        'Equilibrada',
        '#2563eb',
        'fas fa-balance-scale',
        40.00,
        3,
        60.00,
        1,
        2000.00,
        'Se buscó un equilibrio entre rendimiento y diversificación, limitando la concentración por institución al 40% y procurando variedad entre tipos de instituciones (Bancos, Sofipos y Fintechs).',
        2,
        1
    ),
    (
        'conservadora',
        'Conservadora',
        '#d97706',
        'fas fa-shield-alt',
        25.00,
        4,
        40.00,
        1,
        2000.00,
        'Se priorizó una mayor diversificación del capital y una menor concentración por institución (máximo 25%) y por sector, aceptando una posible reducción del rendimiento estimado en favor de una distribución más amplia.',
        3,
        1
    )
ON DUPLICATE KEY UPDATE 
    nombre = VALUES(nombre),
    color = VALUES(color),
    icono = VALUES(icono),
    max_concentracion_inst = VALUES(max_concentracion_inst),
    min_instituciones = VALUES(min_instituciones),
    max_concentracion_tipo = VALUES(max_concentracion_tipo),
    diversificar_tipos = VALUES(diversificar_tipos),
    asignacion_minima_viable = VALUES(asignacion_minima_viable),
    descripcion_criterio = VALUES(descripcion_criterio),
    orden_visual = VALUES(orden_visual),
    activo = VALUES(activo);
