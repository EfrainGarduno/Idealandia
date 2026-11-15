-- =============================================================================
-- Rollback SQL: Funcionalidad de Asociados
-- Proyecto: Idealandia
-- =============================================================================

-- 1. Eliminar asignación de permisos
DELETE rp FROM `rol_permisos` rp
JOIN `permisos` p ON rp.permiso_id = p.id
WHERE p.codigo IN ('asociados.read', 'asociados.autorizar', 'asociados.rechazar', 'asociados.pedir_informacion');

-- 2. Eliminar permisos de asociados
DELETE FROM `permisos`
WHERE `codigo` IN ('asociados.read', 'asociados.autorizar', 'asociados.rechazar', 'asociados.pedir_informacion');

-- 3. Eliminar tablas creadas (en orden inverso de dependencias)
DROP TABLE IF EXISTS `historial_solicitudes_asociado`;
DROP TABLE IF EXISTS `tokens_solicitud_asociado`;
DROP TABLE IF EXISTS `verificaciones_correo`;
DROP TABLE IF EXISTS `solicitudes_asociado`;
DROP TABLE IF EXISTS `servicios`;

-- 4. Opcional: Eliminar rol Asociado si no tiene usuarios asignados
DELETE FROM `roles`
WHERE LOWER(`nombre`) = 'asociado'
  AND NOT EXISTS (
      SELECT 1 FROM `usuario_roles` ur WHERE ur.rol_id = roles.id
  );
