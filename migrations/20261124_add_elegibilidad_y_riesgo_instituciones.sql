-- =====================================================================
-- Migración: Incorporación de Reglas de Elegibilidad por Plazo, Monto y Riesgo
-- Módulo: Finanzas / Simulador de Inversiones
-- Fecha: 2026-11-24
-- =====================================================================

ALTER TABLE instituciones_financieras
    ADD COLUMN monto_minimo DECIMAL(14,2) NOT NULL DEFAULT 0.00 AFTER condiciones_resumen,
    ADD COLUMN plazo_minimo INT UNSIGNED NOT NULL DEFAULT 1 AFTER monto_minimo,
    ADD COLUMN nivel_riesgo ENUM('Bajo', 'Medio', 'Alto', 'Muy alto') NOT NULL DEFAULT 'Medio' AFTER plazo_minimo;

-- Asignación inicial de niveles de riesgo y mínimos para el catálogo base
UPDATE instituciones_financieras SET nivel_riesgo = 'Bajo', monto_minimo = 0.00, plazo_minimo = 1 WHERE nombre = 'NU';
UPDATE instituciones_financieras SET nivel_riesgo = 'Bajo', monto_minimo = 0.00, plazo_minimo = 1 WHERE nombre = 'Openbank';
UPDATE instituciones_financieras SET nivel_riesgo = 'Bajo', monto_minimo = 0.00, plazo_minimo = 1 WHERE nombre = 'Mifel';
UPDATE instituciones_financieras SET nivel_riesgo = 'Medio', monto_minimo = 0.00, plazo_minimo = 1 WHERE nombre = 'Revolut';
UPDATE instituciones_financieras SET nivel_riesgo = 'Muy alto', monto_minimo = 0.00, plazo_minimo = 1 WHERE nombre = 'Uala';
UPDATE instituciones_financieras SET nivel_riesgo = 'Medio', monto_minimo = 0.00, plazo_minimo = 1 WHERE nombre = 'Klar';
UPDATE instituciones_financieras SET nivel_riesgo = 'Medio', monto_minimo = 0.00, plazo_minimo = 1 WHERE nombre = 'Finsus';
UPDATE instituciones_financieras SET nivel_riesgo = 'Alto', monto_minimo = 0.00, plazo_minimo = 1 WHERE nombre = 'Didi';
UPDATE instituciones_financieras SET nivel_riesgo = 'Medio', monto_minimo = 0.00, plazo_minimo = 1 WHERE nombre = 'Mercado Pago';
UPDATE instituciones_financieras SET nivel_riesgo = 'Alto', monto_minimo = 0.00, plazo_minimo = 1 WHERE nombre = 'Monific';
