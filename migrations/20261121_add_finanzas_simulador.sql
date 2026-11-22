-- Migración: Módulo de Asesorías Financieras - Simulador de Inversiones y Administración de Finanzas
-- Motor: InnoDB, UTF8MB4

-- 1. Tabla de Instituciones Financieras
CREATE TABLE IF NOT EXISTS instituciones_financieras (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    tipo ENUM('B', 'S', 'F', 'O') NOT NULL DEFAULT 'B', -- B = Banco, S = Sofipo, F = Fintech, O = Otro
    descripcion TEXT NULL,
    condiciones_resumen VARCHAR(255) NULL,
    orden_visual INT NOT NULL DEFAULT 0,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_inst_activo_orden (activo, orden_visual, nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Tabla de Esquemas de Tasas y Condiciones (Vigencias)
CREATE TABLE IF NOT EXISTS institucion_esquemas_tasas (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institucion_id INT UNSIGNED NOT NULL,
    nombre_esquema VARCHAR(100) NOT NULL DEFAULT 'General',
    fecha_inicio_vigencia DATE NOT NULL,
    fecha_fin_vigencia DATE NULL, -- NULL indica vigencia abierta (actual)
    activo TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_esquemas_institucion FOREIGN KEY (institucion_id) 
        REFERENCES instituciones_financieras(id) ON DELETE CASCADE,
    INDEX idx_esquemas_vigencia (institucion_id, activo, fecha_inicio_vigencia, fecha_fin_vigencia)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Tabla de Tramos Dinámicos por Esquema (1 a N tramos)
CREATE TABLE IF NOT EXISTS institucion_tramos_tasas (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    esquema_id INT UNSIGNED NOT NULL,
    numero_tramo INT UNSIGNED NOT NULL DEFAULT 1,
    limite_inferior DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    limite_superior DECIMAL(14, 2) NULL, -- NULL indica sin límite superior (+infinito)
    tasa_anual DECIMAL(6, 4) NOT NULL DEFAULT 0.0000, -- Ej. 13.0000 = 13%
    descripcion_tramo VARCHAR(150) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_tramos_esquema FOREIGN KEY (esquema_id) 
        REFERENCES institucion_esquemas_tasas(id) ON DELETE CASCADE,
    INDEX idx_tramos_esquema (esquema_id, numero_tramo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Permisos RBAC para Finanzas (Administración)
INSERT IGNORE INTO permisos (codigo, nombre, descripcion, activo) VALUES
('finanzas.read', 'Consultar Finanzas', 'Permite consultar instituciones financieras y condiciones en administración', 1),
('finanzas.create', 'Crear Finanzas', 'Permite registrar nuevas instituciones y esquemas de inversión', 1),
('finanzas.update', 'Modificar Finanzas', 'Permite editar instituciones, vigencias y tramos financieros', 1),
('finanzas.delete', 'Eliminar Finanzas', 'Permite desactivar o eliminar instituciones y esquemas financieros', 1);

-- Vincular permisos con la funcionalidad 'administracion' (id: 8)
INSERT IGNORE INTO funcionalidad_permisos (funcionalidad_id, permiso_id)
SELECT 8, p.id
FROM permisos p
WHERE p.codigo IN ('finanzas.read', 'finanzas.create', 'finanzas.update', 'finanzas.delete')
  AND NOT EXISTS (
    SELECT 1 FROM funcionalidad_permisos fp WHERE fp.funcionalidad_id = 8 AND fp.permiso_id = p.id
  );

-- Asignar los nuevos permisos al rol 'administrador'
INSERT IGNORE INTO rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permisos p
WHERE r.nombre = 'administrador'
  AND p.codigo IN ('finanzas.read', 'finanzas.create', 'finanzas.update', 'finanzas.delete')
  AND NOT EXISTS (
    SELECT 1 FROM rol_permisos rp WHERE rp.rol_id = r.id AND rp.permiso_id = p.id
  );
