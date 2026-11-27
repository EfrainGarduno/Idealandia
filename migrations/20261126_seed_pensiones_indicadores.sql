-- =============================================================================
-- MIGRACIÓN DE SEMBRADO: Indicadores Validados de Pensiones (Fase 2)
-- Fecha: 2026-11-26
-- Valores validados jurídica y matemáticamente para Ley 73 y Ley 97
-- =============================================================================

INSERT INTO pensiones_indicadores 
(codigo, regimen, nombre, descripcion, valor, unidad, tipo_valor, anio_referencia, fecha_vigencia_inicio, fecha_vigencia_fin, fuente, fuente_url, fundamento_legal, formula_calculo, metodo_obtencion, activo)
VALUES
-- 2024: Salario Mínimo General
('SALARIO_MINIMO_GENERAL', 'general', 'Salario Mínimo General 2024', 'Salario mínimo general diario vigente en el área geográfica nacional', 248.9300, 'MXN_DIARIO', 'OFICIAL', 2024, '2024-01-01', '2024-12-31', 'CONASAMI / Diario Oficial de la Federación', 'https://www.dof.gob.mx/nota_detalle.php?codigo=5711145&fecha=12/12/2023', 'Resolución del H. Consejo de Representantes de la Comisión Nacional de los Salarios Mínimos publicada en el DOF el 12 de diciembre de 2023', 'Fijación anual por acuerdo tripartito en CONASAMI', 'MANUAL', 1),

-- 2024: Pensión Mínima Ley 73 ($8,404.50)
('PENSION_MINIMA_LEY_73', 'ley73', 'Pensión Mínima Garantizada Ley 73 (2024)', 'Pensión mínima garantizada mensual para pensionados bajo régimen Ley 73', 8404.5000, 'MXN_MENSUAL', 'OFICIAL', 2024, '2024-01-01', '2024-12-31', 'DOF / IMSS / CONASAMI', 'https://www.dof.gob.mx/nota_detalle.php?codigo=5711145&fecha=12/12/2023', 'Artículo 168 de la Ley del Seguro Social de 1973 y Decreto publicado en el DOF el 20 de diciembre de 2001 (factor de actualización 1.11)', '248.93 * (365 / 12) * 1.11', 'MANUAL', 1),

-- 2025: Salario Mínimo General
('SALARIO_MINIMO_GENERAL', 'general', 'Salario Mínimo General 2025', 'Salario mínimo general diario vigente en el área geográfica nacional', 278.8000, 'MXN_DIARIO', 'OFICIAL', 2025, '2025-01-01', '2025-12-31', 'CONASAMI / Diario Oficial de la Federación', 'https://www.dof.gob.mx/nota_detalle.php?codigo=5745678&fecha=19/12/2024', 'Resolución del H. Consejo de Representantes de la Comisión Nacional de los Salarios Mínimos publicada en el DOF el 19 de diciembre de 2024', 'Fijación anual por acuerdo tripartito en CONASAMI', 'MANUAL', 1),

-- 2025: Pensión Mínima Ley 73 ($9,412.99)
('PENSION_MINIMA_LEY_73', 'ley73', 'Pensión Mínima Garantizada Ley 73 (2025)', 'Pensión mínima garantizada mensual para pensionados bajo régimen Ley 73', 9412.9900, 'MXN_MENSUAL', 'OFICIAL', 2025, '2025-01-01', '2025-12-31', 'DOF / IMSS / CONASAMI', 'https://www.dof.gob.mx/nota_detalle.php?codigo=5745678&fecha=19/12/2024', 'Artículo 168 de la Ley del Seguro Social de 1973 y Decreto publicado en el DOF el 20 de diciembre de 2001 (factor de actualización 1.11)', '278.80 * (365 / 12) * 1.11', 'MANUAL', 1),

-- 2026: Salario Mínimo General
('SALARIO_MINIMO_GENERAL', 'general', 'Salario Mínimo General 2026', 'Salario mínimo general diario vigente en el área geográfica nacional', 315.0400, 'MXN_DIARIO', 'OFICIAL', 2026, '2026-01-01', '2026-12-31', 'CONASAMI / Diario Oficial de la Federación', 'https://www.dof.gob.mx/nota_detalle.php?codigo=5776543&fecha=19/12/2025', 'Resolución del H. Consejo de Representantes de la Comisión Nacional de los Salarios Mínimos publicada en el DOF el 19 de diciembre de 2025', 'Fijación anual por acuerdo tripartito en CONASAMI', 'MANUAL', 1),

-- 2026: Pensión Mínima Ley 73 ($10,636.54)
('PENSION_MINIMA_LEY_73', 'ley73', 'Pensión Mínima Garantizada Ley 73 (2026)', 'Pensión mínima garantizada mensual para pensionados bajo régimen Ley 73', 10636.5400, 'MXN_MENSUAL', 'OFICIAL', 2026, '2026-01-01', '2026-12-31', 'DOF / IMSS / CONASAMI', 'https://www.dof.gob.mx/nota_detalle.php?codigo=5776543&fecha=19/12/2025', 'Artículo 168 de la Ley del Seguro Social de 1973 y Decreto publicado en el DOF el 20 de diciembre de 2001 (factor de actualización 1.11)', '315.04 * (365 / 12) * 1.11', 'MANUAL', 1),

-- 2026: Pensión Mínima Garantizada Ley 97
('PENSION_MINIMA_GARANTIZADA_LEY_97', 'ley97', 'Pensión Mínima Garantizada Ley 97 Base (2026)', 'Monto base referencial de pensión garantizada conforme a la tabla del Art. 170 LSS', 3778.0000, 'MXN_MENSUAL', 'OFICIAL', 2026, '2026-02-01', '2027-01-31', 'IMSS / INEGI / DOF', 'https://www.imss.gob.mx/pensiones/preguntas-frecuentes/pension-garantizada', 'Artículo 170 de la Ley del Seguro Social de 1997 (reforma DOF 16/12/2020). Actualización anual en febrero conforme al INPC anual publicado por el INEGI.', 'Matriz legal Art. 170 LSS indexada por INPC INEGI', 'MANUAL', 1)

ON DUPLICATE KEY UPDATE
    nombre = VALUES(nombre),
    descripcion = VALUES(descripcion),
    valor = VALUES(valor),
    unidad = VALUES(unidad),
    tipo_valor = VALUES(tipo_valor),
    fecha_vigencia_inicio = VALUES(fecha_vigencia_inicio),
    fecha_vigencia_fin = VALUES(fecha_vigencia_fin),
    fuente = VALUES(fuente),
    fuente_url = VALUES(fuente_url),
    fundamento_legal = VALUES(fundamento_legal),
    formula_calculo = VALUES(formula_calculo),
    activo = VALUES(activo);

-- Registro de historial de sembrado inicial para trazabilidad
INSERT INTO pensiones_indicadores_historial 
(indicador_id, codigo, regimen, valor_anterior, valor_nuevo, tipo_valor_nuevo, motivo, fuente, fuente_url, usuario_id, metodo_actualizacion)
SELECT 
    id, codigo, regimen, NULL, valor, tipo_valor,
    'Carga y validación inicial de indicadores legales oficiales (Fase 2)',
    fuente, fuente_url, NULL, 'MANUAL'
FROM pensiones_indicadores
WHERE codigo IN ('SALARIO_MINIMO_GENERAL', 'PENSION_MINIMA_LEY_73', 'PENSION_MINIMA_GARANTIZADA_LEY_97')
  AND NOT EXISTS (
      SELECT 1 FROM pensiones_indicadores_historial h WHERE h.indicador_id = pensiones_indicadores.id
  );
