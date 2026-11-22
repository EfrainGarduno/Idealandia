/**
 * simuladorFinanciero.js
 * Controlador de interfaz para el Simulador de Inversiones (Idealandia)
 * Conecta los catálogos dinámicos de la BD con el motor matemático y la tabla responsiva.
 */

(function () {
    'use strict';

    let catalogoInstituciones = [];
    let institucionesSeleccionadas = new Set();
    let fechaConsultaActual = new Date().toISOString().slice(0, 10);

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

            // Por defecto, todas las instituciones quedan seleccionadas
            institucionesSeleccionadas = new Set(catalogoInstituciones.map(i => i.id));

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
                catalogoInstituciones.forEach(i => institucionesSeleccionadas.add(i.id));
                actualizarCheckboxesYRecalcular();
            });
        }

        if (btnDeseleccionarTodas && !btnDeseleccionarTodas.dataset.configured) {
            btnDeseleccionarTodas.dataset.configured = 'true';
            btnDeseleccionarTodas.addEventListener('click', () => {
                institucionesSeleccionadas.clear();
                actualizarCheckboxesYRecalcular();
            });
        }
    }

    function actualizarCheckboxesYRecalcular() {
        const checkboxes = document.querySelectorAll('.simulador-check-inst');
        checkboxes.forEach(chk => {
            const id = parseInt(chk.dataset.instId, 10);
            chk.checked = institucionesSeleccionadas.has(id);
        });
        recalcularSimulacion();
    }

    /**
     * Renderiza la tabla completa del simulador conservando la estructura de la imagen de referencia.
     */
    function renderizarTablaSimulador() {
        const tbody = document.getElementById('simulador-tbody');
        if (!tbody) return;

        tbody.innerHTML = '';

        if (catalogoInstituciones.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="13" style="text-align: center; padding: 20px; color: #64748b;">
                        No hay instituciones financieras configuradas o vigentes para la fecha seleccionada.
                    </td>
                </tr>
            `;
            return;
        }

        const inputInversion = document.getElementById('simulador-inversion-global');
        const inputMeses = document.getElementById('simulador-meses-global');
        const capitalGlobal = parseFloat(inputInversion ? inputInversion.value : 40000) || 40000;
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

            // Calcular simulación para esta fila
            const sim = tieneEsquema ? window.MotorFinanciero.simularInversion(capitalGlobal, mesesGlobal, tramos) : null;

            // HTML de fila principal
            tr.innerHTML = `
                <td style="text-align: center;">
                    <input type="checkbox" class="simulador-check-inst" data-inst-id="${inst.id}" ${isChecked ? 'checked' : ''} style="cursor: pointer; width: 18px; height: 18px;">
                </td>
                <td style="font-weight: 700; color: #1e293b;">
                    ${inst.nombre}
                    ${tramos.length >= 3 ? `<button type="button" class="btn-toggle-tramos" data-inst-id="${inst.id}" style="display: block; margin-top: 4px; font-size: 0.72rem; padding: 2px 6px; border: 1px solid #cbd5e1; border-radius: 4px; background: #f8fafc; color: #2563eb; cursor: pointer;"><i class="fas fa-layer-group"></i> Ver ${tramos.length} tramos</button>` : ''}
                </td>
                <td style="text-align: center;">
                    <span style="font-weight: 700; padding: 3px 8px; border-radius: 4px; background: ${tInfo.bg}; color: ${tInfo.color}; font-size: 0.85rem;" title="${tInfo.title}">
                        ${tInfo.label}
                    </span>
                </td>
                <td style="font-size: 0.85rem; color: #475569;">
                    ${inst.condiciones_resumen || (tieneEsquema ? inst.esquema.nombre_esquema : 'Sin condiciones activas')}
                </td>
                <!-- Inversión Base (Fondo amarillo como en diseño de referencia) -->
                <td class="sim-cell-input-highlight" style="background: #fffbeb; font-weight: 600; text-align: right;">
                    <span class="sim-val-inv-base">${sim ? formatMoney(sim.inversion_base) : '—'}</span>
                </td>
                <!-- Tasa % -->
                <td style="text-align: right; font-weight: 700; color: #0f172a;">
                    <span class="sim-val-tasa">${sim ? formatPercent(sim.tasa_base) : '—'}</span>
                </td>
                <!-- Monto 2 (Monto a partir del cual cambia la tasa) -->
                <td style="text-align: right; color: #64748b;">
                    <span class="sim-val-monto2">${(sim && sim.monto_2 !== null) ? formatMoney(sim.monto_2) : '—'}</span>
                </td>
                <!-- Inversión 2 (Calculada automáticamente por el sistema con fondo amarillo) -->
                <td class="sim-cell-input-highlight" style="background: #fffbeb; font-weight: 600; text-align: right;">
                    <span class="sim-val-inv2">${sim ? formatMoney(sim.inversion_2) : '—'}</span>
                </td>
                <!-- Meses -->
                <td style="text-align: center; font-weight: 600;">
                    <span class="sim-val-meses">${mesesGlobal}</span>
                </td>
                <!-- Rend1 -->
                <td style="text-align: right; color: #047857; font-weight: 600;">
                    <span class="sim-val-rend1">${sim ? formatMoney(sim.rend1) : '—'}</span>
                </td>
                <!-- Rend2 -->
                <td style="text-align: right; color: #047857; font-weight: 600;">
                    <span class="sim-val-rend2">${sim ? formatMoney(sim.rend2) : '—'}</span>
                </td>
                <!-- Total mensual -->
                <td style="text-align: right; font-weight: 700; color: #1e3a8a; background: #f0fdf4;">
                    <span class="sim-val-total-mensual">${sim ? formatMoney(sim.total_mensual) : '—'}</span>
                </td>
                <!-- Total periodo -->
                <td style="text-align: right; font-weight: 800; color: #166534; background: #dcfce7;">
                    <span class="sim-val-total-periodo">${sim ? formatMoney(sim.total_periodo) : '—'}</span>
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
                    <td colspan="13" style="background: #f8fafc; padding: 12px 20px; border-left: 4px solid #2563eb;">
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

        // Configurar listener para checkboxes de selección
        document.querySelectorAll('.simulador-check-inst').forEach(chk => {
            chk.addEventListener('change', (e) => {
                const id = parseInt(e.target.dataset.instId, 10);
                if (e.target.checked) {
                    institucionesSeleccionadas.add(id);
                } else {
                    institucionesSeleccionadas.delete(id);
                }
                actualizarEstiloFilasSeleccionadas();
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
     */
    function recalcularSimulacion() {
        const inputInversion = document.getElementById('simulador-inversion-global');
        const inputMeses = document.getElementById('simulador-meses-global');
        const capitalGlobal = parseFloat(inputInversion ? inputInversion.value : 0) || 0;
        const mesesGlobal = parseInt(inputMeses ? inputMeses.value : 1, 10) || 1;

        catalogoInstituciones.forEach(inst => {
            const tr = document.getElementById(`sim-row-${inst.id}`);
            if (!tr) return;

            const tramos = (inst.esquema && Array.isArray(inst.esquema.tramos)) ? inst.esquema.tramos : [];
            if (tramos.length === 0) return;

            const sim = window.MotorFinanciero.simularInversion(capitalGlobal, mesesGlobal, tramos);

            const elInvBase = tr.querySelector('.sim-val-inv-base');
            const elTasa = tr.querySelector('.sim-val-tasa');
            const elMonto2 = tr.querySelector('.sim-val-monto2');
            const elInv2 = tr.querySelector('.sim-val-inv2');
            const elMeses = tr.querySelector('.sim-val-meses');
            const elRend1 = tr.querySelector('.sim-val-rend1');
            const elRend2 = tr.querySelector('.sim-val-rend2');
            const elTotalMensual = tr.querySelector('.sim-val-total-mensual');
            const elTotalPeriodo = tr.querySelector('.sim-val-total-periodo');

            if (elInvBase) elInvBase.textContent = formatMoney(sim.inversion_base);
            if (elTasa) elTasa.textContent = formatPercent(sim.tasa_base);
            if (elMonto2) elMonto2.textContent = sim.monto_2 !== null ? formatMoney(sim.monto_2) : '—';
            if (elInv2) elInv2.textContent = formatMoney(sim.inversion_2);
            if (elMeses) elMeses.textContent = mesesGlobal;
            if (elRend1) elRend1.textContent = formatMoney(sim.rend1);
            if (elRend2) elRend2.textContent = formatMoney(sim.rend2);
            if (elTotalMensual) elTotalMensual.textContent = formatMoney(sim.total_mensual);
            if (elTotalPeriodo) elTotalPeriodo.textContent = formatMoney(sim.total_periodo);

            // Actualizar subfila de N tramos si existe
            const subrowTbody = document.getElementById(`sim-subrow-tbody-${inst.id}`);
            if (subrowTbody) {
                subrowTbody.innerHTML = renderizarSubTramosHtml(sim);
            }
        });

        actualizarResumenComparativo();
    }

    /**
     * Resalta visualmente las filas seleccionadas y calcula el resumen comparativo.
     */
    function actualizarEstiloFilasSeleccionadas() {
        catalogoInstituciones.forEach(inst => {
            const tr = document.getElementById(`sim-row-${inst.id}`);
            if (!tr) return;
            const isSelected = institucionesSeleccionadas.has(inst.id);
            if (isSelected) {
                tr.style.opacity = '1';
                tr.classList.add('row-selected');
            } else {
                tr.style.opacity = '0.45';
                tr.classList.remove('row-selected');
            }
        });
        actualizarResumenComparativo();
    }

    function actualizarResumenComparativo() {
        const resumenBox = document.getElementById('simulador-resumen-comparativo');
        if (!resumenBox) return;

        const seleccionadas = catalogoInstituciones.filter(i => institucionesSeleccionadas.has(i.id));
        if (seleccionadas.length === 0) {
            resumenBox.innerHTML = `<em>Selecciona al menos una institución financiera mediante los checkboxes para comparar resultados.</em>`;
            return;
        }

        const inputInversion = document.getElementById('simulador-inversion-global');
        const inputMeses = document.getElementById('simulador-meses-global');
        const capitalGlobal = parseFloat(inputInversion ? inputInversion.value : 0) || 0;
        const mesesGlobal = parseInt(inputMeses ? inputMeses.value : 1, 10) || 1;

        // Encontrar la mejor opción de rendimiento del periodo
        let mejorInst = null;
        let mejorRend = -1;

        seleccionadas.forEach(inst => {
            const tramos = (inst.esquema && Array.isArray(inst.esquema.tramos)) ? inst.esquema.tramos : [];
            if (tramos.length > 0) {
                const sim = window.MotorFinanciero.simularInversion(capitalGlobal, mesesGlobal, tramos);
                if (sim.total_periodo > mejorRend) {
                    mejorRend = sim.total_periodo;
                    mejorInst = { inst, sim };
                }
            }
        });

        if (mejorInst) {
            resumenBox.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                    <div>
                        <span style="font-weight: 700; color: #047857;"><i class="fas fa-trophy"></i> Mayor Rendimiento entre seleccionadas:</span>
                        <strong style="color: #0f172a; margin-left: 6px;">${mejorInst.inst.nombre}</strong>
                        <span style="color: #64748b; margin-left: 8px;">(${formatMoney(capitalGlobal)} a ${mesesGlobal} ${mesesGlobal === 1 ? 'mes' : 'meses'})</span>
                    </div>
                    <div>
                        <span style="font-weight: 600; color: #334155;">Ganancia Periodo:</span>
                        <strong style="color: #166534; font-size: 1.1em; margin-left: 6px;">${formatMoney(mejorInst.sim.total_periodo)}</strong>
                        <span style="color: #64748b; margin-left: 10px;">(${formatMoney(mejorInst.sim.total_mensual)}/mes)</span>
                    </div>
                </div>
            `;
        }
    }

    // Exponer públicamente al objeto global
    window.inicializarSimuladorFinanciero = inicializarSimuladorFinanciero;
    window.cargarCatalogoSimulador = cargarCatalogoSimulador;
    window.recalcularSimulacion = recalcularSimulacion;
}());
