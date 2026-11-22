-- Migración: Tabla de Restricciones para Instituciones Financieras
-- Motor: InnoDB, UTF8MB4

CREATE TABLE IF NOT EXISTS institucion_restricciones (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institucion_id INT UNSIGNED NOT NULL,
    descripcion TEXT NOT NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    orden INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_restricciones_institucion FOREIGN KEY (institucion_id) 
        REFERENCES instituciones_financieras(id) ON DELETE CASCADE,
    INDEX idx_restricciones_inst_activo (institucion_id, activo, orden)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
