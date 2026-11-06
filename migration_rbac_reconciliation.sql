-- =============================================================================
-- Migración SQL: Reconciliación Integral del Catálogo RBAC y Permisos
-- Proyecto: Idealandia
-- Rama: feature/rbac-dynamic-expiration (PR #94)
-- Idempotente, estrictamente atómica (sin TRUNCATE / sin commits implícitos),
-- con validaciones previas y registro de auditoría preciso.
-- =============================================================================

-- Paso 0: Asegurar tabla persistente de auditoría
CREATE TABLE IF NOT EXISTS `_migration_rbac_audit` (
    `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `migration_batch` VARCHAR(64) NOT NULL,
    `table_name` VARCHAR(64) NOT NULL,
    `record_id` BIGINT UNSIGNED NOT NULL,
    `identifier` VARCHAR(100) NOT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY `uq_batch_table_record` (`migration_batch`, `table_name`, `record_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP PROCEDURE IF EXISTS sp_migrate_rbac_reconciliation;

DELIMITER $$
CREATE PROCEDURE sp_migrate_rbac_reconciliation()
BEGIN
    DECLARE v_admin_role_count INT;
    DECLARE v_admin_func_count INT;
    DECLARE v_perm_dups INT;
    DECLARE v_admin_role_id BIGINT UNSIGNED;
    DECLARE v_admin_func_id BIGINT UNSIGNED;

    -- Manejador de excepciones: Cualquier fallo aborta la transacción sin COMMIT parcial
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    -- =========================================================================
    -- Creación de tablas temporales de trabajo (Previas a la transacción)
    -- =========================================================================
    CREATE TEMPORARY TABLE IF NOT EXISTS tmp_target_permisos (
        codigo VARCHAR(100),
        nombre VARCHAR(100),
        descripcion VARCHAR(255)
    );

    CREATE TEMPORARY TABLE IF NOT EXISTS tmp_missing_permisos (
        codigo VARCHAR(100),
        nombre VARCHAR(100),
        descripcion VARCHAR(255)
    );

    CREATE TEMPORARY TABLE IF NOT EXISTS tmp_missing_rol_permisos (
        rol_id BIGINT UNSIGNED,
        permiso_id BIGINT UNSIGNED,
        codigo VARCHAR(100)
    );

    CREATE TEMPORARY TABLE IF NOT EXISTS tmp_target_func_permisos (
        codigo VARCHAR(100)
    );

    CREATE TEMPORARY TABLE IF NOT EXISTS tmp_missing_func_permisos (
        funcionalidad_id BIGINT UNSIGNED,
        permiso_id BIGINT UNSIGNED,
        codigo VARCHAR(100)
    );

    -- Limpieza inicial con DELETE FROM (nunca TRUNCATE para evitar commits implícitos)
    DELETE FROM tmp_target_permisos;
    DELETE FROM tmp_missing_permisos;
    DELETE FROM tmp_missing_rol_permisos;
    DELETE FROM tmp_target_func_permisos;
    DELETE FROM tmp_missing_func_permisos;

    -- =========================================================================
    -- INICIO DE LA TRANSACCIÓN ATÓMICA
    -- Toda la lógica interna es estrictamente DML, garantizando atomicidad 100%
    -- =========================================================================
    START TRANSACTION;

    -- =========================================================================
    -- 1. VALIDACIONES PREVIAS OBLIGATORIAS
    -- =========================================================================

    -- A. Validar que exista exactamente un rol 'administrador'
    SELECT COUNT(*), MAX(id) INTO v_admin_role_count, v_admin_role_id
    FROM roles WHERE nombre = 'administrador';

    IF v_admin_role_count != 1 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Error validación previa: debe existir exactamente un rol con nombre "administrador".';
    END IF;

    -- B. Validar que exista exactamente una funcionalidad 'administracion'
    SELECT COUNT(*), MAX(id) INTO v_admin_func_count, v_admin_func_id
    FROM funcionalidades WHERE codigo = 'administracion';

    IF v_admin_func_count != 1 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Error validación previa: debe existir exactamente una funcionalidad con código "administracion".';
    END IF;

    -- C. Validar la unicidad de códigos en la tabla permisos
    SELECT COUNT(*) INTO v_perm_dups FROM (
        SELECT codigo FROM permisos GROUP BY codigo HAVING COUNT(*) > 1
    ) AS dup_check;

    IF v_perm_dups > 0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Error validación previa: existen códigos de permisos duplicados en la tabla permisos.';
    END IF;

    -- =========================================================================
    -- 2. IDENTIFICACIÓN PREVIA E INSERCIÓN PRECISA EN `permisos`
    -- =========================================================================
    DELETE FROM tmp_target_permisos;

    INSERT INTO tmp_target_permisos (codigo, nombre, descripcion) VALUES
    ('funcionalidades.read', 'Consultar funcionalidades', 'Permite consultar las funcionalidades del sistema'),
    ('funcionalidades.create', 'Crear funcionalidades', 'Permite registrar nuevas funcionalidades en el sistema'),
    ('funcionalidades.update', 'Modificar funcionalidades', 'Permite modificar funcionalidades existentes'),
    ('funcionalidades.delete', 'Eliminar funcionalidades', 'Permite eliminar funcionalidades del sistema'),
    ('menus.read', 'Consultar menús', 'Permite consultar los elementos del menú dinámico'),
    ('menus.create', 'Crear menús', 'Permite registrar nuevos elementos en el menú'),
    ('menus.update', 'Modificar menús', 'Permite modificar elementos del menú'),
    ('menus.delete', 'Eliminar menús', 'Permite eliminar elementos del menú'),
    ('permisos.create', 'Crear permisos', 'Permite registrar nuevos permisos en el sistema'),
    ('permisos.delete', 'Eliminar permisos', 'Permite eliminar permisos del sistema');

    -- Identificar PREVIAMENTE de forma exclusiva los que realmente faltan
    DELETE FROM tmp_missing_permisos;

    INSERT INTO tmp_missing_permisos (codigo, nombre, descripcion)
    SELECT t.codigo, t.nombre, t.descripcion
    FROM tmp_target_permisos t
    WHERE NOT EXISTS (SELECT 1 FROM permisos p WHERE p.codigo = t.codigo);

    -- Insertar únicamente los que faltaban
    INSERT INTO permisos (codigo, nombre, descripcion, activo, fecha_creacion)
    SELECT codigo, nombre, descripcion, 1, NOW()
    FROM tmp_missing_permisos;

    -- Registrar en auditoría EXCLUSIVAMENTE los IDs de los permisos recién creados
    INSERT INTO _migration_rbac_audit (migration_batch, table_name, record_id, identifier)
    SELECT 'reconciliacion_rbac_20261105', 'permisos', p.id, p.codigo
    FROM permisos p
    JOIN tmp_missing_permisos tmp ON p.codigo = tmp.codigo;

    -- =========================================================================
    -- 3. IDENTIFICACIÓN PREVIA E INSERCIÓN PRECISA EN `rol_permisos`
    -- =========================================================================
    DELETE FROM tmp_missing_rol_permisos;

    -- Identificar PREVIAMENTE solo las asignaciones al rol administrador que no existen
    INSERT INTO tmp_missing_rol_permisos (rol_id, permiso_id, codigo)
    SELECT v_admin_role_id, p.id, p.codigo
    FROM permisos p
    JOIN tmp_target_permisos t ON p.codigo = t.codigo
    WHERE NOT EXISTS (
        SELECT 1 FROM rol_permisos rp 
        WHERE rp.rol_id = v_admin_role_id AND rp.permiso_id = p.id
    );

    -- Insertar únicamente las relaciones faltantes
    INSERT INTO rol_permisos (rol_id, permiso_id)
    SELECT rol_id, permiso_id
    FROM tmp_missing_rol_permisos;

    -- Registrar en auditoría EXCLUSIVAMENTE las relaciones recién creadas
    INSERT INTO _migration_rbac_audit (migration_batch, table_name, record_id, identifier)
    SELECT 'reconciliacion_rbac_20261105', 'rol_permisos', rp.id, CONCAT(tmp.rol_id, ':', tmp.codigo)
    FROM rol_permisos rp
    JOIN tmp_missing_rol_permisos tmp 
      ON rp.rol_id = tmp.rol_id AND rp.permiso_id = tmp.permiso_id;

    -- =========================================================================
    -- 4. IDENTIFICACIÓN PREVIA E INSERCIÓN PRECISA EN `funcionalidad_permisos`
    -- =========================================================================
    DELETE FROM tmp_target_func_permisos;

    -- Lista completa de los 21 permisos pertenecientes a Administración
    INSERT INTO tmp_target_func_permisos (codigo) VALUES
    ('admin.access'),
    ('usuarios.read'), ('usuarios.create'), ('usuarios.update'), ('usuarios.delete'),
    ('roles.read'), ('roles.create'), ('roles.update'), ('roles.delete'),
    ('permisos.read'), ('permisos.create'), ('permisos.update'), ('permisos.delete'),
    ('funcionalidades.read'), ('funcionalidades.create'), ('funcionalidades.update'), ('funcionalidades.delete'),
    ('menus.read'), ('menus.create'), ('menus.update'), ('menus.delete');

    DELETE FROM tmp_missing_func_permisos;

    -- Identificar PREVIAMENTE solo las relaciones que no existían
    -- (Excluye automáticamente admin.access que ya existía con ID 16)
    INSERT INTO tmp_missing_func_permisos (funcionalidad_id, permiso_id, codigo)
    SELECT v_admin_func_id, p.id, p.codigo
    FROM permisos p
    JOIN tmp_target_func_permisos t ON p.codigo = t.codigo
    WHERE NOT EXISTS (
        SELECT 1 FROM funcionalidad_permisos fp 
        WHERE fp.funcionalidad_id = v_admin_func_id AND fp.permiso_id = p.id
    );

    -- Insertar únicamente las relaciones faltantes
    INSERT INTO funcionalidad_permisos (funcionalidad_id, permiso_id)
    SELECT funcionalidad_id, permiso_id
    FROM tmp_missing_func_permisos;

    -- Registrar en auditoría EXCLUSIVAMENTE las relaciones recién creadas
    INSERT INTO _migration_rbac_audit (migration_batch, table_name, record_id, identifier)
    SELECT 'reconciliacion_rbac_20261105', 'funcionalidad_permisos', fp.id, CONCAT(tmp.funcionalidad_id, ':', tmp.codigo)
    FROM funcionalidad_permisos fp
    JOIN tmp_missing_func_permisos tmp 
      ON fp.funcionalidad_id = tmp.funcionalidad_id AND fp.permiso_id = tmp.permiso_id;

    -- Confirmación atómica final
    COMMIT;
END$$

DELIMITER ;

CALL sp_migrate_rbac_reconciliation();
DROP PROCEDURE IF EXISTS sp_migrate_rbac_reconciliation;
