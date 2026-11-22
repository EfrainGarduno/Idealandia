-- Carga inicial de Instituciones Financieras, Esquemas y Tramos (Simulador de Inversiones)
-- Instituciones: NU, Openbank, Mifel, Revolut, Uala, Klar, Didi, Finsus

-- Procedimiento anónimo / Bloque transaccional mediante Script JS o SQL
-- 1. NU (Sofipo)
INSERT INTO instituciones_financieras (nombre, tipo, descripcion, condiciones_resumen, orden_visual, activo)
SELECT 'NU', 'S', 'Nu México Financiera S.A. de C.V. S.F.P.', 'Hasta $25,000 al 13%, excedente al 6.5%', 1, 1
WHERE NOT EXISTS (SELECT 1 FROM instituciones_financieras WHERE nombre = 'NU');

-- 2. Openbank (Banco)
INSERT INTO instituciones_financieras (nombre, tipo, descripcion, condiciones_resumen, orden_visual, activo)
SELECT 'Openbank', 'B', 'Open Bank México S.A. Institución de Banca Múltiple', 'Hasta $30,000 al 13%, $30k-$100k al 7%, excedente al 6.5%', 2, 1
WHERE NOT EXISTS (SELECT 1 FROM instituciones_financieras WHERE nombre = 'Openbank');

-- 3. Mifel (Banco)
INSERT INTO instituciones_financieras (nombre, tipo, descripcion, condiciones_resumen, orden_visual, activo)
SELECT 'Mifel', 'B', 'Banca Mifel S.A. Institución de Banca Múltiple', 'Tasa fija 11.50%', 3, 1
WHERE NOT EXISTS (SELECT 1 FROM instituciones_financieras WHERE nombre = 'Mifel');

-- 4. Revolut (Fintech)
INSERT INTO instituciones_financieras (nombre, tipo, descripcion, condiciones_resumen, orden_visual, activo)
SELECT 'Revolut', 'F', 'Revolut Bank México', 'Tasa fija 10.00%', 4, 1
WHERE NOT EXISTS (SELECT 1 FROM instituciones_financieras WHERE nombre = 'Revolut');

-- 5. Uala (Fintech)
INSERT INTO instituciones_financieras (nombre, tipo, descripcion, condiciones_resumen, orden_visual, activo)
SELECT 'Uala', 'F', 'Ualá / ABC Capital', 'Hasta $50,000 al 14%, excedente al 0%', 5, 1
WHERE NOT EXISTS (SELECT 1 FROM instituciones_financieras WHERE nombre = 'Uala');

-- 6. Klar (Sofipo)
INSERT INTO instituciones_financieras (nombre, tipo, descripcion, condiciones_resumen, orden_visual, activo)
SELECT 'Klar', 'S', 'Klar / Servicios Financieros Alternativos S.A. de C.V. S.F.P.', 'Tasa fija 11.00%', 6, 1
WHERE NOT EXISTS (SELECT 1 FROM instituciones_financieras WHERE nombre = 'Klar');

-- 7. Didi (Fintech)
INSERT INTO instituciones_financieras (nombre, tipo, descripcion, condiciones_resumen, orden_visual, activo)
SELECT 'Didi', 'F', 'DiDi Pay / DiDi Finanzas', 'Tasa fija 12.00%', 7, 1
WHERE NOT EXISTS (SELECT 1 FROM instituciones_financieras WHERE nombre = 'Didi');

-- 8. Finsus (Sofipo)
INSERT INTO instituciones_financieras (nombre, tipo, descripcion, condiciones_resumen, orden_visual, activo)
SELECT 'Finsus', 'S', 'Financiera Sustentable de México S.A. de C.V. S.F.P.', 'Tasa fija 13.12%', 8, 1
WHERE NOT EXISTS (SELECT 1 FROM instituciones_financieras WHERE nombre = 'Finsus');
