-- Migración: Creación de tabla para historial estructurado de periodos salariales IMSS
-- Módulo: Asesoría en Pensiones - Calculadora Avanzada (PR #109)

CREATE TABLE IF NOT EXISTS usuario_periodos_imss (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id BIGINT UNSIGNED NOT NULL,
    patron VARCHAR(255) NULL,
    fecha_desde DATE NOT NULL,
    fecha_hasta DATE NOT NULL,
    salario DECIMAL(12, 2) NOT NULL,
    dias INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_usuario_periodos_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    INDEX idx_usuario_fechas (usuario_id, fecha_hasta DESC, fecha_desde DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
