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

    /**
     * Calcula la mejor inversión diversificada entre un conjunto de instituciones seleccionadas.
     * 
     * Maximiza el rendimiento total del capital distribuido respetando:
     * - Capital total disponible (SUMA(asignaciones) = inversionTotal).
     * - Número de instituciones solicitado (K) o todas las disponibles.
     * - Límite máximo de concentración por institución (ej. maxPorcentajePorInst = 50%).
     * - Tramos y tasas marginales de cada institución.
     * - Restricciones y requisitos de cada institución.
     * - Preservación de modificaciones manuales de usuario si existen.
     * 
     * @param {Object} params Parámetros de la diversificación
     * @returns {Object} Estrategia calculada con desglose, comparativa y explicaciones
     */
    function calcularMejorInversionDiversificada({
        inversionTotal = 0,
        meses = 1,
        instituciones = [],
        numInstituciones = 'todas',
        maxPorcentajePorInst = 50,
        personalizaciones = new Map()
    }) {
        const capital = Math.max(0, parseFloat(inversionTotal) || 0);
        const plazoMeses = Math.max(1, parseInt(meses, 10) || 1);
        const maxPct = Math.min(100, Math.max(1, parseFloat(maxPorcentajePorInst) || 50));

        // Filtrar instituciones válidas con esquemas y tramos
        const instValidas = (Array.isArray(instituciones) ? instituciones : []).filter(inst => {
            const tramos = (inst.esquema && Array.isArray(inst.esquema.tramos)) ? inst.esquema.tramos : [];
            return tramos.length > 0;
        });

        if (instValidas.length === 0 || capital <= 0) {
            return {
                exito: false,
                mensajeError: 'No hay instituciones financieras con condiciones activas disponibles para diversificar.',
                inversionTotal: capital,
                meses: plazoMeses,
                numInstitucionesSolicitado: numInstituciones,
                numInstitucionesUtilizadas: 0,
                maxPorcentajePorInst: maxPct,
                topeMaximoPorInst: 0,
                rendimientoPeriodoTotal: 0,
                rendimientoMensualTotal: 0,
                tasaEfectivaPonderada: 0,
                capitalDistribuido: 0,
                capitalSinDistribuir: capital,
                asignaciones: [],
                restriccionesRelevantes: [],
                concentracion: { institucionMayorAsignacion: '—', montoMayorAsignacion: 0, porcentajeMayorAsignacion: 0 },
                explicacion: 'Selecciona al menos una institución financiera para calcular la estrategia diversificada.',
                comparativa: null
            };
        }

        // Determinar K (número de instituciones objetivo)
        let K = instValidas.length;
        if (numInstituciones !== 'todas' && !isNaN(parseInt(numInstituciones, 10))) {
            K = Math.max(1, Math.min(instValidas.length, parseInt(numInstituciones, 10)));
        }

        // Si solo hay 1 institución disponible o K === 1, no aplica límite de concentración (recibe 100%)
        const topePorInst = (instValidas.length === 1 || K === 1)
            ? capital
            : (capital * (maxPct / 100));

        // Si K * topePorInst < capital, ajustar K para que la suma matemática sea alcanzable
        const minInstitucionesRequeridas = Math.ceil(capital / (topePorInst || 1));
        if (K < minInstitucionesRequeridas && instValidas.length >= minInstitucionesRequeridas) {
            K = minInstitucionesRequeridas;
        }

        // Función auxiliar para optimizar asignación para un conjunto dado de instituciones
        function optimizarAsignacionParaConjunto(subset) {
            const tramosSlices = [];
            const asignacionMinima = subset.length > 1 ? Math.min(50, capital / (subset.length * 2)) : 0;

            subset.forEach(inst => {
                const tramos = [...inst.esquema.tramos].sort((a, b) => (parseFloat(a.limite_inferior) || 0) - (parseFloat(b.limite_inferior) || 0));
                
                // Verificar si tiene personalización manual
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

            // Ordenar slices de mayor a menor tasa anual
            tramosSlices.sort((a, b) => b.tasa - a.tasa);

            let capitalRestante = capital;
            const asignadoPorInst = new Map();
            subset.forEach(inst => asignadoPorInst.set(inst.id, 0));

            // Si hay más de una institución, asegurar asignación mínima a cada una para garantizar diversidad
            if (subset.length > 1 && asignacionMinima > 0 && capitalRestante >= subset.length * asignacionMinima) {
                subset.forEach(inst => {
                    const sliceInicial = tramosSlices.find(s => s.institucionId === inst.id && s.capacidad > 0);
                    if (sliceInicial) {
                        const montoBase = Math.min(asignacionMinima, sliceInicial.capacidad, capitalRestante);
                        sliceInicial.montoAsignado += montoBase;
                        sliceInicial.capacidad -= montoBase;
                        capitalRestante -= montoBase;
                        asignadoPorInst.set(inst.id, (asignadoPorInst.get(inst.id) || 0) + montoBase);
                    }
                });
            }

            // Distribuir el resto vorazmente por mayor tasa marginal respetando topePorInst
            for (let i = 0; i < tramosSlices.length && capitalRestante > 0; i++) {
                const slice = tramosSlices[i];
                const instId = slice.institucionId;
                const yaAsignadoInst = asignadoPorInst.get(instId) || 0;
                const margenInst = Math.max(0, topePorInst - yaAsignadoInst);
                const margenSlice = Math.min(slice.capacidad, margenInst, capitalRestante);

                if (margenSlice > 0) {
                    slice.montoAsignado += margenSlice;
                    slice.capacidad -= margenSlice;
                    capitalRestante -= margenSlice;
                    asignadoPorInst.set(instId, yaAsignadoInst + margenSlice);
                }
            }

            // Si quedó remanente por redondeo o límites finos, repartir entre las que tengan margen
            if (capitalRestante > 0.001) {
                for (let i = 0; i < tramosSlices.length && capitalRestante > 0; i++) {
                    const slice = tramosSlices[i];
                    const instId = slice.institucionId;
                    const yaAsignadoInst = asignadoPorInst.get(instId) || 0;
                    const margenInst = Math.max(0, topePorInst - yaAsignadoInst);
                    const margen = Math.min(margenInst, capitalRestante);
                    if (margen > 0) {
                        slice.montoAsignado += margen;
                        capitalRestante -= margen;
                        asignadoPorInst.set(instId, yaAsignadoInst + margen);
                    }
                }
            }

            let rendPeriodoTotal = 0;
            let rendMensualTotal = 0;
            const desglosePorInst = [];

            subset.forEach(inst => {
                const montoInst = asignadoPorInst.get(inst.id) || 0;
                if (montoInst > 0) {
                    const sim = simularInversion(montoInst, plazoMeses, inst.esquema.tramos);
                    rendPeriodoTotal += sim.total_periodo;
                    rendMensualTotal += sim.total_mensual;

                    const tasaPond = montoInst > 0 ? (sim.total_mensual * 12 / montoInst) * 100 : 0;

                    desglosePorInst.push({
                        institucionId: inst.id,
                        nombre: inst.nombre,
                        tipo: inst.tipo,
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

            return {
                subset,
                desglosePorInst,
                capitalRestante,
                rendPeriodoTotal,
                rendMensualTotal
            };
        }

        let mejorResultado = null;

        if (K >= instValidas.length) {
            mejorResultado = optimizarAsignacionParaConjunto(instValidas);
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

            const combinaciones = obtenerCombinaciones(instValidas, K);
            let mejorRend = -1;

            for (const combo of combinaciones) {
                const res = optimizarAsignacionParaConjunto(combo);
                if (res.desglosePorInst.length === K && res.capitalRestante <= 0.01) {
                    if (res.rendPeriodoTotal > mejorRend) {
                        mejorRend = res.rendPeriodoTotal;
                        mejorResultado = res;
                    }
                }
            }

            if (!mejorResultado) {
                for (const combo of combinaciones) {
                    const res = optimizarAsignacionParaConjunto(combo);
                    if (res.rendPeriodoTotal > mejorRend) {
                        mejorRend = res.rendPeriodoTotal;
                        mejorResultado = res;
                    }
                }
            }
        }

        if (!mejorResultado) {
            mejorResultado = optimizarAsignacionParaConjunto(instValidas);
        }

        // Ordenar asignaciones por monto asignado descendente
        const asignacionesFinales = mejorResultado.desglosePorInst.sort((a, b) => b.inversionAsignada - a.inversionAsignada);

        const totalDistribuido = asignacionesFinales.reduce((sum, a) => sum + a.inversionAsignada, 0);
        const capitalSinDistribuir = Math.max(0, capital - totalDistribuido);
        const tasaEfectivaPonderada = capital > 0 ? (mejorResultado.rendMensualTotal * 12 / capital) * 100 : 0;

        // Restricciones relevantes de las instituciones asignadas
        const restriccionesRelevantes = [];
        asignacionesFinales.forEach(a => {
            const activas = a.restricciones.filter(r => r && r.activo !== 0 && r.activo !== false);
            activas.forEach(r => {
                restriccionesRelevantes.push({
                    institucionId: a.institucionId,
                    nombre: a.nombre,
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

        // Comparativa contra "Todo en una institución"
        let mejorIndividual = null;
        let mejorIndRend = -1;
        instValidas.forEach(inst => {
            const sim = simularInversion(capital, plazoMeses, inst.esquema.tramos);
            if (sim.total_periodo > mejorIndRend) {
                mejorIndRend = sim.total_periodo;
                mejorIndividual = {
                    institucionId: inst.id,
                    nombre: inst.nombre,
                    rendimientoPeriodo: sim.total_periodo,
                    rendimientoMensual: sim.total_mensual
                };
            }
        });

        const diferenciaPeriodo = mejorResultado.rendPeriodoTotal - (mejorIndividual ? mejorIndividual.rendimientoPeriodo : 0);
        const diferenciaMensual = mejorResultado.rendMensualTotal - (mejorIndividual ? mejorIndividual.rendimientoMensual : 0);

        // Explicación dinámica de la distribución
        const nombresUsadas = asignacionesFinales.map(a => a.nombre);
        let explicacion = '';
        if (asignacionesFinales.length === 1) {
            explicacion = `La estrategia asigna la totalidad del capital a ${asignacionesFinales[0].nombre} al ser la única institución disponible para esta simulación.`;
        } else {
            explicacion = `La estrategia distribuye el capital en ${asignacionesFinales.length} instituciones (${nombresUsadas.join(', ')}) aprovechando los tramos con mayor tasa de rendimiento, limitando la concentración al ${maxPct}% ($${formatMoneyInternal(topePorInst)}) por institución para diversificar el riesgo.`;
        }

        return {
            exito: true,
            mensajeError: null,
            inversionTotal: capital,
            meses: plazoMeses,
            numInstitucionesSolicitado: numInstituciones,
            numInstitucionesUtilizadas: asignacionesFinales.length,
            maxPorcentajePorInst: maxPct,
            topeMaximoPorInst: topePorInst,
            rendimientoPeriodoTotal: mejorResultado.rendPeriodoTotal,
            rendimientoMensualTotal: mejorResultado.rendMensualTotal,
            tasaEfectivaPonderada,
            capitalDistribuido: totalDistribuido,
            capitalSinDistribuir: capitalSinDistribuir,
            asignaciones: asignacionesFinales,
            restriccionesRelevantes,
            concentracion,
            explicacion,
            comparativa: {
                mejorIndividual,
                diversificada: {
                    numInstituciones: asignacionesFinales.length,
                    rendimientoPeriodo: mejorResultado.rendPeriodoTotal,
                    rendimientoMensual: mejorResultado.rendMensualTotal
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
        calcularMejorInversionDiversificada
    };
}));
