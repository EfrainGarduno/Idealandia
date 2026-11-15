-- =============================================================================
-- Migración SQL: Funcionalidad de Asociados
-- Proyecto: Idealandia
-- Idempotente, transaccional y compatible con MySQL 8.0.41 (utf8mb4_0900_ai_ci)
-- =============================================================================

-- 1. Tabla de Catálogo de Servicios
CREATE TABLE IF NOT EXISTS `servicios` (
    `id` INT PRIMARY KEY,
    `nombre` VARCHAR(150) NOT NULL,
    `descripcion` VARCHAR(500) NULL,
    `activo` TINYINT(1) NOT NULL DEFAULT 1,
    `fecha_creacion` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 2. Inserción obligatoria del catálogo inicial de 9 servicios
INSERT INTO `servicios` (`id`, `nombre`, `descripcion`, `activo`) VALUES
(1, 'Clases de Inglés', 'Servicio de enseñanza y clases de idioma inglés', 1),
(2, 'Consultoría', 'Servicio de consultoría especializada', 1),
(3, 'Coaching Profesional', 'Servicio de coaching y desarrollo profesional', 1),
(4, 'Asesoría en Pensiones', 'Servicio de asesoría y orientación en pensiones', 1),
(5, 'Asesoría Financiera', 'Servicio de asesoría y planeación financiera', 1),
(6, 'Meditación y Mindfulness', 'Servicio de meditación, mindfulness y bienestar', 1),
(7, 'Asesoría en Ideas creativas', 'Servicio de consultoría y asesoría en ideas creativas', 1),
(8, 'Emprendimientos e Innovación', 'Servicio de apoyo a emprendimientos e innovación', 1),
(999, 'Otros', 'Otro servicio personalizado no listado en el catálogo', 1)
ON DUPLICATE KEY UPDATE 
    `nombre` = VALUES(`nombre`),
    `descripcion` = VALUES(`descripcion`),
    `activo` = VALUES(`activo`);

-- 3. Tabla de Solicitudes de Asociados
CREATE TABLE IF NOT EXISTS `solicitudes_asociado` (
    `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `usuario_id` BIGINT UNSIGNED NOT NULL,
    `servicio_id` INT NOT NULL,
    `descripcion_servicio` TEXT NOT NULL,
    `nombre_servicio_otro` VARCHAR(150) NULL,
    `estatus` ENUM('por_aprobar', 'mas_informacion', 'autorizado', 'rechazado') NOT NULL DEFAULT 'por_aprobar',
    `observaciones` TEXT NULL,
    `fecha_solicitud` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `fecha_actualizacion` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `usuario_revisor_id` BIGINT UNSIGNED NULL,
    CONSTRAINT `fk_solicitud_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_solicitud_servicio` FOREIGN KEY (`servicio_id`) REFERENCES `servicios` (`id`),
    CONSTRAINT `fk_solicitud_revisor` FOREIGN KEY (`usuario_revisor_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
    INDEX `idx_solicitud_usuario` (`usuario_id`),
    INDEX `idx_solicitud_estatus` (`estatus`),
    INDEX `idx_solicitud_fecha` (`fecha_solicitud`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 4. Tabla de Verificaciones de Correo
CREATE TABLE IF NOT EXISTS `verificaciones_correo` (
    `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `usuario_id` BIGINT UNSIGNED NOT NULL,
    `token_hash` VARCHAR(64) NOT NULL,
    `expira_en` DATETIME NOT NULL,
    `usado` TINYINT(1) NOT NULL DEFAULT 0,
    `creado_en` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_verif_correo_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE,
    INDEX `idx_verif_token_hash` (`token_hash`),
    INDEX `idx_verif_usuario` (`usuario_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 5. Tabla de Tokens para el Portal Seguro de "Más Información"
CREATE TABLE IF NOT EXISTS `tokens_solicitud_asociado` (
    `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `solicitud_id` BIGINT UNSIGNED NOT NULL,
    `token_hash` VARCHAR(64) NOT NULL,
    `expira_en` DATETIME NOT NULL,
    `usado` TINYINT(1) NOT NULL DEFAULT 0,
    `creado_en` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_token_solicitud` FOREIGN KEY (`solicitud_id`) REFERENCES `solicitudes_asociado` (`id`) ON DELETE CASCADE,
    INDEX `idx_token_solicitud_hash` (`token_hash`),
    INDEX `idx_token_solicitud_id` (`solicitud_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 6. Tabla de Historial de Solicitudes de Asociados
CREATE TABLE IF NOT EXISTS `historial_solicitudes_asociado` (
    `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `solicitud_id` BIGINT UNSIGNED NOT NULL,
    `estatus_anterior` VARCHAR(50) NULL,
    `estatus_nuevo` VARCHAR(50) NOT NULL,
    `observaciones` TEXT NULL,
    `usuario_id` BIGINT UNSIGNED NULL,
    `fecha` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_historial_solicitud` FOREIGN KEY (`solicitud_id`) REFERENCES `solicitudes_asociado` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_historial_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
    INDEX `idx_historial_solicitud` (`solicitud_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 7. Asegurar Rol 'Asociado'
INSERT INTO `roles` (`nombre`, `descripcion`, `activo`)
SELECT 'Asociado', 'Rol asignado a proveedores asociados de Idealandia', 1
WHERE NOT EXISTS (SELECT 1 FROM `roles` WHERE LOWER(`nombre`) = 'asociado');

-- 8. Asegurar Permisos RBAC para Asociados
INSERT INTO `permisos` (`codigo`, `nombre`, `descripcion`, `activo`) VALUES
('asociados.read', 'Consultar asociados', 'Permite consultar solicitudes de asociados', 1),
('asociados.autorizar', 'Autorizar asociados', 'Permite aprobar solicitudes de asociados y activar sus cuentas', 1),
('asociados.rechazar', 'Rechazar asociados', 'Permite rechazar solicitudes de asociados con observaciones obligatorias', 1),
('asociados.pedir_informacion', 'Solicitar información a asociados', 'Permite solicitar información adicional a un candidato a asociado', 1)
ON DUPLICATE KEY UPDATE 
    `nombre` = VALUES(`nombre`),
    `descripcion` = VALUES(`descripcion`),
    `activo` = VALUES(`activo`);

-- 9. Asignar los permisos de asociados al rol 'administrador'
INSERT IGNORE INTO `rol_permisos` (`rol_id`, `permiso_id`)
SELECT r.id, p.id
FROM `roles` r
CROSS JOIN `permisos` p
WHERE LOWER(r.nombre) = 'administrador'
  AND p.codigo IN ('asociados.read', 'asociados.autorizar', 'asociados.rechazar', 'asociados.pedir_informacion');
