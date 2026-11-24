/**
 * simuladorFinanciero.js
 * Controlador de interfaz para el Simulador de Inversiones (Idealandia)
 * Conecta los catálogos dinámicos de la BD con el motor matemático y la tabla responsiva.
 */

(function () {
    'use strict';

    let catalogoInstituciones = [];
    let catalogoEstrategias = [];
    let institucionesSeleccionadas = new Set();
    let fechaConsultaActual = new Date().toISOString().slice(0, 10);
    let estrategiaActual = 'individual'; // 'individual' | 'maximo_rendimiento' | 'equilibrada' | 'conservadora'
    let ultimaEstrategiaDiversificada = null;

    // Estado de visibilidad de columnas opcionales (Condiciones y Restricciones)
    let colCondicionesVisible = true;
    let colRestriccionesVisible = true;

    // Estado reactivo en memoria para simulación personalizada por fila (NO PERSISTE EN BD)
    const valoresOriginalesPorInst = new Map(); // id -> { tasa, inv1, inv2, meses }
    const valoresPersonalizadosPorInst = new Map(); // id -> { tasa, inv1, inv2, meses, isModified }
    const resultadosCalculadosPorInst = new Map(); // id -> { total_mensual, total_periodo, rend1, rend2 }

    /**
     * Parsea de forma robusta el valor numérico del input de inversión global.
     * Soporta valores formateados con comas (ej. $10,000,000 -> 10000000).
     */
    function parseInversionGlobal() {
        const input = document.getElementById('simulador-inversion-global');
        if (!input) return 40000;
        const clean = String(input.value || '').replace(/[^0-9.]/g, '');
        const num = parseFloat(clean);
        return isNaN(num) ? 0 : Math.max(0, num);
    }

    /**
     * Formatea el campo de Inversión Total con comas para facilitar su lectura en cantidades grandes.
     */
    function formatearInversionGlobal() {
        const input = document.getElementById('simulador-inversion-global');
        if (!input) return;
        const val = parseInversionGlobal();
        if (val > 0) {
            input.value = Number(val).toLocaleString('es-MX', { maximumFractionDigits: 2 });
        }
    }

    /**
     * Escapa caracteres especiales HTML para renderizado seguro.
     */
    function escapeHTML(str) {
        if (!str) return '';
        return String(str).replace(/[&<>'"]/g,
            tag => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                "'": '&#39;',
                '"': '&quot;'
            }[tag] || tag)
        );
    }

    /**
     * Formatea un número como moneda mexicana ($1,234.56).
     */
    function formatMoney(amount) {
        if (amount === null || amount === undefined || isNaN(amount)) return '—';
        return '$' + Number(amount).toLocaleString('es-MX', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    /**
     * Formatea un porcentaje (13.00%).
     */
    function formatPercent(pct) {
        if (pct === null || pct === undefined || isNaN(pct)) return '—';
        return Number(pct).toLocaleString('es-MX', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }) + '%';
    }

    /**
     * Renderiza las restricciones de forma compacta y legible en varias líneas.
     */
    function renderizarRestriccionesHtml(restricciones) {
        const activas = Array.isArray(restricciones)
            ? restricciones.filter(r => r && r.activo !== 0 && r.activo !== false)
            : [];

        if (activas.length === 0) {
            return '<span style="color: #94a3b8; font-style: italic; font-size: 0.82rem;">Ninguna</span>';
        }

        return `<div class="sim-cell-restricciones">` + activas.map(r => `
            <div class="sim-restriccion-item">
                <span class="sim-restriccion-bullet">•</span>
                <span>${escapeHTML(r.descripcion)}</span>
            </div>
        `).join('') + `</div>`;
    }

    /**
     * Inicializa el módulo del simulador de inversiones.
     */
    async function inicializarSimuladorFinanciero() {
        configurarEventosSimulador();
        await cargarCatalogoSimulador();
    }

    /**
     * Carga las instituciones activas y esquemas vigentes desde el backend.
     */
    async function cargarCatalogoSimulador(fecha = null) {
        const loadingEl = document.getElementById('simulador-loading');
        const tableContainer = document.getElementById('simulador-table-container');
        if (loadingEl) loadingEl.style.display = 'block';
        if (tableContainer) tableContainer.style.display = 'none';

        try {
            const queryFecha = fecha || fechaConsultaActual;
            const res = await fetch(`/api/finanzas/simulador?fecha=${encodeURIComponent(queryFecha)}`, {
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!res.ok) {
                throw new Error(`Error ${res.status} al cargar datos del simulador.`);
            }

            const data = await res.json();
            catalogoInstituciones = Array.isArray(data.instituciones) ? data.instituciones : [];
            catalogoEstrategias = Array.isArray(data.estrategias) ? data.estrategias : [];

            // Por defecto, todas las instituciones quedan seleccionadas
            institucionesSeleccionadas.clear();
            catalogoInstituciones.forEach(i => institucionesSeleccionadas.add(i.id));

            // Limpiar personalizaciones al cargar catálogo nuevo
            valoresPersonalizadosPorInst.clear();
            valoresOriginalesPorInst.clear();
            resultadosCalculadosPorInst.clear();

            renderizarTablaSimulador();
        } catch (error) {
            console.error('Error al cargar simulador financiero:', error);
            const errorEl = document.getElementById('simulador-error-msg');
            if (errorEl) {
                errorEl.textContent = 'No se pudieron cargar las instituciones financieras. Por favor intente más tarde.';
                errorEl.style.display = 'block';
            }
        } finally {
            if (loadingEl) loadingEl.style.display = 'none';
            if (tableContainer) tableContainer.style.display = 'block';
        }
    }

    /**
     * Configura los listeners de los controles principales.
     */
    function configurarEventosSimulador() {
        const inputInversion = document.getElementById('simulador-inversion-global');
        const inputMeses = document.getElementById('simulador-meses-global');
        const inputFecha = document.getElementById('simulador-fecha-consulta');
        const btnSeleccionarTodas = document.getElementById('simulador-btn-seleccionar-todas');
        const btnDeseleccionarTodas = document.getElementById('simulador-btn-deseleccionar-todas');

        if (inputInversion && !inputInversion.dataset.configured) {
            inputInversion.dataset.configured = 'true';
            inputInversion.addEventListener('input', () => recalcularSimulacion());
            inputInversion.addEventListener('blur', () => formatearInversionGlobal());
        }

        // Toggles para mostrar/ocultar a discreción las columnas Condiciones y Restricciones
        const btnColCond = document.getElementById('simulador-toggle-col-condiciones');
        const btnColRest = document.getElementById('simulador-toggle-col-restricciones');
        const tableContainer = document.getElementById('simulador-table-container');

        if (btnColCond && !btnColCond.dataset.configured) {
            btnColCond.dataset.configured = 'true';
            btnColCond.addEventListener('click', () => {
                colCondicionesVisible = !colCondicionesVisible;
                if (tableContainer) tableContainer.classList.toggle('hide-col-condiciones', !colCondicionesVisible);
                btnColCond.classList.toggle('active', colCondicionesVisible);
                btnColCond.classList.toggle('inactive', !colCondicionesVisible);
                btnColCond.innerHTML = colCondicionesVisible
                    ? '<i class="fas fa-eye"></i> Condiciones'
                    : '<i class="fas fa-eye-slash"></i> Condiciones';
            });
        }

        if (btnColRest && !btnColRest.dataset.configured) {
            btnColRest.dataset.configured = 'true';
            btnColRest.addEventListener('click', () => {
                colRestriccionesVisible = !colRestriccionesVisible;
                if (tableContainer) tableContainer.classList.toggle('hide-col-restricciones', !colRestriccionesVisible);
                btnColRest.classList.toggle('active', colRestriccionesVisible);
                btnColRest.classList.toggle('inactive', !colRestriccionesVisible);
                btnColRest.innerHTML = colRestriccionesVisible
                    ? '<i class="fas fa-eye"></i> Restricciones'
                    : '<i class="fas fa-eye-slash"></i> Restricciones';
            });
        }

        if (inputMeses && !inputMeses.dataset.configured) {
            inputMeses.dataset.configured = 'true';
            inputMeses.addEventListener('input', () => recalcularSimulacion());
        }

        if (inputFecha && !inputFecha.dataset.configured) {
            inputFecha.dataset.configured = 'true';
            inputFecha.value = fechaConsultaActual;
            inputFecha.addEventListener('change', (e) => {
                fechaConsultaActual = e.target.value;
                cargarCatalogoSimulador(fechaConsultaActual);
            });
        }

        if (btnSeleccionarTodas && !btnSeleccionarTodas.dataset.configured) {
            btnSeleccionarTodas.dataset.configured = 'true';
            btnSeleccionarTodas.addEventListener('click', () => {
                seleccionarTodas();
            });
        }

        if (btnDeseleccionarTodas && !btnDeseleccionarTodas.dataset.configured) {
            btnDeseleccionarTodas.dataset.configured = 'true';
            btnDeseleccionarTodas.addEventListener('click', () => {
                deseleccionarTodas();
            });
        }

        // Selector de estrategia (Mayor rendimiento vs Mejor inversión diversificada)
        const radiosEstrategia = document.querySelectorAll('input[name="simulador-estrategia"]');
        radiosEstrategia.forEach(radio => {
            if (!radio.dataset.configured) {
                radio.dataset.configured = 'true';
                radio.addEventListener('change', (e) => {
                    cambiarEstrategia(e.target.value);
                });
            }
        });

        // Parámetros de diversificación
        const selectNumInst = document.getElementById('simulador-num-instituciones');
        if (selectNumInst && !selectNumInst.dataset.configured) {
            selectNumInst.dataset.configured = 'true';
            selectNumInst.addEventListener('change', () => {
                if (estrategiaActual === 'diversificada') {
                    actualizarEstrategiaDiversificada();
                }
            });
        }

        const inputMaxPct = document.getElementById('simulador-max-porcentaje');
        if (inputMaxPct && !inputMaxPct.dataset.configured) {
            inputMaxPct.dataset.configured = 'true';
            inputMaxPct.addEventListener('input', () => {
                if (estrategiaActual === 'diversificada') {
                    actualizarEstrategiaDiversificada();
                }
            });
        }
    }

    /**
     * Renderiza la tabla completa del simulador con columnas editables y reactivas.
     * Nomenclatura aprobada (14 columnas):
     * Sel | Institución | Tipo | Condiciones | Restricciones | Inversión Base | Tasa % | Inversión 1 | Inversión 2 | Meses | Rend1 | Rend2 | Total mensual | Total periodo
     */
    function renderizarTablaSimulador() {
        const tbody = document.getElementById('simulador-tbody');
        if (!tbody) return;

        tbody.innerHTML = '';

        if (catalogoInstituciones.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="14" style="text-align: center; padding: 20px; color: #64748b;">
                        No hay instituciones financieras configuradas o vigentes para la fecha seleccionada.
                    </td>
                </tr>
            `;
            return;
        }

        const inputMeses = document.getElementById('simulador-meses-global');
        const capitalGlobal = parseInversionGlobal() || 40000;
        const mesesGlobal = parseInt(inputMeses ? inputMeses.value : 1, 10) || 1;

        catalogoInstituciones.forEach(inst => {
            const tr = document.createElement('tr');
            tr.id = `sim-row-${inst.id}`;
            tr.className = 'simulador-row';
            tr.dataset.instId = inst.id;

            const tramos = (inst.esquema && Array.isArray(inst.esquema.tramos)) ? inst.esquema.tramos : [];
            const tieneEsquema = tramos.length > 0;

            // Insignia de tipo: B = Banco, S = Sofipo, F = Fintech, O = Otro
            const tipoMap = {
                'B': { label: 'B', title: 'Banco', color: '#1d4ed8', bg: '#dbeafe' },
                'S': { label: 'S', title: 'Sofipo', color: '#047857', bg: '#d1fae5' },
                'F': { label: 'F', title: 'Fintech', color: '#7c3aed', bg: '#ede9fe' },
                'O': { label: 'O', title: 'Otro', color: '#b45309', bg: '#fef3c7' }
            };
            const tInfo = tipoMap[inst.tipo] || { label: inst.tipo || 'O', title: 'Otro', color: '#475569', bg: '#f1f5f9' };

            const isChecked = institucionesSeleccionadas.has(inst.id);
            if (!isChecked) {
                tr.style.display = 'none';
            } else {
                tr.classList.add('row-selected');
            }

            // Simulación base con parámetros globales
            const sim = tieneEsquema ? window.MotorFinanciero.simularInversion(capitalGlobal, mesesGlobal, tramos) : null;

            // Guardar valores originales de referencia para detectar si el usuario los modifica
            const origTasa = sim ? sim.tasa_base : 0;
            const origInv1 = sim ? sim.inversion_base : capitalGlobal;
            const origInv2 = sim ? sim.inversion_2 : 0;
            const origMeses = mesesGlobal;

            valoresOriginalesPorInst.set(inst.id, {
                tasa: origTasa,
                inv1: origInv1,
                inv2: origInv2,
                meses: origMeses
            });

            // Verificar si la fila ya contaba con personalización previa
            const custom = valoresPersonalizadosPorInst.get(inst.id);
            const isModified = !!(custom && custom.isModified);

            const curTasa = isModified ? custom.tasa : origTasa;
            const curInv1 = isModified ? custom.inv1 : origInv1;
            const curInv2 = isModified ? custom.inv2 : origInv2;
            const curMeses = isModified ? custom.meses : origMeses;

            // Rendimientos calculados
            const rend1 = (curInv1 * (curTasa / 100) / 12) * curMeses;
            const tasa2 = tramos.length >= 2 ? (parseFloat(tramos[1].tasa_anual) || 0) : 0;
            const rend2 = (curInv2 * (tasa2 / 100) / 12) * curMeses;

            let rendExtraMensual = 0;
            let rendExtraPeriodo = 0;
            if (tramos.length >= 3 && sim && Array.isArray(sim.tramos)) {
                for (let k = 2; k < sim.tramos.length; k++) {
                    rendExtraMensual += sim.tramos[k].rendimiento_mensual;
                    rendExtraPeriodo += (sim.tramos[k].rendimiento_mensual * curMeses);
                }
            }

            const totalMensual = (curInv1 * (curTasa / 100) / 12) + (curInv2 * (tasa2 / 100) / 12) + rendExtraMensual;
            const totalPeriodo = rend1 + rend2 + rendExtraPeriodo;

            resultadosCalculadosPorInst.set(inst.id, {
                total_mensual: totalMensual,
                total_periodo: totalPeriodo,
                rend1: rend1,
                rend2: rend2
            });

            if (isModified) {
                tr.classList.add('fila-simulacion-modificada');
                tr.title = 'Esta institución fue modificada manualmente por el usuario para esta simulación';
            }

            // Inversión Base muestra el límite base de condición de la institución (lo que antes era Monto 2)
            const valorInversionBaseCondicion = (sim && sim.monto_2 !== null) ? formatMoney(sim.monto_2) : '—';

            // HTML de fila principal
            tr.innerHTML = `
                <td style="text-align: center;">
                    <input type="checkbox" class="simulador-check-inst" data-inst-id="${inst.id}" ${isChecked ? 'checked' : ''} style="cursor: pointer; width: 18px; height: 18px;">
                </td>
                <td style="font-weight: 700; color: #1e293b;">
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 4px;">
                        <span>${inst.nombre}</span>
                        <button type="button" class="badge-sim-modificada btn-restablecer-fila" id="sim-badge-${inst.id}" data-inst-id="${inst.id}" style="${isModified ? 'display: inline-flex;' : 'display: none;'}" title="Hacer clic para restablecer los valores originales de la institución">
                            <i class="fas fa-undo-alt" style="font-size: 0.7rem;"></i> <span>Editado</span>
                        </button>
                    </div>
                    ${tramos.length >= 3 ? `<button type="button" class="btn-toggle-tramos" data-inst-id="${inst.id}" style="display: block; margin-top: 4px; font-size: 0.72rem; padding: 2px 6px; border: 1px solid #cbd5e1; border-radius: 4px; background: #f8fafc; color: #2563eb; cursor: pointer;"><i class="fas fa-layer-group"></i> Ver ${tramos.length} tramos</button>` : ''}
                </td>
                <td style="text-align: center;">
                    <span style="font-weight: 700; padding: 3px 8px; border-radius: 4px; background: ${tInfo.bg}; color: ${tInfo.color}; font-size: 0.85rem;" title="${tInfo.title}">
                        ${tInfo.label}
                    </span>
                </td>
                <!-- Condiciones financieras de tasa -->
                <td class="sim-col-condiciones" style="font-size: 0.85rem; color: #475569;">
                    ${inst.condiciones_resumen || (tieneEsquema ? inst.esquema.nombre_esquema : 'Sin condiciones activas')}
                </td>
                <!-- Restricciones (Requisitos independientes para el cliente) -->
                <td class="sim-col-restricciones">
                    ${renderizarRestriccionesHtml(inst.restricciones)}
                </td>
                <!-- Inversión Base (Límite base de condición de la institución) -->
                <td style="font-weight: 600; text-align: right; color: #334155;">
                    <span class="sim-val-inv-base">${valorInversionBaseCondicion}</span>
                </td>
                <!-- Tasa % (Editable por fila) -->
                <td style="text-align: right;">
                    <input type="number" step="0.01" min="0" max="100" class="sim-row-input sim-input-tasa" data-inst-id="${inst.id}" value="${curTasa.toFixed(2)}">
                </td>
                <!-- Inversión 1 (En lo que era Monto 2 va la inversión base y es editable, ampliado para hasta $10M+) -->
                <td class="sim-cell-input-highlight" style="background: #fffbeb; text-align: right;">
                    <input type="number" step="100" min="0" class="sim-row-input sim-input-inv1" data-inst-id="${inst.id}" value="${curInv1.toFixed(2)}">
                </td>
                <!-- Inversión 2 (Editable por fila, ampliado para hasta $10M+) -->
                <td class="sim-cell-input-highlight" style="background: #fffbeb; text-align: right;">
                    <input type="number" step="100" min="0" class="sim-row-input sim-input-inv2" data-inst-id="${inst.id}" value="${curInv2.toFixed(2)}">
                </td>
                <!-- Meses (Editable por fila) -->
                <td style="text-align: center;">
                    <input type="number" step="1" min="1" max="120" class="sim-row-input sim-input-meses" data-inst-id="${inst.id}" value="${curMeses}">
                </td>
                <!-- Rend1 -->
                <td style="text-align: right; color: #047857; font-weight: 600;">
                    <span class="sim-val-rend1">${formatMoney(rend1)}</span>
                </td>
                <!-- Rend2 -->
                <td style="text-align: right; color: #047857; font-weight: 600;">
                    <span class="sim-val-rend2">${formatMoney(rend2)}</span>
                </td>
                <!-- Total mensual -->
                <td style="text-align: right; font-weight: 700; color: #1e3a8a; background: #f0fdf4;">
                    <span class="sim-val-total-mensual">${formatMoney(totalMensual)}</span>
                </td>
                <!-- Total periodo -->
                <td style="text-align: right; font-weight: 800; color: #166534; background: #dcfce7;">
                    <span class="sim-val-total-periodo">${formatMoney(totalPeriodo)}</span>
                </td>
            `;

            tbody.appendChild(tr);

            // Subfila acordeón para instituciones con 3 o más tramos
            if (tramos.length >= 3) {
                const subTr = document.createElement('tr');
                subTr.id = `sim-subrow-${inst.id}`;
                subTr.className = 'simulador-subrow';
                subTr.style.display = 'none';
                subTr.innerHTML = `
                    <td colspan="14" style="background: #f8fafc; padding: 12px 20px; border-left: 4px solid #2563eb;">
                        <div style="font-weight: 700; color: #1e293b; margin-bottom: 8px; font-size: 0.9rem;">
                            <i class="fas fa-layer-group" style="color: #2563eb;"></i> Desglose Detallado de Tramos (${inst.nombre})
                        </div>
                        <div class="table-responsive">
                            <table style="width: 100%; font-size: 0.85rem; border-collapse: collapse; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px;">
                                <thead>
                                    <tr style="background: #f1f5f9; color: #475569; text-align: left;">
                                        <th style="padding: 6px 10px;">Tramo</th>
                                        <th style="padding: 6px 10px;">Rango de Saldo</th>
                                        <th style="padding: 6px 10px; text-align: right;">Tasa Anual</th>
                                        <th style="padding: 6px 10px; text-align: right;">Monto Asignado</th>
                                        <th style="padding: 6px 10px; text-align: right;">Rend. Mensual</th>
                                        <th style="padding: 6px 10px; text-align: right;">Rend. Periodo</th>
                                    </tr>
                                </thead>
                                <tbody id="sim-subrow-tbody-${inst.id}">
                                    ${renderizarSubTramosHtml(sim)}
                                </tbody>
                            </table>
                        </div>
                    </td>
                `;
                tbody.appendChild(subTr);
            }
        });

        // Fila de estado vacío si no hay instituciones seleccionadas
        const emptyTr = document.createElement('tr');
        emptyTr.id = 'sim-row-vacia';
        emptyTr.style.display = (institucionesSeleccionadas.size === 0) ? '' : 'none';
        emptyTr.innerHTML = `
            <td colspan="14" style="text-align: center; padding: 32px 20px; color: #64748b; font-size: 0.95rem; background: #fafafa;">
                <div style="font-weight: 600; color: #334155; margin-bottom: 6px;">
                    <i class="fas fa-filter" style="color: #64748b; margin-right: 6px;"></i> No hay instituciones seleccionadas en la tabla
                </div>
                <div style="font-size: 0.85rem; color: #64748b;">
                    Selecciona al menos una institución desde <strong>Instituciones disponibles</strong> o pulsa <strong>Todas</strong> para comparar rendimientos.
                </div>
            </td>
        `;
        tbody.appendChild(emptyTr);

        // Configurar listener para inputs editables por fila (reactivo en tiempo real)
        tbody.querySelectorAll('.sim-row-input').forEach(input => {
            input.addEventListener('input', (e) => {
                const tr = e.target.closest('tr');
                if (!tr) return;
                const instId = parseInt(tr.dataset.instId, 10);
                recalcularFila(instId, tr);
            });
        });

        // Configurar listener para botón interactivo de restablecer fila
        tbody.querySelectorAll('.btn-restablecer-fila').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const instId = parseInt(e.currentTarget.dataset.instId, 10);
                restablecerFilaOriginal(instId);
            });
        });

        // Configurar listener para checkboxes de selección
        document.querySelectorAll('.simulador-check-inst').forEach(chk => {
            chk.addEventListener('change', (e) => {
                const id = parseInt(e.target.dataset.instId, 10);
                if (e.target.checked) {
                    agregarInstitucion(id);
                } else {
                    quitarInstitucion(id);
                }
            });
        });

        // Configurar listener para botones de expandir tramos
        document.querySelectorAll('.btn-toggle-tramos').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const instId = e.currentTarget.dataset.instId;
                const subrow = document.getElementById(`sim-subrow-${instId}`);
                if (subrow) {
                    const isVisible = subrow.style.display !== 'none';
                    subrow.style.display = isVisible ? 'none' : 'table-row';
                    e.currentTarget.innerHTML = isVisible 
                        ? `<i class="fas fa-layer-group"></i> Ver ${catalogoInstituciones.find(i => i.id == instId)?.esquema?.tramos?.length || 3} tramos`
                        : `<i class="fas fa-chevron-up"></i> Ocultar desglose`;
                }
            });
        });

        actualizarEstiloFilasSeleccionadas();
    }

    /**
     * Restablece una fila modificada a sus valores originales y recalcula de inmediato.
     * Acción 100% en memoria para la simulación: no toca la base de datos ni tasas de la institución.
     */
    function restablecerFilaOriginal(instId) {
        const tr = document.getElementById(`sim-row-${instId}`);
        if (!tr) return;

        const orig = valoresOriginalesPorInst.get(instId);
        if (!orig) return;

        // Restaurar valores en los inputs
        const inputTasa = tr.querySelector('.sim-input-tasa');
        const inputInv1 = tr.querySelector('.sim-input-inv1');
        const inputInv2 = tr.querySelector('.sim-input-inv2');
        const inputMeses = tr.querySelector('.sim-input-meses');

        if (inputTasa) inputTasa.value = orig.tasa.toFixed(2);
        if (inputInv1) inputInv1.value = orig.inv1.toFixed(2);
        if (inputInv2) inputInv2.value = orig.inv2.toFixed(2);
        if (inputMeses) inputMeses.value = orig.meses;

        // Eliminar personalización
        valoresPersonalizadosPorInst.delete(instId);

        // Recalcular y remover resaltados visuales
        recalcularFila(instId, tr);
    }

    /**
     * Recalcula reactivamente una sola fila cuando el usuario edita Tasa %, Inversión 1, Inversión 2 o Meses.
     * Mantiene los valores de la BD intactos y resalta la fila si los valores difieren de los originales.
     */
    function recalcularFila(instId, tr) {
        const inst = catalogoInstituciones.find(i => i.id === instId);
        if (!inst) return;
        const tramos = (inst.esquema && Array.isArray(inst.esquema.tramos)) ? inst.esquema.tramos : [];

        const inputTasa = tr.querySelector('.sim-input-tasa');
        const inputInv1 = tr.querySelector('.sim-input-inv1');
        const inputInv2 = tr.querySelector('.sim-input-inv2');
        const inputMeses = tr.querySelector('.sim-input-meses');

        const curTasa = parseFloat(inputTasa ? inputTasa.value : 0) || 0;
        const curInv1 = parseFloat(inputInv1 ? inputInv1.value : 0) || 0;
        const curInv2 = parseFloat(inputInv2 ? inputInv2.value : 0) || 0;
        const curMeses = parseInt(inputMeses ? inputMeses.value : 1, 10) || 1;

        const orig = valoresOriginalesPorInst.get(instId) || { tasa: 0, inv1: 0, inv2: 0, meses: 1 };

        // Comparar contra valores originales (tolerancia numérica a centavos)
        const isModified = (
            Math.abs(curTasa - orig.tasa) > 0.001 ||
            Math.abs(curInv1 - orig.inv1) > 0.001 ||
            Math.abs(curInv2 - orig.inv2) > 0.001 ||
            Math.abs(curMeses - orig.meses) > 0.001
        );

        const badge = tr.querySelector(`#sim-badge-${instId}`);

        if (isModified) {
            tr.classList.add('fila-simulacion-modificada');
            tr.title = 'Esta institución fue modificada manualmente por el usuario para esta simulación';
            if (badge) badge.style.display = 'inline-flex';
            valoresPersonalizadosPorInst.set(instId, {
                tasa: curTasa,
                inv1: curInv1,
                inv2: curInv2,
                meses: curMeses,
                isModified: true
            });
        } else {
            tr.classList.remove('fila-simulacion-modificada');
            tr.title = '';
            if (badge) badge.style.display = 'none';
            valoresPersonalizadosPorInst.delete(instId);
        }

        // Fórmulas de rendimiento reactivas:
        // Rend1 = Inversión 1 * (Tasa 1 / 100 / 12) * Meses
        const rend1 = (curInv1 * (curTasa / 100) / 12) * curMeses;

        // Rend2 = Inversión 2 * (Tasa 2 / 100 / 12) * Meses
        const tasa2 = tramos.length >= 2 ? (parseFloat(tramos[1].tasa_anual) || 0) : 0;
        const rend2 = (curInv2 * (tasa2 / 100) / 12) * curMeses;

        // Rendimiento de tramos adicionales (si existen tramos >= 3)
        let rendExtraMensual = 0;
        let rendExtraPeriodo = 0;
        if (tramos.length >= 3) {
            const cap = (curInv1 + curInv2) > 0 ? (curInv1 + curInv2) : parseInversionGlobal();
            const simTemp = window.MotorFinanciero.simularInversion(cap, curMeses, tramos);
            if (simTemp && Array.isArray(simTemp.tramos)) {
                for (let k = 2; k < simTemp.tramos.length; k++) {
                    rendExtraMensual += simTemp.tramos[k].rendimiento_mensual;
                    rendExtraPeriodo += (simTemp.tramos[k].rendimiento_mensual * curMeses);
                }
            }
        }

        const totalMensual = (curInv1 * (curTasa / 100) / 12) + (curInv2 * (tasa2 / 100) / 12) + rendExtraMensual;
        const totalPeriodo = rend1 + rend2 + rendExtraPeriodo;

        const elRend1 = tr.querySelector('.sim-val-rend1');
        const elRend2 = tr.querySelector('.sim-val-rend2');
        const elTotM = tr.querySelector('.sim-val-total-mensual');
        const elTotP = tr.querySelector('.sim-val-total-periodo');

        if (elRend1) elRend1.textContent = formatMoney(rend1);
        if (elRend2) elRend2.textContent = formatMoney(rend2);
        if (elTotM) elTotM.textContent = formatMoney(totalMensual);
        if (elTotP) elTotP.textContent = formatMoney(totalPeriodo);

        resultadosCalculadosPorInst.set(instId, {
            total_mensual: totalMensual,
            total_periodo: totalPeriodo,
            rend1: rend1,
            rend2: rend2
        });

        actualizarResumenComparativo();
    }

    function renderizarSubTramosHtml(sim) {
        if (!sim || !Array.isArray(sim.tramos)) return '<tr><td colspan="6">Sin datos</td></tr>';
        return sim.tramos.map(t => `
            <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 6px 10px; font-weight: 600;">Tramo ${t.numero_tramo}</td>
                <td style="padding: 6px 10px;">${formatMoney(t.limite_inferior)} a ${t.limite_superior !== null ? formatMoney(t.limite_superior) : 'Sin límite (+∞)'}</td>
                <td style="padding: 6px 10px; text-align: right; font-weight: 700; color: #2563eb;">${formatPercent(t.tasa_anual)}</td>
                <td style="padding: 6px 10px; text-align: right; font-weight: 600; background: #fffbeb;">${formatMoney(t.monto_en_tramo)}</td>
                <td style="padding: 6px 10px; text-align: right; color: #047857;">${formatMoney(t.rendimiento_mensual)}</td>
                <td style="padding: 6px 10px; text-align: right; font-weight: 700; color: #166534;">${formatMoney(t.rendimiento_periodo)}</td>
            </tr>
        `).join('');
    }

    /**
     * Recalcula reactivamente los rendimientos de todas las filas según los inputs globales.
     * Si una fila no está modificada por el usuario, actualiza sus inputs y resultados.
     * Si una fila está modificada, mantiene sus valores personalizados y recalcula su estado.
     */
    function recalcularSimulacion() {
        const inputMeses = document.getElementById('simulador-meses-global');
        const capitalGlobal = parseInversionGlobal();
        const mesesGlobal = parseInt(inputMeses ? inputMeses.value : 1, 10) || 1;

        catalogoInstituciones.forEach(inst => {
            const tr = document.getElementById(`sim-row-${inst.id}`);
            if (!tr) return;

            const tramos = (inst.esquema && Array.isArray(inst.esquema.tramos)) ? inst.esquema.tramos : [];
            if (tramos.length === 0) return;

            const sim = window.MotorFinanciero.simularInversion(capitalGlobal, mesesGlobal, tramos);

            const newOrigTasa = sim ? sim.tasa_base : 0;
            const newOrigInv1 = sim ? sim.inversion_base : capitalGlobal;
            const newOrigInv2 = sim ? sim.inversion_2 : 0;
            const newOrigMeses = mesesGlobal;

            valoresOriginalesPorInst.set(inst.id, {
                tasa: newOrigTasa,
                inv1: newOrigInv1,
                inv2: newOrigInv2,
                meses: newOrigMeses
            });

            // Actualizar Inversión Base (límite base de condición en BD, antes Monto 2)
            const elInvBase = tr.querySelector('.sim-val-inv-base');
            if (elInvBase) {
                elInvBase.textContent = (sim && sim.monto_2 !== null) ? formatMoney(sim.monto_2) : '—';
            }

            const isPersonalizado = valoresPersonalizadosPorInst.has(inst.id);

            if (!isPersonalizado) {
                const inputTasa = tr.querySelector('.sim-input-tasa');
                const inputInv1 = tr.querySelector('.sim-input-inv1');
                const inputInv2 = tr.querySelector('.sim-input-inv2');
                const inputMeses = tr.querySelector('.sim-input-meses');

                if (inputTasa) inputTasa.value = newOrigTasa.toFixed(2);
                if (inputInv1) inputInv1.value = newOrigInv1.toFixed(2);
                if (inputInv2) inputInv2.value = newOrigInv2.toFixed(2);
                if (inputMeses) inputMeses.value = newOrigMeses;

                const elRend1 = tr.querySelector('.sim-val-rend1');
                const elRend2 = tr.querySelector('.sim-val-rend2');
                const elTotalMensual = tr.querySelector('.sim-val-total-mensual');
                const elTotalPeriodo = tr.querySelector('.sim-val-total-periodo');

                if (elRend1) elRend1.textContent = formatMoney(sim.rend1);
                if (elRend2) elRend2.textContent = formatMoney(sim.rend2);
                if (elTotalMensual) elTotalMensual.textContent = formatMoney(sim.total_mensual);
                if (elTotalPeriodo) elTotalPeriodo.textContent = formatMoney(sim.total_periodo);

                resultadosCalculadosPorInst.set(inst.id, {
                    total_mensual: sim.total_mensual,
                    total_periodo: sim.total_periodo,
                    rend1: sim.rend1,
                    rend2: sim.rend2
                });

                // Actualizar subfila de N tramos si existe
                const subrowTbody = document.getElementById(`sim-subrow-tbody-${inst.id}`);
                if (subrowTbody) {
                    subrowTbody.innerHTML = renderizarSubTramosHtml(sim);
                }
            } else {
                recalcularFila(inst.id, tr);
            }
        });

        actualizarVisibilidadEstadoVacio();
        actualizarPanelDisponibles();
        actualizarResumenSegunEstrategia();
    }

    /**
     * Quita una institución de la simulación activa:
     * - Guarda cualquier modificación manual pendiente en memoria
     * - Oculta la fila y subfila inmediatamente de la tabla (desaparece por completo)
     * - Actualiza el panel de disponibles para permitir volver a agregarla en cualquier momento
     * - Recalcula el indicador de mayor rendimiento excluyendo esta institución
     * - No toca la base de datos (estado 100% de la sesión del usuario)
     */
    function quitarInstitucion(instId) {
        const tr = document.getElementById(`sim-row-${instId}`);
        if (tr) {
            // Guardar cualquier valor editado antes de ocultar
            const inputTasa = tr.querySelector('.sim-input-tasa');
            const inputInv1 = tr.querySelector('.sim-input-inv1');
            const inputInv2 = tr.querySelector('.sim-input-inv2');
            const inputMeses = tr.querySelector('.sim-input-meses');
            const orig = valoresOriginalesPorInst.get(instId) || { tasa: 0, inv1: 0, inv2: 0, meses: 1 };

            if (inputTasa && inputInv1 && inputInv2 && inputMeses) {
                const curTasa = parseFloat(inputTasa.value) || 0;
                const curInv1 = parseFloat(inputInv1.value) || 0;
                const curInv2 = parseFloat(inputInv2.value) || 0;
                const curMeses = parseInt(inputMeses.value, 10) || 1;

                const isModified = (
                    Math.abs(curTasa - orig.tasa) > 0.001 ||
                    Math.abs(curInv1 - orig.inv1) > 0.001 ||
                    Math.abs(curInv2 - orig.inv2) > 0.001 ||
                    Math.abs(curMeses - orig.meses) > 0.001
                );

                if (isModified) {
                    valoresPersonalizadosPorInst.set(instId, {
                        tasa: curTasa,
                        inv1: curInv1,
                        inv2: curInv2,
                        meses: curMeses,
                        isModified: true
                    });
                }
            }

            tr.style.display = 'none';
            tr.classList.remove('row-selected');
            const chk = tr.querySelector('.simulador-check-inst');
            if (chk) chk.checked = false;
        }

        const subTr = document.getElementById(`sim-subrow-${instId}`);
        if (subTr) subTr.style.display = 'none';

        institucionesSeleccionadas.delete(instId);

        actualizarVisibilidadEstadoVacio();
        actualizarPanelDisponibles();
        actualizarResumenSegunEstrategia();
    }

    /**
     * Vuelve a agregar una institución deseleccionada a la tabla:
     * - Reaparece en su posición normal según el orden configurado
     * - Checkbox marcado como seleccionado
     * - Recalcula: Inversión Base, Tasa, Inv1, Inv2, Meses, Rend1, Rend2, Total mensual, Total periodo
     * - Conserva modificaciones manuales previas (Tasa, Inv1, Inv2, Meses) y estado "Editado"
     * - Si no tenía modificaciones, usa los parámetros globales actuales
     * - Actualiza el panel de disponibles y el indicador de Mayor Rendimiento
     */
    function agregarInstitucion(instId) {
        institucionesSeleccionadas.add(instId);
        const tr = document.getElementById(`sim-row-${instId}`);
        const inst = catalogoInstituciones.find(i => i.id === instId);

        if (tr && inst) {
            tr.style.display = '';
            tr.classList.add('row-selected');
            const chk = tr.querySelector('.simulador-check-inst');
            if (chk) chk.checked = true;

            const tramos = (inst.esquema && Array.isArray(inst.esquema.tramos)) ? inst.esquema.tramos : [];
            const inputMeses = document.getElementById('simulador-meses-global');
            const capitalGlobal = parseInversionGlobal() || 40000;
            const mesesGlobal = parseInt(inputMeses ? inputMeses.value : 1, 10) || 1;

            const sim = tramos.length > 0 ? window.MotorFinanciero.simularInversion(capitalGlobal, mesesGlobal, tramos) : null;

            const newOrigTasa = sim ? sim.tasa_base : 0;
            const newOrigInv1 = sim ? sim.inversion_base : capitalGlobal;
            const newOrigInv2 = sim ? sim.inversion_2 : 0;
            const newOrigMeses = mesesGlobal;

            valoresOriginalesPorInst.set(inst.id, {
                tasa: newOrigTasa,
                inv1: newOrigInv1,
                inv2: newOrigInv2,
                meses: newOrigMeses
            });

            // Actualizar Inversión Base (límite base de condición en BD)
            const elInvBase = tr.querySelector('.sim-val-inv-base');
            if (elInvBase) {
                elInvBase.textContent = (sim && sim.monto_2 !== null) ? formatMoney(sim.monto_2) : '—';
            }

            const custom = valoresPersonalizadosPorInst.get(inst.id);
            const isModified = !!(custom && custom.isModified);

            const inputTasa = tr.querySelector('.sim-input-tasa');
            const inputInv1 = tr.querySelector('.sim-input-inv1');
            const inputInv2 = tr.querySelector('.sim-input-inv2');
            const inputMesesRow = tr.querySelector('.sim-input-meses');
            const badge = tr.querySelector(`#sim-badge-${inst.id}`);

            if (isModified) {
                if (inputTasa) inputTasa.value = custom.tasa.toFixed(2);
                if (inputInv1) inputInv1.value = custom.inv1.toFixed(2);
                if (inputInv2) inputInv2.value = custom.inv2.toFixed(2);
                if (inputMesesRow) inputMesesRow.value = custom.meses;
                tr.classList.add('fila-simulacion-modificada');
                if (badge) badge.style.display = 'inline-flex';
                recalcularFila(inst.id, tr);
            } else {
                if (inputTasa) inputTasa.value = newOrigTasa.toFixed(2);
                if (inputInv1) inputInv1.value = newOrigInv1.toFixed(2);
                if (inputInv2) inputInv2.value = newOrigInv2.toFixed(2);
                if (inputMesesRow) inputMesesRow.value = newOrigMeses;
                tr.classList.remove('fila-simulacion-modificada');
                if (badge) badge.style.display = 'none';

                const rend1 = (newOrigInv1 * (newOrigTasa / 100) / 12) * newOrigMeses;
                const tasa2 = tramos.length >= 2 ? (parseFloat(tramos[1].tasa_anual) || 0) : 0;
                const rend2 = (newOrigInv2 * (tasa2 / 100) / 12) * newOrigMeses;

                let rendExtraMensual = 0;
                let rendExtraPeriodo = 0;
                if (tramos.length >= 3 && sim && Array.isArray(sim.tramos)) {
                    for (let k = 2; k < sim.tramos.length; k++) {
                        rendExtraMensual += sim.tramos[k].rendimiento_mensual;
                        rendExtraPeriodo += (sim.tramos[k].rendimiento_mensual * newOrigMeses);
                    }
                }

                const totalMensual = (newOrigInv1 * (newOrigTasa / 100) / 12) + (newOrigInv2 * (tasa2 / 100) / 12) + rendExtraMensual;
                const totalPeriodo = rend1 + rend2 + rendExtraPeriodo;

                const elRend1 = tr.querySelector('.sim-val-rend1');
                const elRend2 = tr.querySelector('.sim-val-rend2');
                const elTotM = tr.querySelector('.sim-val-total-mensual');
                const elTotP = tr.querySelector('.sim-val-total-periodo');

                if (elRend1) elRend1.textContent = formatMoney(rend1);
                if (elRend2) elRend2.textContent = formatMoney(rend2);
                if (elTotM) elTotM.textContent = formatMoney(totalMensual);
                if (elTotP) elTotP.textContent = formatMoney(totalPeriodo);

                resultadosCalculadosPorInst.set(inst.id, {
                    total_mensual: totalMensual,
                    total_periodo: totalPeriodo,
                    rend1: rend1,
                    rend2: rend2
                });

                const subrowTbody = document.getElementById(`sim-subrow-tbody-${inst.id}`);
                if (subrowTbody && sim) {
                    subrowTbody.innerHTML = renderizarSubTramosHtml(sim);
                }
            }
        }

        actualizarVisibilidadEstadoVacio();
        actualizarPanelDisponibles();
        actualizarResumenSegunEstrategia();
    }

    /**
     * Selecciona todas las instituciones disponibles:
     * - Muestra todos los renglones en la tabla
     * - Marca todos los checkboxes
     * - Recalcula resultados respetando modificaciones manuales previas
     */
    function seleccionarTodas() {
        catalogoInstituciones.forEach(inst => {
            institucionesSeleccionadas.add(inst.id);
            const tr = document.getElementById(`sim-row-${inst.id}`);
            if (tr) {
                tr.style.display = '';
                tr.classList.add('row-selected');
                const chk = tr.querySelector('.simulador-check-inst');
                if (chk) chk.checked = true;
            }
        });
        recalcularSimulacion();
        actualizarVisibilidadEstadoVacio();
        actualizarPanelDisponibles();
        actualizarResumenSegunEstrategia();
    }

    /**
     * Deselecciona todas las instituciones:
     * - Oculta todos los renglones de la tabla
     * - Desmarca todos los checkboxes
     * - Conserva las instituciones disponibles para volver a agregarlas
     * - Preserva cualquier modificación manual previa
     */
    function deseleccionarTodas() {
        catalogoInstituciones.forEach(inst => {
            const tr = document.getElementById(`sim-row-${inst.id}`);
            if (tr) {
                const inputTasa = tr.querySelector('.sim-input-tasa');
                const inputInv1 = tr.querySelector('.sim-input-inv1');
                const inputInv2 = tr.querySelector('.sim-input-inv2');
                const inputMeses = tr.querySelector('.sim-input-meses');
                const orig = valoresOriginalesPorInst.get(inst.id) || { tasa: 0, inv1: 0, inv2: 0, meses: 1 };

                if (inputTasa && inputInv1 && inputInv2 && inputMeses) {
                    const curTasa = parseFloat(inputTasa.value) || 0;
                    const curInv1 = parseFloat(inputInv1.value) || 0;
                    const curInv2 = parseFloat(inputInv2.value) || 0;
                    const curMeses = parseInt(inputMeses.value, 10) || 1;

                    const isModified = (
                        Math.abs(curTasa - orig.tasa) > 0.001 ||
                        Math.abs(curInv1 - orig.inv1) > 0.001 ||
                        Math.abs(curInv2 - orig.inv2) > 0.001 ||
                        Math.abs(curMeses - orig.meses) > 0.001
                    );

                    if (isModified) {
                        valoresPersonalizadosPorInst.set(inst.id, {
                            tasa: curTasa,
                            inv1: curInv1,
                            inv2: curInv2,
                            meses: curMeses,
                            isModified: true
                        });
                    }
                }
                tr.style.display = 'none';
                tr.classList.remove('row-selected');
                const chk = tr.querySelector('.simulador-check-inst');
                if (chk) chk.checked = false;
            }
            const subTr = document.getElementById(`sim-subrow-${inst.id}`);
            if (subTr) subTr.style.display = 'none';
        });

        institucionesSeleccionadas.clear();
        actualizarVisibilidadEstadoVacio();
        actualizarPanelDisponibles();
        actualizarResumenSegunEstrategia();
    }

    /**
     * Alterna la visibilidad del mensaje de estado vacío en la tabla
     */
    function actualizarVisibilidadEstadoVacio() {
        const emptyTr = document.getElementById('sim-row-vacia');
        if (emptyTr) {
            emptyTr.style.display = (institucionesSeleccionadas.size === 0) ? '' : 'none';
        }
    }

    /**
     * Renderiza la zona/control de instituciones disponibles para recuperar las deseleccionadas.
     * Muestra botones estilo chip interactivos [ + Institución ] y dropdown select.
     */
    function actualizarPanelDisponibles() {
        const container = document.getElementById('simulador-disponibles-container');
        if (!container) return;

        const disponibles = catalogoInstituciones.filter(i => !institucionesSeleccionadas.has(i.id));

        if (disponibles.length === 0) {
            container.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
                    <div style="font-size: 0.86rem; color: #047857; display: flex; align-items: center; gap: 6px; font-weight: 600;">
                        <i class="fas fa-check-circle" style="color: #10b981;"></i>
                        <span>Todas las instituciones financieras activas están seleccionadas en la simulación.</span>
                    </div>
                    <div style="font-size: 0.8rem; color: #64748b;">
                        Deselecciona la casilla de cualquier institución en la tabla para excluirla de la comparación.
                    </div>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 10px;">
                <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-weight: 700; font-size: 0.88rem; color: #1e293b;">
                            <i class="fas fa-layer-group" style="color: #2563eb;"></i> Instituciones disponibles (${disponibles.length}):
                        </span>
                        <span style="font-size: 0.78rem; color: #64748b;">(Haz clic para volver a incorporarla a la tabla)</span>
                    </div>
                    <div>
                        <select id="simulador-select-agregar" class="form-select" style="font-size: 0.82rem; padding: 4px 10px; border-radius: 6px; border: 1px solid #cbd5e1; background: #ffffff; color: #1e293b; cursor: pointer;">
                            <option value="">Agregar institución ▾</option>
                            ${disponibles.map(inst => `
                                <option value="${inst.id}">+ ${escapeHTML(inst.nombre)}</option>
                            `).join('')}
                        </select>
                    </div>
                </div>
                <div id="simulador-chips-disponibles" style="display: flex; flex-wrap: wrap; gap: 8px;">
                    ${disponibles.map(inst => `
                        <button type="button" class="btn-agregar-inst" id="sim-chip-add-${inst.id}" data-inst-id="${inst.id}" 
                                style="display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; font-size: 0.84rem; font-weight: 600; color: #1d4ed8; background: #eff6ff; border: 1px solid #93c5fd; border-radius: 20px; cursor: pointer; transition: all 0.15s ease-in-out; box-shadow: 0 1px 2px rgba(0,0,0,0.05);"
                                onmouseover="this.style.background='#dbeafe'; this.style.borderColor='#60a5fa';"
                                onmouseout="this.style.background='#eff6ff'; this.style.borderColor='#93c5fd';"
                                title="Volver a agregar ${escapeHTML(inst.nombre)} a la simulación">
                            <i class="fas fa-plus" style="font-size: 0.72rem;"></i>
                            <span>${escapeHTML(inst.nombre)}</span>
                        </button>
                    `).join('')}
                </div>
            </div>
        `;

        container.querySelectorAll('.btn-agregar-inst').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const instId = parseInt(e.currentTarget.dataset.instId, 10);
                agregarInstitucion(instId);
            });
        });

        const selectEl = document.getElementById('simulador-select-agregar');
        if (selectEl) {
            selectEl.addEventListener('change', (e) => {
                const instId = parseInt(e.target.value, 10);
                if (instId) {
                    agregarInstitucion(instId);
                }
            });
        }
    }

    /**
     * Resalta visualmente las filas seleccionadas y oculta por completo las deseleccionadas.
     */
    function actualizarEstiloFilasSeleccionadas() {
        catalogoInstituciones.forEach(inst => {
            const tr = document.getElementById(`sim-row-${inst.id}`);
            if (!tr) return;
            const isSelected = institucionesSeleccionadas.has(inst.id);
            const chk = tr.querySelector('.simulador-check-inst');
            if (chk) chk.checked = isSelected;

            if (isSelected) {
                tr.style.display = '';
                tr.classList.add('row-selected');
            } else {
                tr.style.display = 'none';
                tr.classList.remove('row-selected');
                const subTr = document.getElementById(`sim-subrow-${inst.id}`);
                if (subTr) subTr.style.display = 'none';
            }
        });

        actualizarVisibilidadEstadoVacio();
        actualizarPanelDisponibles();
        actualizarResumenSegunEstrategia();
    }

    function actualizarResumenComparativo() {
        const resumenBox = document.getElementById('simulador-resumen-comparativo');
        if (!resumenBox) return;

        const seleccionadas = catalogoInstituciones.filter(i => institucionesSeleccionadas.has(i.id));
        if (seleccionadas.length === 0) {
            resumenBox.innerHTML = `
                <div style="color: #64748b; font-size: 0.9rem; display: flex; align-items: center; gap: 8px;">
                    <i class="fas fa-info-circle" style="color: #3b82f6;"></i>
                    <em>Selecciona al menos una institución para comparar rendimientos.</em>
                </div>
            `;
            return;
        }

        // Encontrar la mejor opción de rendimiento del periodo exclusivamente entre las seleccionadas
        let mejorInst = null;
        let mejorPeriodo = -1;
        let mejorMensual = -1;

        seleccionadas.forEach(inst => {
            const res = resultadosCalculadosPorInst.get(inst.id);
            if (res && res.total_periodo > mejorPeriodo) {
                mejorPeriodo = res.total_periodo;
                mejorMensual = res.total_mensual;
                mejorInst = inst;
            }
        });

        if (mejorInst) {
            const tr = document.getElementById(`sim-row-${mejorInst.id}`);
            const curMeses = tr ? (parseInt(tr.querySelector('.sim-input-meses')?.value, 10) || 1) : 1;
            const curInv1 = tr ? (parseFloat(tr.querySelector('.sim-input-inv1')?.value) || 0) : 0;
            const curInv2 = tr ? (parseFloat(tr.querySelector('.sim-input-inv2')?.value) || 0) : 0;
            const capitalMostrado = curInv1 + curInv2;

            resumenBox.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                    <div>
                        <span style="font-weight: 700; color: #047857;"><i class="fas fa-trophy"></i> Mayor Rendimiento entre seleccionadas:</span>
                        <strong style="color: #0f172a; margin-left: 6px;">${mejorInst.nombre}</strong>
                        <span style="color: #64748b; margin-left: 8px;">(${formatMoney(capitalMostrado)} a ${curMeses} ${curMeses === 1 ? 'mes' : 'meses'})</span>
                    </div>
                    <div>
                        <span style="font-weight: 600; color: #334155;">Ganancia Periodo:</span>
                        <strong style="color: #166534; font-size: 1.1em; margin-left: 6px;">${formatMoney(mejorPeriodo)}</strong>
                        <span style="color: #64748b; margin-left: 10px;">(${formatMoney(mejorMensual)}/mes)</span>
                    </div>
                </div>
            `;
        }
    }

    /**
     * Alterna y actualiza el resumen visual según la estrategia activa:
     * - 'individual': Mayor rendimiento en una sola institución
     * - 'diversificada': Mejor combinación diversificada de capital
     */
    function actualizarResumenSegunEstrategia() {
        if (estrategiaActual !== 'individual') {
            actualizarEstrategiaDiversificada();
        } else {
            actualizarResumenComparativo();
        }
    }

    /**
     * Cambia la estrategia de inversión entre Individual y las tres diversificadas:
     * - individual: Mayor rendimiento en una sola institución
     * - maximo_rendimiento: 🟢 Máximo rendimiento
     * - equilibrada: 🔵 Equilibrada
     * - conservadora: 🟠 Conservadora
     */
    function cambiarEstrategia(estrategia) {
        if (estrategia === 'diversificada') estrategia = 'maximo_rendimiento';
        estrategiaActual = estrategia;

        // Actualizar checked en radios si no lo estuviera
        const radios = document.querySelectorAll('input[name="simulador-estrategia"]');
        radios.forEach(r => {
            if (r.value === estrategia) r.checked = true;
        });

        const labels = {
            'individual': document.querySelector('.sim-strategy-individual'),
            'maximo_rendimiento': document.querySelector('.sim-strategy-maximo'),
            'equilibrada': document.querySelector('.sim-strategy-equilibrada'),
            'conservadora': document.querySelector('.sim-strategy-conservadora')
        };

        // Resetear estilos de todos los botones de estrategia
        Object.values(labels).forEach(lbl => {
            if (lbl) {
                lbl.style.borderColor = '#cbd5e1';
                lbl.style.background = '#f8fafc';
                lbl.style.color = '#475569';
                lbl.style.fontWeight = '600';
            }
        });

        // Aplicar estilo activo a la opción seleccionada
        const activeLbl = labels[estrategia];
        if (activeLbl) {
            if (estrategia === 'individual') {
                activeLbl.style.borderColor = '#3b82f6';
                activeLbl.style.background = '#eff6ff';
                activeLbl.style.color = '#1d4ed8';
            } else if (estrategia === 'maximo_rendimiento') {
                activeLbl.style.borderColor = '#16a34a';
                activeLbl.style.background = '#f0fdf4';
                activeLbl.style.color = '#15803d';
            } else if (estrategia === 'equilibrada') {
                activeLbl.style.borderColor = '#2563eb';
                activeLbl.style.background = '#eff6ff';
                activeLbl.style.color = '#1d4ed8';
            } else if (estrategia === 'conservadora') {
                activeLbl.style.borderColor = '#d97706';
                activeLbl.style.background = '#fffbeb';
                activeLbl.style.color = '#b45309';
            }
            activeLbl.style.fontWeight = '700';
        }

        const panelInd = document.getElementById('simulador-resumen-comparativo');
        const panelDiv = document.getElementById('simulador-panel-diversificado');
        const paramsDiv = document.getElementById('simulador-params-diversificado');

        if (paramsDiv) paramsDiv.style.display = (estrategia === 'individual') ? 'none' : 'block';

        if (estrategia === 'individual') {
            if (panelInd) panelInd.style.display = 'block';
            if (panelDiv) panelDiv.style.display = 'none';
            actualizarResumenComparativo();
        } else {
            if (panelInd) panelInd.style.display = 'none';
            if (panelDiv) panelDiv.style.display = 'block';
            actualizarEstrategiaDiversificada();
        }
    }

    /**
     * Calcula y actualiza el panel de la estrategia de inversión diversificada.
     */
    function actualizarEstrategiaDiversificada() {
        const panelDiv = document.getElementById('simulador-panel-diversificado');
        if (!panelDiv) return;

        const capital = parseInversionGlobal();
        const inputMeses = document.getElementById('simulador-meses-global');
        const meses = parseInt(inputMeses ? inputMeses.value : 1, 10) || 1;

        // Filtrar exclusivamente instituciones que estén activas en BD y seleccionadas por el usuario
        const seleccionadas = catalogoInstituciones.filter(i => institucionesSeleccionadas.has(i.id));

        if (seleccionadas.length === 0) {
            panelDiv.innerHTML = `
                <div style="color: #64748b; font-size: 0.95rem; display: flex; align-items: center; gap: 8px;">
                    <i class="fas fa-info-circle" style="color: #3b82f6;"></i>
                    <em>Selecciona al menos una institución financiera para calcular la inversión diversificada.</em>
                </div>
            `;
            ultimaEstrategiaDiversificada = null;
            return;
        }

        const resultado = window.MotorFinanciero.calcularMejorInversionDiversificada({
            inversionTotal: capital,
            meses: meses,
            instituciones: seleccionadas,
            estrategia: estrategiaActual,
            estrategiasConfig: catalogoEstrategias,
            personalizaciones: valoresPersonalizadosPorInst
        });

        ultimaEstrategiaDiversificada = resultado;
        renderizarPanelDiversificado(resultado);
    }

    /**
     * Renderiza el panel visual completo de la propuesta diversificada.
     */
    function renderizarPanelDiversificado(res) {
        const panelDiv = document.getElementById('simulador-panel-diversificado');
        if (!panelDiv) return;

        if (!res || !res.exito) {
            panelDiv.innerHTML = `
                <div style="color: #dc2626; font-size: 0.95rem; display: flex; align-items: center; gap: 8px;">
                    <i class="fas fa-exclamation-triangle"></i>
                    <span>${escapeHTML(res ? res.mensajeError : 'No fue posible calcular la distribución.')}</span>
                </div>
            `;
            return;
        }

        const comp = res.comparativa || {};
        const mejorInd = comp.mejorIndividual || { nombre: '—', rendimientoPeriodo: 0, rendimientoMensual: 0 };
        const difPeriodo = comp.diferenciaPeriodo || 0;
        const difSigno = difPeriodo >= 0 ? `+${formatMoney(difPeriodo)}` : formatMoney(difPeriodo);
        const difColor = difPeriodo >= 0 ? '#166534' : '#b45309';

        const estInfo = res.estrategia || {};
        const estColor = estInfo.color || '#16a34a';
        const estIcono = estInfo.icono || 'fas fa-chart-line';
        const estNombre = estInfo.nombre || 'Estrategia Diversificada';

        panelDiv.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 18px;">
                <!-- Encabezado con Indicador de Estrategia -->
                <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px; border-bottom: 2px solid #bbf7d0; padding-bottom: 14px;">
                    <div>
                        <div style="font-weight: 800; font-size: 1.15rem; color: #166534; display: flex; align-items: center; gap: 8px;">
                            <span style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 6px; background: ${estColor}15; color: ${estColor}; border: 1px solid ${estColor}40;">
                                <i class="${estIcono}"></i> ${escapeHTML(estNombre)}
                            </span>
                            <span style="color: #0f172a; font-size: 1rem; font-weight: 700;">— Mejor Inversión Diversificada</span>
                        </div>
                        <div style="color: #475569; font-size: 0.88rem; margin-top: 6px;">
                            <span>Capital a invertir: <strong>${formatMoney(res.inversionTotal)}</strong></span>
                            <span style="margin: 0 6px;">•</span>
                            <span>Plazo: <strong>${res.meses} ${res.meses === 1 ? 'mes' : 'meses'}</strong></span>
                            <span style="margin: 0 6px;">•</span>
                            <span>Instituciones utilizadas: <strong style="color: #166534;">${res.numInstitucionesUtilizadas}</strong></span>
                            <span style="margin: 0 6px;">•</span>
                            <span>Tope por institución: <strong>${formatPercent(res.maxPorcentajePorInst)}</strong></span>
                        </div>
                    </div>
                    <div style="display: flex; gap: 14px; flex-wrap: wrap; text-align: right;">
                        <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 8px 14px;">
                            <span style="font-size: 0.78rem; font-weight: 600; color: #166534; display: block;">Rendimiento Estimado</span>
                            <strong style="font-size: 1.25rem; color: #15803d;">${formatMoney(res.rendimientoPeriodoTotal)}</strong>
                            <small style="display: block; font-size: 0.76rem; color: #475569;">(${formatMoney(res.rendimientoMensualTotal)}/mes)</small>
                        </div>
                        <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 8px 14px;">
                            <span style="font-size: 0.78rem; font-weight: 600; color: #1d4ed8; display: block;">Tasa Efectiva Ponderada</span>
                            <strong style="font-size: 1.25rem; color: #1e40af;">${formatPercent(res.tasaEfectivaPonderada)}</strong>
                            <small style="display: block; font-size: 0.76rem; color: #475569;">anualizada real</small>
                        </div>
                    </div>
                </div>

                <!-- Control de Balance del Capital (Validación matemática estricta: Capital = Distribuido + Sin Distribuir) -->
                <div style="display: flex; gap: 14px; flex-wrap: wrap; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 16px; font-size: 0.86rem; align-items: center;">
                    <div><span style="color: #64748b;">Capital total disponible:</span> <strong>${formatMoney(res.inversionTotal)}</strong></div>
                    <div><span style="color: #64748b;">Capital distribuido:</span> <strong style="color: #166534;">${formatMoney(res.capitalDistribuido)}</strong></div>
                    <div>
                        <span style="color: #64748b;">Capital sin distribuir:</span> 
                        <strong style="color: ${res.capitalSinDistribuir <= 0.01 ? '#166534' : '#dc2626'};">${formatMoney(res.capitalSinDistribuir)}</strong>
                        ${res.capitalSinDistribuir <= 0.01 ? '<span style="color: #166534; font-weight: 700; margin-left: 4px;">✓ 100% asignado</span>' : ''}
                    </div>
                </div>

                <!-- Alerta si quedó capital sin distribuir (Explicación transparente) -->
                ${res.capitalSinDistribuir > 0.01 ? `
                    <div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 12px 16px; color: #9a3412; font-size: 0.88rem;">
                        <div style="font-weight: 700; display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
                            <i class="fas fa-exclamation-triangle"></i> Capital sin distribuir: ${formatMoney(res.capitalSinDistribuir)}
                        </div>
                        <div>${escapeHTML(res.motivoSinDistribuir)}</div>
                    </div>
                ` : ''}

                <!-- Tabla de Distribución Recomendada -->
                <div>
                    <div style="font-weight: 700; color: #1e293b; font-size: 0.95rem; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
                        <i class="fas fa-chart-pie" style="color: #16a34a;"></i> Distribución Recomendada
                    </div>
                    <div class="table-responsive" style="border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden;">
                        <table class="table" style="width: 100%; border-collapse: collapse; margin-bottom: 0; font-size: 0.88rem;">
                            <thead>
                                <tr style="background: #f1f5f9; color: #334155; border-bottom: 2px solid #cbd5e1; text-align: left;">
                                    <th style="padding: 10px 12px;">Institución</th>
                                    <th style="padding: 10px 12px; text-align: center;">Tipo</th>
                                    <th style="padding: 10px 12px; text-align: right; background: #fef3c7;">Inversión Asignada</th>
                                    <th style="padding: 10px 12px; text-align: center;">% Capital</th>
                                    <th style="padding: 10px 12px; text-align: right;">Tasa Ponderada</th>
                                    <th style="padding: 10px 12px; text-align: right; background: #ecfdf5;">Rend. Mensual</th>
                                    <th style="padding: 10px 12px; text-align: right; background: #dcfce7;">Rend. Periodo</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${res.asignaciones.map(a => `
                                    <tr style="border-bottom: 1px solid #e2e8f0;">
                                        <td style="padding: 8px 12px; font-weight: 700; color: #0f172a;">${escapeHTML(a.nombre)}</td>
                                        <td style="padding: 8px 12px; text-align: center;">
                                            <span style="font-size: 0.78rem; font-weight: 700; padding: 2px 8px; border-radius: 4px; background: #e2e8f0; color: #334155;">
                                                ${escapeHTML(a.tipoDescripcion || a.tipo)}
                                            </span>
                                        </td>
                                        <td style="padding: 8px 12px; text-align: right; font-weight: 700; background: #fffbeb; color: #92400e;">${formatMoney(a.inversionAsignada)}</td>
                                        <td style="padding: 8px 12px; text-align: center; font-weight: 600; color: #475569;">${formatPercent(a.porcentajeDelCapital)}</td>
                                        <td style="padding: 8px 12px; text-align: right; font-weight: 600; color: #1e40af;">${formatPercent(a.tasaPonderada)}</td>
                                        <td style="padding: 8px 12px; text-align: right; font-weight: 600; color: #047857;">${formatMoney(a.rendimientoMensual)}</td>
                                        <td style="padding: 8px 12px; text-align: right; font-weight: 800; color: #166534; background: #f0fdf4;">${formatMoney(a.rendimientoPeriodo)}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                            <tfoot>
                                <tr style="background: #f8fafc; font-weight: 800; border-top: 2px solid #cbd5e1;">
                                    <td style="padding: 10px 12px; color: #0f172a;">TOTAL DISTRIBUIDO</td>
                                    <td style="padding: 10px 12px; text-align: center; color: #64748b;">${res.numInstitucionesUtilizadas} inst.</td>
                                    <td style="padding: 10px 12px; text-align: right; color: #92400e; background: #fef3c7;">${formatMoney(res.capitalDistribuido)}</td>
                                    <td style="padding: 10px 12px; text-align: center; color: #475569;">${formatPercent(res.inversionTotal > 0 ? (res.capitalDistribuido / res.inversionTotal) * 100 : 0)}</td>
                                    <td style="padding: 10px 12px; text-align: right; color: #1e40af;">${formatPercent(res.tasaEfectivaPonderada)}</td>
                                    <td style="padding: 10px 12px; text-align: right; color: #047857; background: #ecfdf5;">${formatMoney(res.rendimientoMensualTotal)}</td>
                                    <td style="padding: 10px 12px; text-align: right; color: #166534; background: #dcfce7; font-size: 1.05em;">${formatMoney(res.rendimientoPeriodoTotal)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>

                <!-- Alertas de Restricciones Relevantes de Instituciones Asignadas -->
                ${res.restriccionesRelevantes.length > 0 ? `
                    <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 12px 16px;">
                        <div style="font-weight: 700; color: #92400e; font-size: 0.88rem; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                            <i class="fas fa-exclamation-triangle"></i> Requisitos / Restricciones a considerar para cumplir estas tasas:
                        </div>
                        <ul style="margin: 0; padding-left: 20px; font-size: 0.84rem; color: #78350f;">
                            ${res.restriccionesRelevantes.map(r => `
                                <li style="margin-bottom: 3px;">
                                    <strong>${escapeHTML(r.nombre)} (${escapeHTML(r.tipoDescripcion)}):</strong> ${escapeHTML(r.descripcion)}
                                </li>
                            `).join('')}
                        </ul>
                    </div>
                ` : ''}

                <!-- Instituciones No Elegibles (si existen) -->
                ${Array.isArray(res.institucionesNoElegibles) && res.institucionesNoElegibles.length > 0 ? `
                    <div style="background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 10px 14px; font-size: 0.82rem; color: #64748b;">
                        <div style="font-weight: 700; color: #475569; margin-bottom: 4px;">
                            <i class="fas fa-info-circle"></i> Instituciones seleccionadas no elegibles en esta simulación:
                        </div>
                        <ul style="margin: 0; padding-left: 20px;">
                            ${res.institucionesNoElegibles.map(ie => `
                                <li><strong>${escapeHTML(ie.nombre)}:</strong> ${escapeHTML(ie.motivo)}</li>
                            `).join('')}
                        </ul>
                    </div>
                ` : ''}

                <!-- Fila Inferior: Comparativa + Concentración -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px;">
                    <!-- Comparativa: Todo en una vs Diversificada -->
                    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px;">
                        <div style="font-weight: 700; font-size: 0.88rem; color: #334155; margin-bottom: 8px;">
                            <i class="fas fa-balance-scale" style="color: #3b82f6;"></i> Comparativa contra una sola institución
                        </div>
                        <div style="font-size: 0.84rem; color: #475569; display: flex; flex-direction: column; gap: 6px;">
                            <div style="display: flex; justify-content: space-between;">
                                <span>Todo en una (<strong>${escapeHTML(mejorInd.nombre)}</strong>):</span>
                                <strong style="color: #0f172a;">${formatMoney(mejorInd.rendimientoPeriodo)}</strong>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <span>Inversión diversificada (<strong>${res.numInstitucionesUtilizadas} inst.</strong>):</span>
                                <strong style="color: #166534;">${formatMoney(res.rendimientoPeriodoTotal)}</strong>
                            </div>
                            <div style="display: flex; justify-content: space-between; border-top: 1px dashed #cbd5e1; padding-top: 6px;">
                                <span>Diferencia:</span>
                                <strong style="color: ${difColor}; font-size: 0.95em;">${difSigno}</strong>
                            </div>
                        </div>
                    </div>

                    <!-- Métrica de Concentración -->
                    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px;">
                        <div style="font-weight: 700; font-size: 0.88rem; color: #334155; margin-bottom: 8px;">
                            <i class="fas fa-shield-alt" style="color: #10b981;"></i> Métrica de Concentración
                        </div>
                        <div style="font-size: 0.84rem; color: #475569; display: flex; flex-direction: column; gap: 6px;">
                            <div style="display: flex; justify-content: space-between;">
                                <span>Mayor asignación:</span>
                                <strong>${formatMoney(res.concentracion.montoMayorAsignacion)} (${escapeHTML(res.concentracion.institucionMayorAsignacion)})</strong>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <span>Concentración máxima:</span>
                                <strong style="color: #1e40af;">${formatPercent(res.concentracion.porcentajeMayorAsignacion)}</strong>
                            </div>
                            <div style="display: flex; justify-content: space-between; border-top: 1px dashed #cbd5e1; padding-top: 6px;">
                                <span>Tope configurado:</span>
                                <span>${formatPercent(res.maxPorcentajePorInst)} ($${formatMoney(res.topeMaximoPorInst)})</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- ¿Por qué esta distribución? -->
                <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px 16px; font-size: 0.85rem; color: #166534;">
                    <strong><i class="fas fa-lightbulb" style="color: #eab308;"></i> ¿Por qué esta distribución?</strong>
                    <p style="margin: 4px 0 0 0; line-height: 1.45;">${escapeHTML(res.explicacion)}</p>
                </div>

                <!-- Botones de Acción -->
                <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap; padding-top: 8px;">
                    <button type="button" id="simulador-btn-aplicar-estrategia" class="btn btn-primary" style="background: #166534; border-color: #15803d; font-weight: 700; padding: 8px 18px;">
                        <i class="fas fa-check-circle"></i> Aplicar estrategia a la tabla
                    </button>
                    <button type="button" id="simulador-btn-restablecer-simulacion" class="btn btn-secondary" style="font-weight: 600; padding: 8px 18px;">
                        <i class="fas fa-undo"></i> Restablecer simulación
                    </button>
                    <span style="font-size: 0.8rem; color: #64748b;">(Aplica estos montos directamente a las filas de la tabla para analizarlas o editarlas)</span>
                </div>
            </div>
        `;

        // Conectar botones
        const btnAplicar = document.getElementById('simulador-btn-aplicar-estrategia');
        if (btnAplicar) {
            btnAplicar.addEventListener('click', () => {
                aplicarEstrategiaDiversificada();
            });
        }

        const btnRestablecer = document.getElementById('simulador-btn-restablecer-simulacion');
        if (btnRestablecer) {
            btnRestablecer.addEventListener('click', () => {
                restablecerSimulacionNormal();
            });
        }
    }

    /**
     * Aplica los montos de la estrategia diversificada a las filas de la tabla interactiva:
     * - Asigna Inversión 1 e Inversión 2 en las instituciones recomendadas.
     * - Asigna 0 a las instituciones no incluidas en la estrategia.
     * - Agrega una insignia "Estrategia Diversificada" a las filas participantes.
     * - Recalcula rendimientos por fila de forma reactiva.
     */
    function aplicarEstrategiaDiversificada() {
        if (!ultimaEstrategiaDiversificada || !ultimaEstrategiaDiversificada.asignaciones) return;

        const asignacionesMap = new Map();
        ultimaEstrategiaDiversificada.asignaciones.forEach(a => {
            asignacionesMap.set(a.institucionId, a);
        });

        catalogoInstituciones.forEach(inst => {
            const tr = document.getElementById(`sim-row-${inst.id}`);
            if (!tr) return;

            const inputInv1 = tr.querySelector('.sim-input-inv1');
            const inputInv2 = tr.querySelector('.sim-input-inv2');
            const inputMeses = tr.querySelector('.sim-input-meses');
            const asig = asignacionesMap.get(inst.id);

            // Eliminar badge previo de estrategia si existía
            const oldBadge = tr.querySelector('.badge-estrategia-diversificada');
            if (oldBadge) oldBadge.remove();

            if (asig && asig.inversionAsignada > 0) {
                if (inputInv1) inputInv1.value = asig.inversion1.toFixed(2);
                if (inputInv2) inputInv2.value = asig.inversion2.toFixed(2);
                if (inputMeses) inputMeses.value = ultimaEstrategiaDiversificada.meses;

                // Agregar badge de estrategia
                const nameDiv = tr.querySelector('td:nth-child(2) > div');
                if (nameDiv) {
                    const badge = document.createElement('span');
                    badge.className = 'badge-estrategia-diversificada';
                    badge.style.cssText = 'background: #dcfce7; color: #166534; font-size: 0.72rem; padding: 2px 6px; border-radius: 4px; font-weight: 700; border: 1px solid #86efac; margin-left: 4px;';
                    badge.innerHTML = '<i class="fas fa-chart-pie" style="font-size: 0.65rem;"></i> Estrategia';
                    nameDiv.appendChild(badge);
                }

                recalcularFila(inst.id, tr);
            } else {
                // No incluida en la estrategia: poner a 0
                if (inputInv1) inputInv1.value = '0.00';
                if (inputInv2) inputInv2.value = '0.00';
                recalcularFila(inst.id, tr);
            }
        });
    }

    /**
     * Restablece la simulación a su distribución normal (capital global en tramos).
     */
    function restablecerSimulacionNormal() {
        document.querySelectorAll('.badge-estrategia-diversificada').forEach(b => b.remove());
        recalcularSimulacion();
    }

    // Exponer públicamente al objeto global
    window.inicializarSimuladorFinanciero = inicializarSimuladorFinanciero;
    window.cargarCatalogoSimulador = cargarCatalogoSimulador;
    window.recalcularSimulacion = recalcularSimulacion;
    window.recalcularFila = recalcularFila;
    window.restablecerFilaOriginal = restablecerFilaOriginal;
    window.quitarInstitucion = quitarInstitucion;
    window.agregarInstitucion = agregarInstitucion;
    window.seleccionarTodas = seleccionarTodas;
    window.deseleccionarTodas = deseleccionarTodas;
    window.cambiarEstrategia = cambiarEstrategia;
    window.actualizarEstrategiaDiversificada = actualizarEstrategiaDiversificada;
    window.aplicarEstrategiaDiversificada = aplicarEstrategiaDiversificada;
    window.restablecerSimulacionNormal = restablecerSimulacionNormal;
    window.getEstrategiaActual = () => estrategiaActual;
    window.getUltimaEstrategiaDiversificada = () => ultimaEstrategiaDiversificada;
    window.valoresPersonalizadosPorInst = valoresPersonalizadosPorInst;
    window.valoresOriginalesPorInst = valoresOriginalesPorInst;
    window.resultadosCalculadosPorInst = resultadosCalculadosPorInst;
    window.institucionesSeleccionadas = institucionesSeleccionadas;
    window.getCatalogoInstituciones = () => catalogoInstituciones;
    window.getInstitucionesSeleccionadas = () => institucionesSeleccionadas;
}());
