-- =============================================================================
-- Migración SQL: Permisos Específicos para Accesos Temporales
-- Proyecto: Idealandia
-- Idempotente y compatible con MySQL 8+ / MariaDB
-- =============================================================================

CREATE TABLE IF NOT EXISTS `acceso_permisos` (
    `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `acceso_id` INT NOT NULL,
    `permiso_id` INT NOT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY `uq_acceso_permiso` (`acceso_id`, `permiso_id`),
    KEY `idx_acceso_permisos_permiso` (`permiso_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
