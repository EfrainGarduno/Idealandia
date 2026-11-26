-- =====================================================================
-- Migración: Soporte para campo informacion_adicional (instituciones_financieras)
-- Módulo: Finanzas / Simulador de Inversiones
-- Fecha: 2026-11-25
-- =====================================================================

-- 1. Agregar columna informacion_adicional si no existe
SET @dbname = DATABASE();
SET @tablename = 'instituciones_financieras';
SET @columnname = 'informacion_adicional';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      TABLE_SCHEMA = @dbname
      AND TABLE_NAME = @tablename
      AND COLUMN_NAME = @columnname
  ) > 0,
  'SELECT 1',
  'ALTER TABLE instituciones_financieras ADD COLUMN informacion_adicional TEXT NULL AFTER limite_proteccion_udis;'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- 2. Sincronizar datos iniciales desde informacio_adicional si existe
SET @columnOld = 'informacio_adicional';
SET @syncStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      TABLE_SCHEMA = @dbname
      AND TABLE_NAME = @tablename
      AND COLUMN_NAME = @columnOld
  ) > 0,
  'UPDATE instituciones_financieras SET informacion_adicional = informacio_adicional WHERE informacion_adicional IS NULL AND informacio_adicional IS NOT NULL;',
  'SELECT 1'
));
PREPARE syncData FROM @syncStatement;
EXECUTE syncData;
DEALLOCATE PREPARE syncData;
