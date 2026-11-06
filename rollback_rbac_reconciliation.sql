-- =============================================================================
-- Rollback SQL: Reconciliación Integral del Catálogo RBAC y Permisos
-- Proyecto: Idealandia
-- Rama: feature/rbac-dynamic-expiration (PR #94)
-- Reversión quirúrgica, atómica, protegida frente a modificaciones concurrentes
-- (SELECT ... FOR UPDATE) y blindada contra borrados accidentales por ON DELETE CASCADE.
-- =============================================================================

DROP PROCEDURE IF EXISTS sp_rollback_rbac_reconciliation;

DELIMITER $$
CREATE PROCEDURE sp_rollback_rbac_reconciliation()
BEGIN
    DECLARE v_external_role_refs INT DEFAULT 0;
    DECLARE v_external_func_refs INT DEFAULT 0;
    DECLARE v_residual_role_refs INT DEFAULT 0;
    DECLARE v_residual_func_refs INT DEFAULT 0;

    -- Manejador de excepciones: Cualquier fallo aborta la transacción
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    -- =========================================================================
    -- 1. BLOQUEO TRANSACCIONAL DE PERMISOS AUDITADOS (FOR UPDATE)
    -- =========================================================================
    -- Adquirir bloqueo exclusivo (X-lock) sobre las filas de permisos creadas por
    -- esta migración. Esto impide que transacciones concurrentes agreguen
    -- relaciones en rol_permisos o funcionalidad_permisos (cuyas comprobaciones FK
    -- requieren un S-lock sobre el registro padre en permisos) mientras se evalúa
    -- y ejecuta la reversión. El bloqueo se mantiene activo hasta el COMMIT o ROLLBACK.
    SELECT p.id, p.codigo
    FROM permisos p
    JOIN _migration_rbac_audit a_perm 
      ON a_perm.migration_batch = 'reconciliacion_rbac_20261105'
     AND a_perm.table_name = 'permisos'
     AND p.id = a_perm.record_id
    FOR UPDATE;

    -- =========================================================================
    -- 2. COMPROBACIÓN PREVENTIVA: PROTECCIÓN FRENTE A ON DELETE CASCADE
    -- =========================================================================
    -- Las tablas rol_permisos y funcionalidad_permisos definen ON DELETE CASCADE
    -- hacia permisos(id). Si después de la migración otros roles o funcionalidades
    -- fueron vinculados a estos permisos, un borrado de permisos los destruiría
    -- en cascada silenciosamente. Por tanto, validamos que NO existan referencias externas.

    -- A. Verificar si existen asignaciones a otros roles no creadas por esta migración
    SELECT COUNT(*) INTO v_external_role_refs
    FROM rol_permisos rp
    JOIN _migration_rbac_audit a_perm 
      ON a_perm.migration_batch = 'reconciliacion_rbac_20261105'
     AND a_perm.table_name = 'permisos'
     AND rp.permiso_id = a_perm.record_id
    WHERE rp.id NOT IN (
        SELECT record_id 
        FROM _migration_rbac_audit 
        WHERE migration_batch = 'reconciliacion_rbac_20261105'
          AND table_name = 'rol_permisos'
    );

    -- B. Verificar si existen asignaciones a otras funcionalidades no creadas por esta migración
    SELECT COUNT(*) INTO v_external_func_refs
    FROM funcionalidad_permisos fp
    JOIN _migration_rbac_audit a_perm 
      ON a_perm.migration_batch = 'reconciliacion_rbac_20261105'
     AND a_perm.table_name = 'permisos'
     AND fp.permiso_id = a_perm.record_id
    WHERE fp.id NOT IN (
        SELECT record_id 
        FROM _migration_rbac_audit 
        WHERE migration_batch = 'reconciliacion_rbac_20261105'
          AND table_name = 'funcionalidad_permisos'
    );

    IF v_external_role_refs > 0 OR v_external_func_refs > 0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Rollback abortado: existen roles o funcionalidades posteriores vinculados a estos permisos. Reviertalos primero.';
    END IF;

    -- =========================================================================
    -- 3. REVERSIÓN QUIRÚRGICA DE ASIGNACIONES CREADAS POR LA MIGRACIÓN
    -- =========================================================================

    -- A. Eliminar relaciones en funcionalidad_permisos creadas exclusivamente por este lote
    DELETE fp FROM funcionalidad_permisos fp
    JOIN _migration_rbac_audit a 
      ON a.table_name = 'funcionalidad_permisos' AND fp.id = a.record_id
    WHERE a.migration_batch = 'reconciliacion_rbac_20261105';

    -- B. Eliminar relaciones en rol_permisos creadas exclusivamente por este lote
    DELETE rp FROM rol_permisos rp
    JOIN _migration_rbac_audit a 
      ON a.table_name = 'rol_permisos' AND rp.id = a.record_id
    WHERE a.migration_batch = 'reconciliacion_rbac_20261105';

    -- C. Doble verificación estricta: antes de borrar permisos, verificar CERO referencias
    SELECT COUNT(*) INTO v_residual_role_refs
    FROM rol_permisos rp
    JOIN _migration_rbac_audit a_perm 
      ON a_perm.migration_batch = 'reconciliacion_rbac_20261105'
     AND a_perm.table_name = 'permisos'
     AND rp.permiso_id = a_perm.record_id;

    SELECT COUNT(*) INTO v_residual_func_refs
    FROM funcionalidad_permisos fp
    JOIN _migration_rbac_audit a_perm 
      ON a_perm.migration_batch = 'reconciliacion_rbac_20261105'
     AND a_perm.table_name = 'permisos'
     AND fp.permiso_id = a_perm.record_id;

    IF v_residual_role_refs > 0 OR v_residual_func_refs > 0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Rollback abortado: existen referencias activas hacia los permisos a eliminar. No se ejecutara DELETE FROM permisos.';
    END IF;

    -- =========================================================================
    -- 4. REVERSIÓN DE PERMISOS Y LIMPIEZA DE AUDITORÍA
    -- =========================================================================

    -- A. Eliminar los permisos creados exclusivamente por este lote
    DELETE p FROM permisos p
    JOIN _migration_rbac_audit a 
      ON a.table_name = 'permisos' AND p.id = a.record_id
    WHERE a.migration_batch = 'reconciliacion_rbac_20261105';

    -- B. Limpiar los registros de auditoría de este lote
    DELETE FROM _migration_rbac_audit 
    WHERE migration_batch = 'reconciliacion_rbac_20261105';

    COMMIT;
END$$

DELIMITER ;

CALL sp_rollback_rbac_reconciliation();
DROP PROCEDURE IF EXISTS sp_rollback_rbac_reconciliation;
