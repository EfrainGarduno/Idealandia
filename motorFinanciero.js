/**
 * motorFinanciero.js
 * Motor matemático de cálculo para el Simulador de Inversiones (Idealandia)
 * 
 * Funciones puras, determinísticas y desacopladas de la interfaz y la base de datos.
 * Compatible con Node.js (CommonJS) y navegadores web (window.MotorFinanciero).
 */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.MotorFinanciero = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /**
     * Distribuye un monto total de inversión a través de una lista ordenada de tramos.
     * 
     * @param {number|string} inversionTotal Monto total a invertir
     * @param {Array<Object>} tramos Lista de tramos [{ limite_inferior, limite_superior, tasa_anual, ... }]
     * @returns {Array<Object>} Desglose por tramo con monto_en_tramo y porcentaje
     */
    function distribuirInversionEnTramos(inversionTotal, tramos) {
        const total = Math.max(0, parseFloat(inversionTotal) || 0);
        if (!Array.isArray(tramos) || tramos.length === 0) {
            return [];
        }

        // Ordenar tramos por limite_inferior ascendente
        const tramosOrdenados = [...tramos].sort((a, b) => {
            const infA = parseFloat(a.limite_inferior) || 0;
            const infB = parseFloat(b.limite_inferior) || 0;
            return infA - infB;
        });

        return tramosOrdenados.map((tramo, index) => {
            const inf = parseFloat(tramo.limite_inferior) || 0;
            const sup = tramo.limite_superior !== null && tramo.limite_superior !== undefined && tramo.limite_superior !== ''
                ? parseFloat(tramo.limite_superior)
                : null;
            const tasa = parseFloat(tramo.tasa_anual) || 0;

            let montoEnTramo = 0;
            if (total > inf) {
                if (sup !== null) {
                    montoEnTramo = Math.min(total, sup) - inf;
                } else {
                    montoEnTramo = total - inf;
                }
            }

            montoEnTramo = Math.max(0, montoEnTramo);

            return {
                numero_tramo: tramo.numero_tramo || (index + 1),
                limite_inferior: inf,
                limite_superior: sup,
                tasa_anual: tasa,
                descripcion_tramo: tramo.descripcion_tramo || '',
                monto_en_tramo: montoEnTramo
            };
        });
    }

    /**
     * Calcula los rendimientos de una institución para una inversión y plazo dados.
     * 
     * Fórmulas aprobadas:
     * - Tasa mensual = tasa anual / 100 / 12
     * - Rendimiento mensual del tramo = monto del tramo * tasa mensual
     * - Rendimiento del periodo = rendimiento mensual * meses
     * - Total mensual = suma de rendimientos mensuales de todos los tramos
     * - Total periodo = suma de rendimientos de todos los tramos
     * 
     * @param {number|string} inversionTotal Monto total capturado
     * @param {number|string} meses Plazo en meses
     * @param {Array<Object>} tramos Lista de tramos de la institución
     * @returns {Object} Resumen completo con totales y desglose por tramos
     */
    function simularInversion(inversionTotal, meses, tramos) {
        const capital = Math.max(0, parseFloat(inversionTotal) || 0);
        const plazoMeses = Math.max(0, parseInt(meses, 10) || 0);
        const tramosDistribuidos = distribuirInversionEnTramos(capital, tramos);

        let totalMensual = 0;
        let totalPeriodo = 0;

        const desgloseTramos = tramosDistribuidos.map(t => {
            const tasaMensual = (t.tasa_anual / 100) / 12;
            const rendMensual = t.monto_en_tramo * tasaMensual;
            const rendPeriodo = rendMensual * plazoMeses;

            totalMensual += rendMensual;
            totalPeriodo += rendPeriodo;

            return {
                ...t,
                tasa_mensual: tasaMensual,
                rendimiento_mensual: rendMensual,
                rendimiento_periodo: rendPeriodo
            };
        });

        // Para la compatibilidad visual con la tabla de 2 tramos:
        // Tramo 1 (Base):
        const t1 = desgloseTramos[0] || null;
        // Tramo 2 (Segundo rango / excedente):
        const t2 = desgloseTramos[1] || null;

        const inversionBase = t1 ? t1.monto_en_tramo : capital;
        const tasaBase = t1 ? t1.tasa_anual : 0;
        const monto2 = t1 && t1.limite_superior !== null ? t1.limite_superior : null;
        const inversion2 = t2 ? t2.monto_en_tramo : 0;
        const rend1 = t1 ? t1.rendimiento_periodo : 0;
        const rend2 = t2 ? t2.rendimiento_periodo : 0;

        return {
            inversion_total: capital,
            meses: plazoMeses,
            total_mensual: totalMensual,
            total_periodo: totalPeriodo,
            // Mapeo específico para tabla visual original:
            inversion_base: inversionBase,
            tasa_base: tasaBase,
            monto_2: monto2,
            inversion_2: inversion2,
            rend1: rend1,
            rend2: rend2,
            // Soporte dinámico para N tramos:
            num_tramos: desgloseTramos.length,
            tramos: desgloseTramos
        };
    }

    /**
     * Valida la coherencia de una lista de tramos para registro en BD.
     * Reglas:
     * 1. Al menos un tramo.
     * 2. El primer tramo inicia en 0.00.
     * 3. Limite superior > Limite inferior.
     * 4. Limite inferior del siguiente coincide exactamente con limite superior del anterior.
     * 5. Solo el último tramo puede tener limite superior null.
     * 6. Tasas entre 0.00 y 100.00.
     * 
     * @param {Array<Object>} tramos
     * @returns {{ valido: boolean, error: string|null }}
     */
    function validarTramos(tramos) {
        if (!Array.isArray(tramos) || tramos.length === 0) {
            return { valido: false, error: 'Debe existir al menos un tramo de tasa.' };
        }

        for (let i = 0; i < tramos.length; i++) {
            const t = tramos[i];
            const inf = parseFloat(t.limite_inferior);
            const sup = t.limite_superior !== null && t.limite_superior !== undefined && t.limite_superior !== ''
                ? parseFloat(t.limite_superior)
                : null;
            const tasa = parseFloat(t.tasa_anual);

            if (isNaN(inf) || inf < 0) {
                return { valido: false, error: `El límite inferior del tramo ${i + 1} debe ser un número mayor o igual a 0.` };
            }

            if (isNaN(tasa) || tasa < 0 || tasa > 100) {
                return { valido: false, error: `La tasa anual del tramo ${i + 1} debe estar entre 0% y 100%.` };
            }

            if (i === 0 && inf !== 0) {
                return { valido: false, error: 'El primer tramo debe comenzar exactamente en 0.00.' };
            }

            if (sup !== null) {
                if (isNaN(sup) || sup <= inf) {
                    return { valido: false, error: `En el tramo ${i + 1}, el límite superior (${sup}) debe ser mayor que el inferior (${inf}).` };
                }
            } else {
                if (i !== tramos.length - 1) {
                    return { valido: false, error: `Únicamente el último tramo (${tramos.length}) puede tener límite superior abierto (sin tope).` };
                }
            }

            if (i > 0) {
                const prevSup = tramos[i - 1].limite_superior !== null ? parseFloat(tramos[i - 1].limite_superior) : null;
                if (prevSup === null || Math.abs(inf - prevSup) > 0.0001) {
                    return { valido: false, error: `El límite inferior del tramo ${i + 1} ($${inf}) debe coincidir exactamente con el límite superior del tramo ${i} ($${prevSup}).` };
                }
            }
        }

        return { valido: true, error: null };
    }

    /**
     * Genera automáticamente el resumen textual de condiciones a partir de los tramos configurados.
     * 
     * @param {Array<Object>} tramos Lista de tramos de tasa
     * @returns {string} Texto resumen representativo (ej. "Hasta $25,000 al 13%, excedente al 6.5%")
     */
    function generarResumenCondiciones(tramos) {
        if (!Array.isArray(tramos) || tramos.length === 0) {
            return 'Sin condiciones';
        }

        const formatTasa = (tasa) => {
            const num = parseFloat(tasa) || 0;
            return num % 1 === 0 ? `${num.toFixed(0)}%` : `${num.toFixed(2).replace(/0$/, '')}%`;
        };

        const formatMonto = (monto) => {
            return `$${Number(monto).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
        };

        if (tramos.length === 1) {
            return `Tasa fija ${formatTasa(tramos[0].tasa_anual)}`;
        }

        if (tramos.length === 2) {
            const t1 = tramos[0];
            const t2 = tramos[1];
            return `Hasta ${formatMonto(t1.limite_superior)} al ${formatTasa(t1.tasa_anual)}, excedente al ${formatTasa(t2.tasa_anual)}`;
        }

        const partes = [];
        partes.push(`Hasta ${formatMonto(tramos[0].limite_superior)} al ${formatTasa(tramos[0].tasa_anual)}`);
        for (let i = 1; i < tramos.length - 1; i++) {
            partes.push(`${formatMonto(tramos[i].limite_inferior)}-${formatMonto(tramos[i].limite_superior)} al ${formatTasa(tramos[i].tasa_anual)}`);
        }
        partes.push(`excedente al ${formatTasa(tramos[tramos.length - 1].tasa_anual)}`);
        return partes.join(', ');
    }

    /**
     * Formatea un número como moneda mexicana ($1,234.56).
     */
    function formatMoneyInternal(amount) {
        if (amount === null || amount === undefined || isNaN(amount)) return '—';
        return '$' + Number(amount).toLocaleString('es-MX', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    // Catálogo base de estrategias preconfiguradas (utilizado como fallback si la BD no está disponible)
    const ESTRATEGIAS_DEFAULT = {
        'maximo_rendimiento': {
            codigo: 'maximo_rendimiento',
            nombre: 'Máximo rendimiento',
            color: '#16a34a',
            icono: 'fas fa-trophy',
            max_concentracion_inst: 100.0,
            min_instituciones: 1,
            max_concentracion_tipo: null,
            diversificar_tipos: 0,
            asignacion_minima_viable: 1000.0,
            descripcion_criterio: 'Se priorizaron las instituciones con mayor rendimiento estimado, permitiendo una mayor concentración del capital dentro de los límites configurados y respetando tramos y restricciones.'
        },
        'equilibrada': {
            codigo: 'equilibrada',
            nombre: 'Equilibrada',
            color: '#2563eb',
            icono: 'fas fa-balance-scale',
            max_concentracion_inst: 40.0,
            min_instituciones: 3,
            max_concentracion_tipo: 60.0,
            diversificar_tipos: 1,
            asignacion_minima_viable: 2000.0,
            descripcion_criterio: 'Se buscó un equilibrio entre rendimiento y diversificación, limitando la concentración por institución al 40% y procurando variedad entre tipos de instituciones (Bancos, Sofipos y Fintechs).'
        },
        'conservadora': {
            codigo: 'conservadora',
            nombre: 'Conservadora',
            color: '#d97706',
            icono: 'fas fa-shield-alt',
            max_concentracion_inst: 25.0,
            min_instituciones: 4,
            max_concentracion_tipo: 40.0,
            diversificar_tipos: 1,
            asignacion_minima_viable: 2000.0,
            descripcion_criterio: 'Se priorizó una mayor diversificación del capital y una menor concentración por institución (máximo 25%) y por sector, aceptando una posible reducción del rendimiento estimado en favor de una distribución más amplia.'
        }
    };

    function obtenerDescripcionTipoInstitucion(tipo) {
        switch (tipo) {
            case 'B': return 'Banco';
            case 'S': return 'Sofipo';
            case 'F': return 'Fintech';
            case 'O': return 'Otro';
            default: return 'Institución';
        }
    }

    /**
     * Calcula la mejor inversión diversificada entre un conjunto de instituciones seleccionadas.
     * 
     * Implementa las tres estrategias de inversión:
     * - 🟢 Máximo rendimiento (máxima ganancia estimada, concentración alta)
     * - 🔵 Equilibrada (equilibrio rendimiento y concentración media por inst y tipo)
     * - 🟠 Conservadora (prioriza diversificación amplia y menor concentración por inst y tipo)
     * 
     * Respeta:
     * - Parámetros configurables desde BD (finanzas_estrategias_config).
     * - Invariante matemático: Capital Total = Capital Distribuido + Capital sin Distribuir.
     * - Tramos y tasas marginales de cada institución (modelo actual).
     * - Restricciones y requisitos reales de BD (clasificación elegible / no elegible).
     * - Tasa efectiva ponderada real = Σ(rendimiento anual de cada asignación) / capital distribuido.
     * - Sin asignaciones simbólicas arbitrarias para forzar métricas.
     * 
     * @param {Object} params Parámetros de la diversificación
     * @returns {Object} Estrategia calculada con desglose, comparativa y explicaciones
     */
    function calcularMejorInversionDiversificada({
        inversionTotal = 0,
        meses = 1,
        instituciones = [],
        estrategia = 'maximo_rendimiento',
        estrategiasConfig = [],
        numInstituciones = 'todas',
        maxPorcentajePorInst = null,
        personalizaciones = new Map()
    }) {
        const capital = Math.max(0, parseFloat(inversionTotal) || 0);
        const plazoMeses = Math.max(1, parseInt(meses, 10) || 1);

        // 1. Resolver la configuración de la estrategia
        let cfg = null;
        if (typeof estrategia === 'object' && estrategia !== null) {
            cfg = { ...estrategia };
        } else {
            const codigoStr = String(estrategia || 'maximo_rendimiento').toLowerCase();
            if (Array.isArray(estrategiasConfig) && estrategiasConfig.length > 0) {
                const encontrada = estrategiasConfig.find(e => e.codigo === codigoStr);
                if (encontrada) cfg = { ...encontrada };
            }
            if (!cfg && ESTRATEGIAS_DEFAULT[codigoStr]) {
                cfg = { ...ESTRATEGIAS_DEFAULT[codigoStr] };
            }
            if (!cfg) {
                cfg = { ...ESTRATEGIAS_DEFAULT['maximo_rendimiento'] };
            }
        }

        // Si se envió explícitamente maxPorcentajePorInst (por compatibilidad o control manual), respetarlo
        if (maxPorcentajePorInst !== null && maxPorcentajePorInst !== undefined && !isNaN(parseFloat(maxPorcentajePorInst))) {
            cfg.max_concentracion_inst = Math.min(100, Math.max(1, parseFloat(maxPorcentajePorInst)));
        }

        const maxPctInst = Math.min(100, Math.max(1, parseFloat(cfg.max_concentracion_inst) || 100));
        const maxPctTipo = (cfg.max_concentracion_tipo !== null && cfg.max_concentracion_tipo !== undefined && !isNaN(parseFloat(cfg.max_concentracion_tipo)))
            ? Math.min(100, Math.max(1, parseFloat(cfg.max_concentracion_tipo)))
            : null;
        const diversificarTipos = Boolean(cfg.diversificar_tipos);
        const minInstitucionesDeseadas = Math.max(1, parseInt(cfg.min_instituciones, 10) || 1);

        // Umbral de asignación mínima viable para evitar asignaciones simbólicas ($50)
        let asignacionMinimaViable = parseFloat(cfg.asignacion_minima_viable) || 1000.0;
        if (capital < asignacionMinimaViable * 2) {
            asignacionMinimaViable = Math.max(100, capital / 4);
        }

        // 2. Evaluar elegibilidad y restricciones de las instituciones seleccionadas
        const institucionesValidas = (Array.isArray(instituciones) ? instituciones : []).filter(inst => {
            const tramos = (inst.esquema && Array.isArray(inst.esquema.tramos)) ? inst.esquema.tramos : [];
            return tramos.length > 0;
        });

        const institucionesElegibles = [];
        const institucionesNoElegibles = [];

        institucionesValidas.forEach(inst => {
            const restrs = Array.isArray(inst.restricciones) ? inst.restricciones : [];
            let esElegible = true;
            let motivoIneligibilidad = '';

            // Evaluar restricciones financieras cuantitativas (ej. depósito mínimo requerido)
            for (const r of restrs) {
                if (r && r.activo !== 0 && r.activo !== false) {
                    const desc = (r.descripcion || '').toLowerCase();
                    // Detectar si requiere depósito mayor al capital disponible (ej. "depósito de $3,000")
                    const matchDeposito = desc.match(/dep[oó]sito\s+(?:mensual\s+)?(?:de\s+)?\$?([0-9,.]+)/i);
                    if (matchDeposito) {
                        const montoReq = parseFloat(matchDeposito[1].replace(/,/g, '')) || 0;
                        if (montoReq > 0 && capital < montoReq) {
                            esElegible = false;
                            motivoIneligibilidad = `Requiere depósito mínimo de $${formatMoneyInternal(montoReq)} mensuales y el capital disponible es menor ($${formatMoneyInternal(capital)}).`;
                            break;
                        }
                    }
                }
            }

            if (esElegible) {
                institucionesElegibles.push(inst);
            } else {
                institucionesNoElegibles.push({
                    institucionId: inst.id,
                    nombre: inst.nombre,
                    tipo: inst.tipo,
                    tipoDescripcion: obtenerDescripcionTipoInstitucion(inst.tipo),
                    motivo: motivoIneligibilidad
                });
            }
        });

        if (institucionesElegibles.length === 0 || capital <= 0) {
            return {
                exito: false,
                mensajeError: capital <= 0
                    ? 'Introduce un capital de inversión mayor a $0 para calcular la estrategia diversificada.'
                    : 'No hay instituciones financieras elegibles disponibles que cumplan con las condiciones para diversificar.',
                inversionTotal: capital,
                meses: plazoMeses,
                estrategia: {
                    codigo: cfg.codigo,
                    nombre: cfg.nombre,
                    color: cfg.color,
                    icono: cfg.icono,
                    max_concentracion_inst: maxPctInst,
                    max_concentracion_tipo: maxPctTipo,
                    min_instituciones: minInstitucionesDeseadas,
                    diversificar_tipos: diversificarTipos,
                    descripcion_criterio: cfg.descripcion_criterio
                },
                numInstitucionesSolicitado: numInstituciones,
                numInstitucionesUtilizadas: 0,
                maxPorcentajePorInst: maxPctInst,
                topeMaximoPorInst: 0,
                rendimientoPeriodoTotal: 0,
                rendimientoMensualTotal: 0,
                tasaEfectivaPonderada: 0,
                capitalDistribuido: 0,
                capitalSinDistribuir: capital,
                motivoSinDistribuir: 'No hay instituciones financieras elegibles seleccionadas.',
                asignaciones: [],
                restriccionesRelevantes: [],
                institucionesNoElegibles,
                concentracion: { institucionMayorAsignacion: '—', montoMayorAsignacion: 0, porcentajeMayorAsignacion: 0 },
                explicacion: 'Selecciona al menos una institución financiera elegible para calcular la estrategia diversificada.',
                comparativa: null
            };
        }

        // 3. Topes de concentración según la estrategia
        const topePorInst = (institucionesElegibles.length === 1 || maxPctInst >= 100)
            ? capital
            : (capital * (maxPctInst / 100));

        const topePorTipo = maxPctTipo !== null
            ? (capital * (maxPctTipo / 100))
            : capital;

        function resolverAsignacionParaConjunto(subset) {
            // Descomponer cada institución del subconjunto en tramos marginales
            const tramosSlices = [];
            subset.forEach(inst => {
                const tramos = [...inst.esquema.tramos].sort((a, b) => (parseFloat(a.limite_inferior) || 0) - (parseFloat(b.limite_inferior) || 0));
                const custom = personalizaciones.get ? personalizaciones.get(inst.id) : (personalizaciones[inst.id] || null);
                const isCustom = custom && custom.isModified;

                tramos.forEach(t => {
                    const inf = parseFloat(t.limite_inferior) || 0;
                    const sup = (t.limite_superior !== null && t.limite_superior !== undefined && t.limite_superior !== '')
                        ? parseFloat(t.limite_superior)
                        : null;
                    const tasa = isCustom && custom.tasa !== undefined ? parseFloat(custom.tasa) : (parseFloat(t.tasa_anual) || 0);

                    if (inf < topePorInst) {
                        const supEfectivo = sup !== null ? Math.min(sup, topePorInst) : topePorInst;
                        const capacidad = Math.max(0, supEfectivo - inf);
                        if (capacidad > 0) {
                            tramosSlices.push({
                                institucionId: inst.id,
                                instNombre: inst.nombre,
                                instTipo: inst.tipo,
                                instTipoDesc: obtenerDescripcionTipoInstitucion(inst.tipo),
                                numeroTramo: t.numero_tramo,
                                inf,
                                sup: supEfectivo,
                                tasa,
                                capacidad,
                                montoAsignado: 0
                            });
                        }
                    }
                });
            });

            // Ordenar tramos por tasa anual descendente
            tramosSlices.sort((a, b) => b.tasa - a.tasa);

            let capitalRestante = capital;
            const asignadoPorInst = new Map();
            const asignadoPorTipo = new Map();
            subset.forEach(inst => {
                asignadoPorInst.set(inst.id, 0);
                asignadoPorTipo.set(inst.tipo, 0);
            });

            // Si la estrategia exige diversificar por tipos, procurar asignación mínima a tipos distintos
            if (diversificarTipos && subset.length > 1) {
                const tiposDisponibles = Array.from(new Set(subset.map(i => i.tipo)));
                if (tiposDisponibles.length > 1 && capitalRestante >= tiposDisponibles.length * asignacionMinimaViable) {
                    tiposDisponibles.forEach(tipo => {
                        const sliceDelTipo = tramosSlices.find(s => s.instTipo === tipo && s.capacidad >= asignacionMinimaViable && (asignadoPorInst.get(s.institucionId) || 0) === 0);
                        if (sliceDelTipo) {
                            const montoReserva = Math.min(asignacionMinimaViable, sliceDelTipo.capacidad, capitalRestante);
                            const instId = sliceDelTipo.institucionId;
                            sliceDelTipo.montoAsignado += montoReserva;
                            sliceDelTipo.capacidad -= montoReserva;
                            capitalRestante -= montoReserva;
                            asignadoPorInst.set(instId, (asignadoPorInst.get(instId) || 0) + montoReserva);
                            asignadoPorTipo.set(tipo, (asignadoPorTipo.get(tipo) || 0) + montoReserva);
                        }
                    });
                }
            }

            // Distribución Voraz Óptima sobre tramos de mayor rendimiento respetando topes de inst y tipo
            for (let i = 0; i < tramosSlices.length && capitalRestante > 0.001; i++) {
                const slice = tramosSlices[i];
                const instId = slice.institucionId;
                const instTipo = slice.instTipo;

                const yaAsignadoInst = asignadoPorInst.get(instId) || 0;
                const margenInst = Math.max(0, topePorInst - yaAsignadoInst);

                const yaAsignadoTipo = asignadoPorTipo.get(instTipo) || 0;
                const margenTipo = Math.max(0, topePorTipo - yaAsignadoTipo);

                const cupo = Math.min(slice.capacidad, margenInst, margenTipo, capitalRestante);

                if (cupo > 0) {
                    slice.montoAsignado += cupo;
                    slice.capacidad -= cupo;
                    capitalRestante -= cupo;
                    asignadoPorInst.set(instId, yaAsignadoInst + cupo);
                    asignadoPorTipo.set(instTipo, yaAsignadoTipo + cupo);
                }
            }

            const asignaciones = [];
            let rendPeriodoTotal = 0;
            let rendMensualTotal = 0;

            subset.forEach(inst => {
                const montoInst = asignadoPorInst.get(inst.id) || 0;
                if (montoInst > 0) {
                    const sim = simularInversion(montoInst, plazoMeses, inst.esquema.tramos);
                    rendPeriodoTotal += sim.total_periodo;
                    rendMensualTotal += sim.total_mensual;

                    const tasaPond = montoInst > 0 ? (sim.total_mensual * 12 / montoInst) * 100 : 0;

                    asignaciones.push({
                        institucionId: inst.id,
                        nombre: inst.nombre,
                        tipo: inst.tipo,
                        tipoDescripcion: obtenerDescripcionTipoInstitucion(inst.tipo),
                        inversionAsignada: montoInst,
                        porcentajeDelCapital: (montoInst / capital) * 100,
                        tasaPonderada: tasaPond,
                        rendimientoMensual: sim.total_mensual,
                        rendimientoPeriodo: sim.total_periodo,
                        inversion1: sim.inversion_base,
                        inversion2: sim.inversion_2,
                        montoInversionBase: sim.monto_2,
                        tramosDetalle: sim.tramos,
                        restricciones: Array.isArray(inst.restricciones) ? inst.restricciones : []
                    });
                }
            });

            asignaciones.sort((a, b) => b.inversionAsignada - a.inversionAsignada);
            const totalDistribuido = asignaciones.reduce((sum, a) => sum + a.inversionAsignada, 0);
            const capitalSinDistribuir = Math.max(0, capital - totalDistribuido);

            return {
                asignaciones,
                totalDistribuido,
                capitalSinDistribuir,
                rendPeriodoTotal,
                rendMensualTotal
            };
        }

        // Determinar K si numInstituciones se envió de forma explícita
        let K = institucionesElegibles.length;
        if (numInstituciones !== 'todas' && !isNaN(parseInt(numInstituciones, 10))) {
            K = Math.max(1, Math.min(institucionesElegibles.length, parseInt(numInstituciones, 10)));
        }

        let mejorPlan = null;
        if (K >= institucionesElegibles.length) {
            mejorPlan = resolverAsignacionParaConjunto(institucionesElegibles);
        } else {
            function obtenerCombinaciones(arr, k) {
                if (k === 1) return arr.map(el => [el]);
                const combs = [];
                for (let i = 0; i <= arr.length - k; i++) {
                    const head = arr[i];
                    const tailCombs = obtenerCombinaciones(arr.slice(i + 1), k - 1);
                    tailCombs.forEach(tc => combs.push([head, ...tc]));
                }
                return combs;
            }

            const combinaciones = obtenerCombinaciones(institucionesElegibles, K);
            let mejorRend = -1;

            for (const combo of combinaciones) {
                const plan = resolverAsignacionParaConjunto(combo);
                if (plan.asignaciones.length === K && plan.capitalSinDistribuir <= 0.01) {
                    if (plan.rendPeriodoTotal > mejorRend) {
                        mejorRend = plan.rendPeriodoTotal;
                        mejorPlan = plan;
                    }
                }
            }

            if (!mejorPlan) {
                for (const combo of combinaciones) {
                    const plan = resolverAsignacionParaConjunto(combo);
                    if (plan.rendPeriodoTotal > mejorRend) {
                        mejorRend = plan.rendPeriodoTotal;
                        mejorPlan = plan;
                    }
                }
            }

            if (!mejorPlan) {
                mejorPlan = resolverAsignacionParaConjunto(institucionesElegibles);
            }
        }

        const asignacionesFinales = mejorPlan.asignaciones;
        const totalDistribuido = mejorPlan.totalDistribuido;
        const capitalSinDistribuir = mejorPlan.capitalSinDistribuir;
        const rendPeriodoTotal = mejorPlan.rendPeriodoTotal;
        const rendMensualTotal = mejorPlan.rendMensualTotal;

        // Tasa efectiva ponderada estricta = Σ(rendimiento anual de cada asignación) / capital total distribuido
        const tasaEfectivaPonderada = totalDistribuido > 0
            ? (rendMensualTotal * 12 / totalDistribuido) * 100
            : 0;

        // Explicación de capital sin distribuir si aplica
        let motivoSinDistribuir = null;
        if (capitalSinDistribuir > 0.01) {
            const motivos = [];
            if (maxPctInst < 100) {
                motivos.push(`las instituciones elegibles alcanzaron su límite máximo de concentración (${maxPctInst}% por institución)`);
            }
            if (maxPctTipo !== null && maxPctTipo < 100) {
                motivos.push(`los sectores alcanzaron su límite de concentración (${maxPctTipo}% por tipo)`);
            }
            motivoSinDistribuir = motivos.length > 0
                ? `El capital restante no pudo asignarse debido a que ${motivos.join(' y ')}, y no hay instituciones elegibles adicionales disponibles para absorberlo.`
                : 'El capital restante no pudo asignarse debido a las restricciones configuradas de las instituciones disponibles.';
        }

        // Restricciones relevantes de las instituciones utilizadas
        const restriccionesRelevantes = [];
        asignacionesFinales.forEach(a => {
            const activas = a.restricciones.filter(r => r && r.activo !== 0 && r.activo !== false);
            activas.forEach(r => {
                restriccionesRelevantes.push({
                    institucionId: a.institucionId,
                    nombre: a.nombre,
                    tipo: a.tipo,
                    tipoDescripcion: a.tipoDescripcion,
                    descripcion: r.descripcion
                });
            });
        });

        // Métrica de concentración
        const mayorAsignacion = asignacionesFinales.length > 0 ? asignacionesFinales[0] : null;
        const concentracion = {
            institucionMayorAsignacion: mayorAsignacion ? mayorAsignacion.nombre : '—',
            montoMayorAsignacion: mayorAsignacion ? mayorAsignacion.inversionAsignada : 0,
            porcentajeMayorAsignacion: mayorAsignacion && capital > 0 ? (mayorAsignacion.inversionAsignada / capital) * 100 : 0
        };

        // Comparativa contra "Todo en una sola institución" (sin diversificar)
        let mejorIndividual = null;
        let mejorIndRend = -1;
        institucionesElegibles.forEach(inst => {
            const sim = simularInversion(capital, plazoMeses, inst.esquema.tramos);
            if (sim.total_periodo > mejorIndRend) {
                mejorIndRend = sim.total_periodo;
                mejorIndividual = {
                    institucionId: inst.id,
                    nombre: inst.nombre,
                    tipo: inst.tipo,
                    tipoDescripcion: obtenerDescripcionTipoInstitucion(inst.tipo),
                    rendimientoPeriodo: sim.total_periodo,
                    rendimientoMensual: sim.total_mensual
                };
            }
        });

        const diferenciaPeriodo = rendPeriodoTotal - (mejorIndividual ? mejorIndividual.rendimientoPeriodo : 0);
        const diferenciaMensual = rendMensualTotal - (mejorIndividual ? mejorIndividual.rendimientoMensual : 0);

        // Explicación adaptada al criterio de la estrategia
        let explicacion = '';
        const nombresUsadas = asignacionesFinales.map(a => `${a.nombre} (${a.tipoDescripcion})`);

        if (asignacionesFinales.length === 1) {
            explicacion = `La estrategia asigna la totalidad del capital distribuido a ${asignacionesFinales[0].nombre} (${asignacionesFinales[0].tipoDescripcion}) al ser la única institución elegible que optimiza las condiciones seleccionadas.`;
        } else {
            if (cfg.codigo === 'maximo_rendimiento') {
                explicacion = `Se priorizaron las instituciones con mayor rendimiento estimado (${nombresUsadas.join(', ')}), permitiendo una mayor concentración del capital dentro de los límites configurados y aprovechando los tramos con mejores tasas.`;
            } else if (cfg.codigo === 'conservadora') {
                explicacion = `Se priorizó una mayor diversificación del capital y una menor concentración por institución (máximo ${maxPctInst}%) y por tipo (${nombresUsadas.join(', ')}), aceptando una posible reducción del rendimiento estimado en favor de una distribución más amplia.`;
            } else {
                // Equilibrada
                explicacion = `Se buscó un equilibrio entre rendimiento y diversificación, limitando la concentración por institución al ${maxPctInst}% y distribuyendo el capital entre ${asignacionesFinales.length} instituciones de distintos tipos (${nombresUsadas.join(', ')}).`;
            }
        }

        return {
            exito: true,
            mensajeError: null,
            inversionTotal: capital,
            meses: plazoMeses,
            estrategia: {
                codigo: cfg.codigo,
                nombre: cfg.nombre,
                color: cfg.color,
                icono: cfg.icono,
                max_concentracion_inst: maxPctInst,
                max_concentracion_tipo: maxPctTipo,
                min_instituciones: minInstitucionesDeseadas,
                diversificar_tipos: diversificarTipos,
                descripcion_criterio: cfg.descripcion_criterio
            },
            numInstitucionesSolicitado: numInstituciones,
            numInstitucionesUtilizadas: asignacionesFinales.length,
            maxPorcentajePorInst: maxPctInst,
            topeMaximoPorInst: topePorInst,
            rendimientoPeriodoTotal: rendPeriodoTotal,
            rendimientoMensualTotal: rendMensualTotal,
            tasaEfectivaPonderada: tasaEfectivaPonderada,
            capitalDistribuido: totalDistribuido,
            capitalSinDistribuir: capitalSinDistribuir,
            motivoSinDistribuir: motivoSinDistribuir,
            asignaciones: asignacionesFinales,
            restriccionesRelevantes,
            institucionesNoElegibles,
            concentracion,
            explicacion,
            comparativa: {
                mejorIndividual,
                diversificada: {
                    numInstituciones: asignacionesFinales.length,
                    rendimientoPeriodo: rendPeriodoTotal,
                    rendimientoMensual: rendMensualTotal
                },
                diferenciaPeriodo,
                diferenciaMensual,
                esMayorDiversificada: diferenciaPeriodo >= 0
            }
        };
    }

    return {
        distribuirInversionEnTramos,
        simularInversion,
        validarTramos,
        generarResumenCondiciones,
        calcularMejorInversionDiversificada,
        ESTRATEGIAS_DEFAULT,
        obtenerDescripcionTipoInstitucion
    };
}));
