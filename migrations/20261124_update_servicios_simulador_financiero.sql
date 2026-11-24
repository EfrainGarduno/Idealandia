-- =====================================================================
-- Migración: Actualización del Catálogo de Servicios y Funcionalidades
-- Módulo: Simulador Financiero y Asesorías Financieras
-- Fecha: 2026-11-24
-- =====================================================================

UPDATE servicios 
SET nombre = 'Asesorías Financieras — Simulador de Inversiones',
    descripcion = 'Simulador interactivo y comparador de rendimientos en México (Bancos, Sofipos y Fintechs) con desglose por tramos y estrategias de diversificación inteligente.'
WHERE id = 5;

UPDATE funcionalidades
SET descripcion = 'Simulador interactivo de inversiones y rendimientos en México (Bancos, Sofipos y Fintechs) con estrategias individuales y diversificadas.'
WHERE codigo = 'asesorias_financieras';
