-- =====================================================================
-- Migración: Estructura de Contexto y Base de Conocimiento para Idealita
-- Tabla: ai_contexto
-- Fecha: 2026-11-23
-- Motor: MySQL 8+ / MariaDB (InnoDB, UTF8MB4)
-- =====================================================================

-- 1. Creación de la tabla ai_contexto
CREATE TABLE IF NOT EXISTS ai_contexto (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    categoria VARCHAR(100) NOT NULL,
    titulo VARCHAR(255) NOT NULL,
    contenido LONGTEXT NOT NULL,
    prioridad INT NOT NULL DEFAULT 100,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_ai_contexto_categoria (categoria),
    INDEX idx_ai_contexto_activo (activo),
    INDEX idx_ai_contexto_prioridad (prioridad)
) ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;

-- 2. Permisos RBAC para Administración de Contexto de IA
INSERT IGNORE INTO permisos (codigo, nombre, descripcion, activo) VALUES
('contexto.read', 'Consultar Contexto de IA', 'Permite consultar el conocimiento y contexto de Idealita en administración', 1),
('contexto.create', 'Crear Contexto de IA', 'Permite registrar nuevo conocimiento para Idealita', 1),
('contexto.update', 'Modificar Contexto de IA', 'Permite editar y activar/desactivar contexto de Idealita', 1),
('contexto.delete', 'Eliminar Contexto de IA', 'Permite eliminar conocimiento de Idealita', 1);

-- 3. Funcionalidad específica para Contexto de Idealita
INSERT IGNORE INTO funcionalidades (codigo, nombre, descripcion, activo) VALUES
('contexto_idealita', 'Contexto de Idealita', 'Administración de la base de conocimiento y contexto para Idealita', 1);

-- 4. Vincular permisos con la funcionalidad específica (contexto_idealita) y administracion
INSERT IGNORE INTO funcionalidad_permisos (funcionalidad_id, permiso_id)
SELECT f.id, p.id
FROM funcionalidades f
CROSS JOIN permisos p
WHERE f.codigo IN ('contexto_idealita', 'administracion', 'admin')
  AND p.codigo IN ('contexto.read', 'contexto.create', 'contexto.update', 'contexto.delete')
  AND NOT EXISTS (
    SELECT 1 FROM funcionalidad_permisos fp WHERE fp.funcionalidad_id = f.id AND fp.permiso_id = p.id
  );

-- 5. Asignar los nuevos permisos al rol 'administrador'
INSERT IGNORE INTO rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permisos p
WHERE r.nombre = 'administrador'
  AND p.codigo IN ('contexto.read', 'contexto.create', 'contexto.update', 'contexto.delete')
  AND NOT EXISTS (
    SELECT 1 FROM rol_permisos rp WHERE rp.rol_id = r.id AND rp.permiso_id = p.id
  );

-- 5. Semillas iniciales demostrativas y categorizadas
INSERT IGNORE INTO ai_contexto (id, categoria, titulo, contenido, prioridad, activo, version) VALUES
(1, 'Idealandia', 'Propósito y Visión de Idealandia', 'Idealandia es un ecosistema colaborativo e innovador que conecta ideas, proyectos, talentos y asesorías financieras para transformar la creatividad en valor real para sus asociados.', 100, 1, 1),
(2, 'Idealita', 'Identidad y Personalidad de Idealita', 'Idealita es la asistente virtual inteligente de Idealandia. Su tono es empático, profesional, claro y constructivo. Ayuda a los usuarios a navegar la plataforma, consultar asesorías y materializar sus ideas.', 100, 1, 1),
(3, 'Finanzas', 'Simulador de Inversiones y Rendimientos', 'El simulador financiero de Idealandia permite comparar los rendimientos y condiciones reales de instituciones bancarias, sofipos y fintechs en México, integrando estrategias individuales y diversificadas.', 90, 1, 1),
(4, 'Reglas', 'Regla de Oro en Respuestas Financieras', 'Idealita nunca garantiza rendimientos futuros de forma absoluta ni ofrece asesoría de riesgo sin advertir sobre la volatilidad y las regulaciones vigentes de la CNBV y Condusef.', 120, 1, 1);
