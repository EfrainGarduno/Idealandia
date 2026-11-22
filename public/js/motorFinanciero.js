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

    return {
        distribuirInversionEnTramos,
        simularInversion,
        validarTramos
    };
}));
