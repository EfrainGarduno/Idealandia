-- =====================================================================
-- Migración: Protección Institucional, Indicador UDI e Información Adicional
-- Módulo: Finanzas / Simulador de Inversiones
-- Fecha: 2026-11-24
-- =====================================================================

-- 1. Tabla de indicadores económicos
CREATE TABLE IF NOT EXISTS finanzas_indicadores_economicos (
    codigo VARCHAR(50) NOT NULL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    valor DECIMAL(10,6) NOT NULL,
    fecha DATE NOT NULL,
    fuente VARCHAR(150) NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Registro inicial oficial para UDI
INSERT INTO finanzas_indicadores_economicos (codigo, nombre, valor, fecha, fuente)
VALUES ('UDI', 'Unidades de Inversión', 8.865882, '2026-11-24', 'Banco de México / DOF')
ON DUPLICATE KEY UPDATE 
    valor = VALUES(valor),
    fecha = VALUES(fecha),
    fuente = VALUES(fuente);

-- 3. Modificación de instituciones_financieras
ALTER TABLE instituciones_financieras
    ADD COLUMN tipo_proteccion ENUM('IPAB', 'PROSOFIPO', 'FOCOOP', 'Sin protección', 'Otra') NOT NULL DEFAULT 'Sin protección' AFTER nivel_riesgo,
    ADD COLUMN limite_proteccion_udis DECIMAL(14,2) NOT NULL DEFAULT 0.00 AFTER tipo_proteccion,
    ADD COLUMN informacio_adicional TEXT NULL AFTER limite_proteccion_udis;

-- 4. Asignación inicial de esquemas de protección regulatoria
UPDATE instituciones_financieras SET tipo_proteccion = 'IPAB', limite_proteccion_udis = 400000.00 WHERE nombre IN ('NU', 'Openbank', 'Mifel');
UPDATE instituciones_financieras SET tipo_proteccion = 'PROSOFIPO', limite_proteccion_udis = 25000.00 WHERE nombre IN ('Klar', 'Finsus');
UPDATE instituciones_financieras SET tipo_proteccion = 'Sin protección', limite_proteccion_udis = 0.00 WHERE nombre IN ('Monific', 'Didi', 'Uala', 'Mercado Pago', 'Revolut');

-- 5. Información adicional demostrativa inicial
UPDATE instituciones_financieras 
SET informacio_adicional = 'Cuenta de cheques y ahorros respaldada por el Instituto para la Protección al Ahorro Bancario (IPAB) hasta por 400,000 UDIS por persona e institución.' 
WHERE nombre = 'NU';

UPDATE instituciones_financieras 
SET informacio_adicional = 'Sociedad Financiera Popular (SOFIPO) supervisada por la CNBV, con seguro de depósito PROSOFIPO hasta por 25,000 UDIS por titular.' 
WHERE nombre = 'Klar';
