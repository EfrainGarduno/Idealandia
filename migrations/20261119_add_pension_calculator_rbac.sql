-- =============================================================================
-- MIGRACIÓN RBAC: Calculadora de Pensiones (Básica, Intermedia, Avanzada)
-- Fecha: 2026-11-19
-- Funcionalidad contenedora: asesoria_pensiones (id: 10)
-- Permisos independientes: calculadora.basica, calculadora.intermedia, calculadora.avanzada
-- =============================================================================

-- 1. Insertar los tres permisos si no existen
INSERT INTO permisos (codigo, nombre, descripcion, activo)
SELECT 'calculadora.basica', 'Calculadora de Pensiones - Básica', 'Acceso a la estimación básica de pensión Ley 73', 1
WHERE NOT EXISTS (SELECT 1 FROM permisos WHERE codigo = 'calculadora.basica');

INSERT INTO permisos (codigo, nombre, descripcion, activo)
SELECT 'calculadora.intermedia', 'Calculadora de Pensiones - Intermedia', 'Acceso a estimación intermedia con salario mínimo automático, carga de semanas IMSS y cálculo de últimas 250 semanas', 1
WHERE NOT EXISTS (SELECT 1 FROM permisos WHERE codigo = 'calculadora.intermedia');

INSERT INTO permisos (codigo, nombre, descripcion, activo)
SELECT 'calculadora.avanzada', 'Calculadora de Pensiones - Avanzada', 'Acceso a estimación avanzada con proyecciones de escenarios futuros y Modalidad 40', 1
WHERE NOT EXISTS (SELECT 1 FROM permisos WHERE codigo = 'calculadora.avanzada');

-- 2. Vincular los permisos con la funcionalidad existente 'asesoria_pensiones'
INSERT IGNORE INTO funcionalidad_permisos (funcionalidad_id, permiso_id)
SELECT f.id, p.id
FROM funcionalidades f
CROSS JOIN permisos p
WHERE f.codigo = 'asesoria_pensiones'
  AND p.codigo IN ('calculadora.basica', 'calculadora.intermedia', 'calculadora.avanzada');

-- 3. Asignar los permisos al rol 'administrador'
INSERT IGNORE INTO rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permisos p
WHERE LOWER(r.nombre) = 'administrador'
  AND p.codigo IN ('calculadora.basica', 'calculadora.intermedia', 'calculadora.avanzada');

-- 4. Validación posterior (SELECT de comprobación)
SELECT 
    f.codigo AS funcionalidad,
    p.codigo AS permiso,
    p.nombre,
    r.nombre AS rol_asignado
FROM funcionalidades f
JOIN funcionalidad_permisos fp ON f.id = fp.funcionalidad_id
JOIN permisos p ON fp.permiso_id = p.id
LEFT JOIN rol_permisos rp ON p.id = rp.permiso_id
LEFT JOIN roles r ON rp.rol_id = r.id AND LOWER(r.nombre) = 'administrador'
WHERE f.codigo = 'asesoria_pensiones'
  AND p.codigo LIKE 'calculadora.%'
ORDER BY p.id;
