-- =============================================================================
-- IDEALANDIA - MIGRACIÓN FASE 3: EVOLUCIÓN ARQUITECTURAL DEL MÓDULO IDEAS
-- Script SQL Final Ejecutado Exitosamente
-- Base de datos objetivo: idealandia_dev
-- Collation estándar módulo Ideas: utf8mb4_0900_ai_ci
-- =============================================================================

USE `idealandia_dev`;

-- -----------------------------------------------------------------------------
-- SECCIÓN 0: PREVALIDACIONES DE SEGURIDAD (SOLO LECTURA)
-- -----------------------------------------------------------------------------
-- 0.1 Verificar conteo y estado exacto de las 9 ideas preexistentes
SELECT 
  COUNT(*) AS total_ideas,
  SUM(CASE WHEN id IN (2, 4, 1017, 1020, 1023, 1024, 1025, 1029) AND estado = 'pendiente' THEN 1 ELSE 0 END) AS pendientes_validas,
  SUM(CASE WHEN id = 3 AND estado = 'en progreso' THEN 1 ELSE 0 END) AS en_progreso_valida
FROM `ideas`;

-- 0.2 Verificar que no existen permisos duplicados previos
SELECT COUNT(*) AS permisos_existentes 
FROM `permisos` 
WHERE `codigo` IN ('ideas.develop', 'ideas.use_ai');

-- 0.3 Verificar existencia de funcionalidad 'ideas' y rol 'administrador'
SELECT `id`, `codigo` FROM `funcionalidades` WHERE `codigo` = 'ideas';
SELECT `id`, `nombre` FROM `roles` WHERE `nombre` = 'administrador';

-- 0.4 Verificar existencia del índice original a reemplazar
SELECT COUNT(*) AS indice_original_existe 
FROM INFORMATION_SCHEMA.STATISTICS 
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ideas' AND INDEX_NAME = 'idx_ideas_usuario';


-- -----------------------------------------------------------------------------
-- SECCIÓN 1: DDL - CREACIÓN DE TABLAS SATÉLITE Y ALTERACIÓN DE TABLA IDEAS
-- -----------------------------------------------------------------------------

-- 1.1 Tabla idea_desarrollo (Canvas estructurado 1:1)
CREATE TABLE IF NOT EXISTS `idea_desarrollo` (
  `idea_id` bigint unsigned NOT NULL,
  `problema` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
  `solucion` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
  `beneficiarios` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
  `recursos` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
  `inversion_estimada` decimal(12,2) DEFAULT NULL,
  `moneda` varchar(3) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT 'MXN',
  `complejidad` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `potencial` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `riesgos` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
  `notas` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
  `fecha_actualizacion` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`idea_id`),
  CONSTRAINT `fk_idea_desarrollo_idea` FOREIGN KEY (`idea_id`) REFERENCES `ideas` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 1.2 Tabla idea_versiones (Snapshot histórico de versiones formales 1:N)
CREATE TABLE IF NOT EXISTS `idea_versiones` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `idea_id` bigint unsigned NOT NULL,
  `numero_version` int unsigned NOT NULL,
  `titulo` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `descripcion` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
  `problema` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
  `solucion` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
  `usuario_id` bigint unsigned DEFAULT NULL,
  `motivo_cambio` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `fecha_creacion` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_idea_numero_version` (`idea_id`, `numero_version`),
  KEY `idx_versiones_usuario` (`usuario_id`),
  CONSTRAINT `fk_idea_versiones_idea` FOREIGN KEY (`idea_id`) REFERENCES `ideas` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_idea_versiones_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 1.3 Tabla idea_historial (Línea de vida auditable de eventos 1:N)
CREATE TABLE IF NOT EXISTS `idea_historial` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `idea_id` bigint unsigned NOT NULL,
  `usuario_id` bigint unsigned DEFAULT NULL,
  `tipo_evento` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `descripcion` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `datos` json DEFAULT NULL,
  `fecha` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_historial_idea_fecha` (`idea_id`, `fecha` DESC),
  CONSTRAINT `fk_idea_historial_idea` FOREIGN KEY (`idea_id`) REFERENCES `ideas` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_idea_historial_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 1.4 Tabla categorias_idea (Catálogo dinámico de categorías)
CREATE TABLE IF NOT EXISTS `categorias_idea` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `clave` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `nombre` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `descripcion` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `icono` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT 'fa-lightbulb',
  `orden` int NOT NULL DEFAULT 0,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `fecha_creacion` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_categorias_clave` (`clave`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 1.5 Tabla idea_categorias (Relación N:M entre ideas y categorías)
CREATE TABLE IF NOT EXISTS `idea_categorias` (
  `idea_id` bigint unsigned NOT NULL,
  `categoria_id` int unsigned NOT NULL,
  `fecha_asignacion` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`idea_id`, `categoria_id`),
  KEY `idx_cat_rel_categoria` (`categoria_id`),
  CONSTRAINT `fk_idea_cat_idea` FOREIGN KEY (`idea_id`) REFERENCES `ideas` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_idea_cat_categoria` FOREIGN KEY (`categoria_id`) REFERENCES `categorias_idea` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 1.6 Tabla idea_propositos (Catálogo de propósitos de valor)
CREATE TABLE IF NOT EXISTS `idea_propositos` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `clave` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `nombre` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `descripcion` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `icono` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT 'fa-heart',
  `orden` int NOT NULL DEFAULT 0,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `fecha_creacion` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_propositos_clave` (`clave`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 1.7 Tabla idea_proposito_rel (Relación N:M entre ideas y propósitos)
CREATE TABLE IF NOT EXISTS `idea_proposito_rel` (
  `idea_id` bigint unsigned NOT NULL,
  `proposito_id` int unsigned NOT NULL,
  `fecha_asignacion` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`idea_id`, `proposito_id`),
  KEY `idx_prop_rel_proposito` (`proposito_id`),
  CONSTRAINT `fk_idea_prop_idea` FOREIGN KEY (`idea_id`) REFERENCES `ideas` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_idea_prop_proposito` FOREIGN KEY (`proposito_id`) REFERENCES `idea_propositos` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 1.8 Tabla idea_analisis_ia (Historial de análisis y maduración con IA)
CREATE TABLE IF NOT EXISTS `idea_analisis_ia` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `idea_id` bigint unsigned NOT NULL,
  `usuario_id` bigint unsigned DEFAULT NULL,
  `tipo_analisis` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `resumen` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `contenido` json NOT NULL,
  `supuestos_cuestionados` json DEFAULT NULL,
  `version_idea` int unsigned NOT NULL DEFAULT 0,
  `fecha` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_analisis_idea_fecha` (`idea_id`, `fecha` DESC),
  CONSTRAINT `fk_idea_analisis_idea` FOREIGN KEY (`idea_id`) REFERENCES `ideas` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_idea_analisis_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 1.9 Alteración estructural de la tabla ideas
ALTER TABLE `ideas`
  MODIFY COLUMN `estado` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT 'semilla',
  ADD COLUMN `privacidad` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT 'privada' AFTER `fecha`,
  ADD COLUMN `modalidad` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT 'individual' AFTER `privacidad`,
  ADD COLUMN `version_actual` int unsigned NOT NULL DEFAULT 0 AFTER `modalidad`,
  ADD COLUMN `fecha_actualizacion` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `version_actual`,
  DROP INDEX `idx_ideas_usuario`,
  ADD INDEX `idx_ideas_usuario_fecha` (`usuario_id`, `fecha` DESC);


-- -----------------------------------------------------------------------------
-- SECCIÓN 2: VALIDACIONES ESTRUCTURALES POST-DDL (PRE-DML)
-- -----------------------------------------------------------------------------
-- Confirmar que las 9 tablas existen
SELECT TABLE_NAME 
FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_SCHEMA = DATABASE() AND (TABLE_NAME LIKE 'idea%' OR TABLE_NAME = 'categorias_idea')
ORDER BY TABLE_NAME ASC;

-- Confirmar 11 claves foráneas nuevas fk_idea_*
SELECT CONSTRAINT_NAME, TABLE_NAME 
FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS 
WHERE TABLE_SCHEMA = DATABASE() AND CONSTRAINT_TYPE = 'FOREIGN KEY'
  AND CONSTRAINT_NAME IN (
    'fk_idea_desarrollo_idea',
    'fk_idea_versiones_idea', 'fk_idea_versiones_usuario',
    'fk_idea_historial_idea', 'fk_idea_historial_usuario',
    'fk_idea_cat_idea', 'fk_idea_cat_categoria',
    'fk_idea_prop_idea', 'fk_idea_prop_proposito',
    'fk_idea_analisis_idea', 'fk_idea_analisis_usuario'
  );


-- -----------------------------------------------------------------------------
-- SECCIÓN 3: DML TRANSACCIONAL (MIGRACIÓN DE DATOS)
-- -----------------------------------------------------------------------------
START TRANSACTION;

-- 3.1 Migración de las 8 ideas 'pendiente' a 'semilla' (version_actual = 0)
UPDATE `ideas` 
SET `estado` = 'semilla', 
    `privacidad` = 'privada', 
    `modalidad` = 'individual', 
    `version_actual` = 0 
WHERE `id` IN (2, 4, 1017, 1020, 1023, 1024, 1025, 1029);

-- 3.2 Migración de la idea ID 3 de 'en progreso' a 'en_desarrollo' (version_actual = 1)
UPDATE `ideas` 
SET `estado` = 'en_desarrollo', 
    `privacidad` = 'privada', 
    `modalidad` = 'individual', 
    `version_actual` = 1 
WHERE `id` = 3;

-- 3.3 Creación de registros 1:1 en idea_desarrollo para las 9 ideas exactas
INSERT INTO `idea_desarrollo` (`idea_id`, `moneda`)
VALUES 
  (2, 'MXN'), 
  (3, 'MXN'), 
  (4, 'MXN'), 
  (1017, 'MXN'), 
  (1020, 'MXN'), 
  (1023, 'MXN'), 
  (1024, 'MXN'), 
  (1025, 'MXN'), 
  (1029, 'MXN');

-- 3.4 Creación de Versión 1 formal para la idea ID 3 (obteniendo datos reales dinámicamente de ideas)
INSERT INTO `idea_versiones` (
  `idea_id`, `numero_version`, `titulo`, `descripcion`, `problema`, `solucion`, `usuario_id`, `motivo_cambio`, `fecha_creacion`
)
SELECT 
  `id`, 1, `titulo`, `descripcion`, NULL, NULL, `usuario_id`, 
  'Migración inicial: consolidación de idea preexistente en desarrollo', `fecha`
FROM `ideas` 
WHERE `id` = 3;

-- 3.5 Registro de línea de vida en idea_historial
-- 3.5.1 Evento de creación para las 8 ideas semilla (usuario_id y fecha dinámicos)
INSERT INTO `idea_historial` (`idea_id`, `usuario_id`, `tipo_evento`, `descripcion`, `datos`, `fecha`)
SELECT 
  `id`, `usuario_id`, 'creacion', 'Idea migrada al nuevo modelo en estado semilla', 
  JSON_OBJECT('origen', 'migracion_fase3', 'estado_anterior', 'pendiente'), `fecha`
FROM `ideas` 
WHERE `id` IN (2, 4, 1017, 1020, 1023, 1024, 1025, 1029);

-- 3.5.2 Eventos para la idea ID 3 (usuario_id y fecha dinámica para creación, NOW() para transición y versión)
INSERT INTO `idea_historial` (`idea_id`, `usuario_id`, `tipo_evento`, `descripcion`, `datos`, `fecha`)
SELECT 
  `id`, `usuario_id`, 'creacion', 'Idea migrada al nuevo modelo', 
  JSON_OBJECT('origen', 'migracion_fase3', 'estado_anterior', 'en progreso'), `fecha`
FROM `ideas` 
WHERE `id` = 3;

INSERT INTO `idea_historial` (`idea_id`, `usuario_id`, `tipo_evento`, `descripcion`, `datos`, `fecha`)
SELECT 
  `id`, `usuario_id`, 'cambio_estado', 'Consolidación de idea en desarrollo', 
  JSON_OBJECT('estado_anterior', 'en progreso', 'estado_nuevo', 'en_desarrollo', 'version_generada', 1), NOW()
FROM `ideas` 
WHERE `id` = 3;

INSERT INTO `idea_historial` (`idea_id`, `usuario_id`, `tipo_evento`, `descripcion`, `datos`, `fecha`)
SELECT 
  `id`, `usuario_id`, 'nueva_version', 'Versión 1 consolidada automáticamente por migración', 
  JSON_OBJECT('version', 1), NOW()
FROM `ideas` 
WHERE `id` = 3;

-- 3.6 Inserción del catálogo inicial de propósitos de valor
INSERT INTO `idea_propositos` (`clave`, `nombre`, `descripcion`, `icono`, `orden`) VALUES
  ('economico', 'Económico', 'Generación de ingresos, ahorro, rentabilidad o sostenibilidad financiera', 'fa-coins', 1),
  ('social', 'Social', 'Impacto positivo en comunidades, reducción de brechas o bienestar colectivo', 'fa-users', 2),
  ('ambiental', 'Ambiental', 'Conservación ecológica, regeneración, energías limpias o sustentabilidad', 'fa-leaf', 3),
  ('educativo', 'Educativo', 'Aprendizaje, formación de habilidades, difusión de conocimiento o capacitación', 'fa-graduation-cap', 4),
  ('cientifico', 'Científico', 'Investigación empírica, validación técnica, método científico o innovación tecnológica', 'fa-flask', 5),
  ('cultural', 'Cultural', 'Expresión artística, preservación del patrimonio, identidad o tradiciones', 'fa-palette', 6),
  ('comunitario', 'Comunitario', 'Integración vecinal, fortalecimiento del tejido social o colaboración local', 'fa-hands-helping', 7),
  ('personal', 'Personal', 'Desarrollo humano individual, bienestar emocional, estilo de vida o propósito vital', 'fa-user-check', 8);

-- 3.7 Registro dinámico de permisos RBAC
INSERT INTO `permisos` (`codigo`, `nombre`, `descripcion`, `activo`) VALUES
  ('ideas.develop', 'Desarrollar Canvas de Ideas', 'Permite editar el canvas estructurado de una idea', 1),
  ('ideas.use_ai', 'Usar IA en Ideas', 'Permite solicitar análisis de maduración e impacto a Idealita', 1);

-- 3.8 Vinculación dinámica a la funcionalidad 'ideas'
INSERT INTO `funcionalidad_permisos` (`funcionalidad_id`, `permiso_id`)
SELECT f.id, p.id 
FROM `funcionalidades` f
JOIN `permisos` p ON p.codigo IN ('ideas.develop', 'ideas.use_ai')
WHERE f.codigo = 'ideas';

-- 3.9 Asignación dinámica al rol 'administrador'
INSERT INTO `rol_permisos` (`rol_id`, `permiso_id`)
SELECT r.id, p.id 
FROM `roles` r
JOIN `permisos` p ON p.codigo IN ('ideas.develop', 'ideas.use_ai')
WHERE r.nombre = 'administrador';

COMMIT;


-- -----------------------------------------------------------------------------
-- SECCIÓN 4: VALIDACIONES POST-MIGRACIÓN
-- -----------------------------------------------------------------------------
-- 4.1 Estados y versiones en ideas
SELECT `estado`, `version_actual`, COUNT(*) AS total 
FROM `ideas` 
GROUP BY `estado`, `version_actual` 
ORDER BY `estado` ASC;

-- 4.2 Versión 1 creada para idea ID 3
SELECT `id`, `idea_id`, `numero_version`, `titulo`, `motivo_cambio`, `usuario_id`, `fecha_creacion` 
FROM `idea_versiones`;

-- 4.3 Registros en idea_desarrollo (esperado: 9)
SELECT COUNT(*) AS total_desarrollo FROM `idea_desarrollo`;

-- 4.4 Eventos en idea_historial (esperado: 11)
SELECT COUNT(*) AS total_eventos FROM `idea_historial`;

-- 4.5 Catálogo de propósitos (esperado: 8)
SELECT `id`, `clave`, `nombre`, `icono` FROM `idea_propositos` ORDER BY `orden`;

-- 4.6 Tablas satélites vacías
SELECT COUNT(*) AS total_categorias FROM `categorias_idea`;
SELECT COUNT(*) AS total_idea_categorias FROM `idea_categorias`;
SELECT COUNT(*) AS total_idea_proposito_rel FROM `idea_proposito_rel`;
SELECT COUNT(*) AS total_idea_analisis_ia FROM `idea_analisis_ia`;

-- 4.7 Integridad exacta de los 9 registros en ideas
SELECT `id`, `usuario_id`, `titulo`, `estado`, `version_actual`, `privacidad`, `modalidad`, `fecha` 
FROM `ideas` 
ORDER BY `id` ASC;

-- 4.8 Validación RBAC estricta (funcionalidad 'ideas' y rol 'administrador')
SELECT 
  f.codigo AS funcionalidad,
  r.nombre AS rol,
  p.codigo AS permiso,
  p.nombre AS nombre_permiso
FROM `permisos` p
JOIN `funcionalidad_permisos` fp ON fp.permiso_id = p.id
JOIN `funcionalidades` f ON f.id = fp.funcionalidad_id AND f.codigo = 'ideas'
JOIN `rol_permisos` rp ON rp.permiso_id = p.id
JOIN `roles` r ON r.id = rp.rol_id AND r.nombre = 'administrador'
WHERE p.codigo IN ('ideas.develop', 'ideas.use_ai')
ORDER BY p.codigo ASC;

-- 4.9 Collations de tablas del módulo Ideas
SELECT TABLE_NAME, TABLE_COLLATION 
FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_SCHEMA = DATABASE() AND (TABLE_NAME LIKE 'idea%' OR TABLE_NAME = 'categorias_idea')
ORDER BY TABLE_NAME ASC;
