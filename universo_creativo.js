/**
 * =============================================================================
 * UNIVERSO CREATIVO DE IDEAS (V3: REFUERZO DE CADENA ENERGÉTICA COMPLETA)
 * =============================================================================
 * Cadena Visual:
 * MOTOR → BORDE ENERGÉTICO → CARGA → EXPLOSIÓN → IDEAS VOLANDO → CONEXIONES → NÚCLEO IDEA
 *
 * Componentes de Doble Canvas (Fondo + Frente):
 * - Canvas Fondo (#universo-vivo-canvas, z-index: 1): Partículas profundas,
 *   red de conexiones con Connection Surge y partículas en órbita.
 * - Canvas Frontal (#universo-front-canvas, z-index: 6, pointer-events: none):
 *   Ondas de choque, ráfagas de 85+ partículas (expansivas + retorno al Núcleo IDEA),
 *   Ideas Volando emergentes de la explosión (pastillas conceptuales radiantes),
 *   pulsos del Núcleo IDEA y Flash de Eureka elegante.
 * =============================================================================
 */

(function (window) {
    'use strict';

    const PALABRAS_CREATIVAS = [
        'IDEAS', 'CREAR', 'INNOVAR', 'IMAGINAR', 'DESCUBRIR',
        'CONECTAR', 'TRANSFORMAR', 'EXPLORAR', 'CRECER', 'CREAR VALOR',
        'POSIBILIDADES', 'SOLUCIONES', 'FUTURO', 'IMPACTO', 'PROPÓSITO', 'ACCIÓN'
    ];

    const PALETA_MOTORES = {
        explorador: { color: '#6c40f7', palabras: ['EXPLORAR', 'POSIBILIDADES', 'DESCUBRIR', 'HORIZONTES'] },
        madurador:  { color: '#059669', palabras: ['CRECER', 'SOLIDEZ', 'TRANSFORMAR', 'ESTRUCTURA'] },
        validador:  { color: '#d97706', palabras: ['COMPROBAR', 'SOLUCIONES', 'CERTEZA', 'HIPÓTESIS'] },
        negocio:    { color: '#0284c7', palabras: ['CREAR VALOR', 'FUTURO', 'SOSTENIBILIDAD', 'MODELO'] },
        impacto:    { color: '#16a34a', palabras: ['IMPACTO', 'TRANSFORMAR', 'HUELLA', 'BENEFICIO'] },
        proposito:  { color: '#e11d48', palabras: ['PROPÓSITO', 'SENTIDO', 'VALORES', 'ESENCIA'] },
        conector:   { color: '#8b5cf6', palabras: ['CONECTAR', 'SINERGIA', 'ALIANZAS', 'REDES'] },
        ejecutor:   { color: '#ea580c', palabras: ['ACCIÓN', 'CREAR', 'REALIDAD', 'RUMBO'] }
    };

    class UniversoCreativoEngine {
        constructor() {
            this.bgCanvas = null;
            this.bgCtx = null;
            this.frontCanvas = null;
            this.frontCtx = null;
            this.panel = null;
            this.rafId = null;
            this.initialized = false;
            this.running = false;

            // Elementos Fondo
            this.particles = [];
            this.words = []; // Palabras ambientales de fondo
            this.connectionSurge = null; // Iluminación de conexiones durante explosión

            // Elementos Frente (Efectos de Alto Impacto)
            this.burstParticles = [];
            this.shockwaves = [];
            this.foregroundWords = []; // "Ideas Volando" emergentes directamente de la explosión
            this.nucleoPulses = []; // Ondas al recibir energía en el Núcleo IDEA

            // Estado de Procesamiento / Vórtice IA
            this.isProcessing = false;
            this.processingMotorKey = null;
            this.processingTime = 0;

            // Dimensiones
            this.width = 800;
            this.height = 600;
            this.dpr = 1;

            this.lastFrameTime = 0;
            this.wordSpawnTimer = 0;

            this._onResize = this._onResize.bind(this);
            this._onVisibilityChange = this._onVisibilityChange.bind(this);
            this.loop = this.loop.bind(this);
        }

        init(bgCanvasId = 'universo-vivo-canvas', frontCanvasId = 'universo-front-canvas', panelId = 'workspace-panel-motores') {
            this.bgCanvas = document.getElementById(bgCanvasId);
            this.frontCanvas = document.getElementById(frontCanvasId);
            this.panel = document.getElementById(panelId);
            if (!this.bgCanvas || !this.panel) return false;

            this.bgCtx = this.bgCanvas.getContext('2d');
            if (this.frontCanvas) {
                this.frontCtx = this.frontCanvas.getContext('2d');
            }

            this.resize();

            // Población inicial de partículas con alto contraste y dinamismo
            this._seedParticles();

            // Semilla de palabras flotantes ambientales en el fondo
            const initialWordsCount = window.innerWidth < 640 ? 2 : 4;
            for (let i = 0; i < initialWordsCount; i++) {
                this.spawnFloatingWord(null, true);
            }

            window.addEventListener('resize', this._onResize);
            document.addEventListener('visibilitychange', this._onVisibilityChange);

            this.initialized = true;
            return true;
        }

        _onResize() {
            if (this.panel && this.panel.style.display !== 'none') {
                this.resize();
            }
        }

        _onVisibilityChange() {
            if (document.hidden) {
                this.stop();
            } else if (this.panel && this.panel.style.display !== 'none') {
                this.start();
            }
        }

        resize() {
            if (!this.panel) return;
            this.dpr = window.devicePixelRatio || 1;
            const rect = this.panel.getBoundingClientRect();
            this.width = Math.max(rect.width || this.panel.offsetWidth || 320, 320);
            this.height = Math.max(rect.height || this.panel.offsetHeight || 520, 520);

            if (this.bgCanvas) {
                this.bgCanvas.width = Math.floor(this.width * this.dpr);
                this.bgCanvas.height = Math.floor(this.height * this.dpr);
                this.bgCanvas.style.width = this.width + 'px';
                this.bgCanvas.style.height = this.height + 'px';
                this.bgCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
            }

            if (this.frontCanvas) {
                this.frontCanvas.width = Math.floor(this.width * this.dpr);
                this.frontCanvas.height = Math.floor(this.height * this.dpr);
                this.frontCanvas.style.width = this.width + 'px';
                this.frontCanvas.style.height = this.height + 'px';
                this.frontCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
            }
        }

        _seedParticles() {
            const isMobile = window.innerWidth < 640;
            const count = isMobile ? 38 : 68;
            const colors = [
                '#6c40f7', '#059669', '#d97706', '#0284c7',
                '#16a34a', '#e11d48', '#8b5cf6', '#ea580c'
            ];

            this.particles = [];
            for (let i = 0; i < count; i++) {
                this.particles.push({
                    x: Math.random() * this.width,
                    y: Math.random() * this.height,
                    radius: Math.random() * 3.2 + 1.5,
                    depth: Math.random() * 0.8 + 0.2,
                    color: colors[Math.floor(Math.random() * colors.length)],
                    baseAlpha: Math.random() * 0.35 + 0.25,
                    alpha: 0.3,
                    twinkleSpeed: Math.random() * 0.03 + 0.015,
                    twinklePhase: Math.random() * Math.PI * 2,
                    vx: (Math.random() - 0.5) * 0.55,
                    vy: -Math.random() * 0.45 - 0.1,
                    oscFreq: Math.random() * 0.02 + 0.008,
                    oscAmp: Math.random() * 0.6 + 0.25,
                    phase: Math.random() * Math.PI * 2
                });
            }
        }

        spawnFloatingWord(explicitText = null, isInitial = false) {
            const text = explicitText || PALABRAS_CREATIVAS[Math.floor(Math.random() * PALABRAS_CREATIVAS.length)];
            const colors = ['#6c40f7', '#059669', '#d97706', '#0284c7', '#8b5cf6', '#e11d48', '#4338ca'];
            const color = colors[Math.floor(Math.random() * colors.length)];

            const padding = 50;
            const x = padding + Math.random() * Math.max(this.width - padding * 2, 100);
            const y = padding + Math.random() * Math.max(this.height - padding * 2, 100);

            this.words.push({
                text: text,
                color: color,
                x: x,
                y: y,
                vx: (Math.random() - 0.5) * 0.35,
                vy: -Math.random() * 0.3 - 0.08,
                scale: Math.random() * 0.35 + 0.85,
                rotation: (Math.random() - 0.5) * 0.08,
                alpha: isInitial ? Math.random() * 0.4 + 0.2 : 0,
                maxAlpha: Math.random() * 0.25 + 0.35,
                state: isInitial ? 'floating' : 'fade-in',
                life: Math.floor(Math.random() * 260 + 200),
                age: 0
            });
        }

        /**
         * SECUENCIA DE EXPLOSIÓN Y CADENA ENERGÉTICA:
         * MOTOR → BORDE ENERGÉTICO → CARGA → EXPLOSIÓN → IDEAS VOLANDO → CONEXIONES → NÚCLEO IDEA
         */
        triggerExplosion(arg1, arg2, arg3) {
            if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

            let motorKey = 'explorador';
            let originX = null;
            let originY = null;

            if (typeof arg1 === 'number') {
                originX = arg1;
                originY = arg2;
                motorKey = arg3 || 'explorador';
            } else if (typeof arg1 === 'string') {
                motorKey = arg1;
                originX = (typeof arg2 === 'number') ? arg2 : null;
                originY = (typeof arg3 === 'number') ? arg3 : null;
            }

            const motorConfig = PALETA_MOTORES[motorKey] || PALETA_MOTORES.explorador;
            const color = motorConfig.color;

            // Determinar coordenadas de origen
            let x = originX;
            let y = originY;

            if (x === null || y === null) {
                const card = document.querySelector(`.motor-select-card[data-motor="${motorKey}"]`);
                if (card && this.panel) {
                    const cardRect = card.getBoundingClientRect();
                    const panelRect = this.panel.getBoundingClientRect();
                    x = cardRect.left + cardRect.width / 2 - panelRect.left;
                    y = cardRect.top + cardRect.height / 2 - panelRect.top;
                } else {
                    x = this.width / 2;
                    y = this.height / 3;
                }
            }

            // Coordenadas del Núcleo IDEA central
            const nucleoIdea = document.getElementById('universo-nucleo-idea');
            let nucleoX = this.width / 2;
            let nucleoY = 130;
            if (nucleoIdea && this.panel) {
                const nRect = nucleoIdea.getBoundingClientRect();
                const panRect = this.panel.getBoundingClientRect();
                nucleoX = nRect.left + nRect.width / 2 - panRect.left;
                nucleoY = nRect.top + nRect.height / 2 - panRect.top;
            }

            // 1. Doble Onda de Choque Expansiva Frontal
            this.shockwaves.push({
                x: x,
                y: y,
                radius: 14,
                maxRadius: Math.min(this.width, this.height) * 0.55,
                color: color,
                alpha: 1.0,
                lineWidth: 5,
                speed: 11
            });

            this.shockwaves.push({
                x: x,
                y: y,
                radius: 6,
                maxRadius: Math.min(this.width, this.height) * 0.38,
                color: '#ffffff',
                alpha: 0.95,
                lineWidth: 3.5,
                speed: 15
            });

            // 2. Movimiento Espacial: Partículas Expansivas (55%) vs Flujo de Retorno al Núcleo IDEA (45%)
            const count = window.innerWidth < 640 ? 55 : 85;

            for (let i = 0; i < count; i++) {
                const isReturning = (i % 2 === 0);
                const angle = Math.random() * Math.PI * 2;

                if (!isReturning) {
                    // Partículas Expansivas que se alejan hacia el espacio exterior
                    const speed = Math.random() * 8.5 + 3.0;
                    this.burstParticles.push({
                        x: x,
                        y: y,
                        vx: Math.cos(angle) * speed,
                        vy: Math.sin(angle) * speed,
                        radius: Math.random() * 3.8 + 1.8,
                        color: (i % 3 === 0) ? '#ffffff' : color,
                        alpha: 1.0,
                        life: 1.0,
                        decay: Math.random() * 0.015 + 0.010,
                        isReturningToNucleo: false
                    });
                } else {
                    // Partículas de Retorno dirigidas con atracción hacia el Núcleo IDEA
                    const initialSpeed = Math.random() * 4.5 + 1.5;
                    this.burstParticles.push({
                        x: x,
                        y: y,
                        vx: Math.cos(angle) * initialSpeed,
                        vy: Math.sin(angle) * initialSpeed,
                        targetX: nucleoX,
                        targetY: nucleoY,
                        radius: Math.random() * 3.5 + 1.8,
                        color: (i % 4 === 0) ? '#ffffff' : ((i % 2 === 0) ? '#f59e0b' : color),
                        alpha: 1.0,
                        life: 1.0,
                        decay: Math.random() * 0.012 + 0.008,
                        isReturningToNucleo: true
                    });
                }
            }

            // 3. Ideas Volando: Conceptos que emergen DIRECTAMENTE de la explosión
            // Ejemplos: IDEAS, CREAR, INNOVAR, POSIBILIDADES, DESCUBRIR, TRANSFORMAR, FUTURO
            const generalKeywords = ['IDEAS', 'CREAR', 'INNOVAR', 'POSIBILIDADES', 'DESCUBRIR', 'TRANSFORMAR', 'FUTURO'];
            const motorKeywords = motorConfig.palabras || ['INNOVAR', 'CREAR'];

            const shuffledGen = [...generalKeywords].sort(() => 0.5 - Math.random());
            const explosionWords = [shuffledGen[0], motorKeywords[0], shuffledGen[1], motorKeywords[1] || shuffledGen[2]];

            explosionWords.forEach((wordText, idx) => {
                setTimeout(() => {
                    if (!this.running) return;
                    const wordAngle = (Math.PI * 2 / explosionWords.length) * idx + (Math.random() - 0.5) * 0.4;
                    const speed = Math.random() * 2.2 + 2.0;

                    this.foregroundWords.push({
                        text: wordText,
                        color: color,
                        x: x,
                        y: y,
                        vx: Math.cos(wordAngle) * speed,
                        vy: Math.sin(wordAngle) * speed - 0.6,
                        scale: 0.35,
                        targetScale: 1.10,
                        alpha: 0,
                        maxAlpha: 0.95,
                        rotation: (Math.random() - 0.5) * 0.14,
                        age: 0,
                        life: 250,
                        state: 'emerging'
                    });
                }, idx * 75);
            });

            // 4. Conexiones: Iluminar brevemente las líneas hacia otros motores y hacia el Núcleo IDEA
            this.connectionSurge = {
                sourceX: x,
                sourceY: y,
                sourceKey: motorKey,
                color: color,
                progress: 0,
                speed: 0.024,
                active: true
            };
        }

        setProcessingMode(active, motorKey = 'explorador') {
            this.isProcessing = !!active;
            this.processingMotorKey = motorKey;
            this.processingTime = 0;

            const execCard = document.getElementById('motor-execution-card');
            const activeCard = document.querySelector(`.motor-select-card[data-motor="${motorKey}"]`);

            if (active) {
                if (execCard) {
                    execCard.classList.add('motor-execution-processing');
                    const motorDef = PALETA_MOTORES[motorKey] || PALETA_MOTORES.explorador;
                    execCard.style.setProperty('--motor-color', motorDef.color);
                    execCard.style.setProperty('--motor-glow', `${motorDef.color}66`);
                }
                if (activeCard) {
                    activeCard.classList.add('motor-card-charging');
                }
            } else {
                if (execCard) {
                    execCard.classList.remove('motor-execution-processing');
                }
                if (activeCard) {
                    activeCard.classList.remove('motor-card-charging');
                }
                // Si culmina el análisis, emitir pulso elegante de Eureka antes del resultado
                this.triggerEurekaFlash(motorKey);
            }
        }

        /**
         * EUREKA: Segundo pulso más pequeño, concentrado y elegante antes del resultado
         */
        triggerEurekaFlash(motorKey) {
            if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

            const motorDef = PALETA_MOTORES[motorKey] || PALETA_MOTORES.explorador;
            const execCard = document.getElementById('motor-execution-card');
            let x = this.width / 2;
            let y = this.height * 0.62;
            if (execCard && this.panel) {
                const exRect = execCard.getBoundingClientRect();
                const panRect = this.panel.getBoundingClientRect();
                x = exRect.left + exRect.width / 2 - panRect.left;
                y = exRect.top + exRect.height / 2 - panRect.top;
            }

            // Pulso elegante y contenido (máximo radio 160px, color ámbar dorado)
            this.shockwaves.push({
                x: x,
                y: y,
                radius: 10,
                maxRadius: 160,
                color: '#f59e0b',
                alpha: 0.95,
                lineWidth: 3.2,
                speed: 7.5
            });

            this.shockwaves.push({
                x: x,
                y: y,
                radius: 4,
                maxRadius: 95,
                color: '#ffffff',
                alpha: 0.9,
                lineWidth: 2,
                speed: 9
            });

            // 24 micro-chispas de polvo de estrellas dorado
            for (let i = 0; i < 24; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = Math.random() * 3.2 + 1.2;
                this.burstParticles.push({
                    x: x,
                    y: y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed - 0.4,
                    radius: Math.random() * 2.8 + 1.2,
                    color: (i % 2 === 0) ? '#f59e0b' : '#ffffff',
                    alpha: 1.0,
                    life: 1.0,
                    decay: Math.random() * 0.024 + 0.016,
                    isReturningToNucleo: false
                });
            }
        }

        loop(timestamp) {
            if (!this.running) return;

            if (document.hidden || !this.panel || this.panel.style.display === 'none') {
                this.stop();
                return;
            }

            if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                this.stop();
                return;
            }

            const dt = timestamp - (this.lastFrameTime || timestamp);
            this.lastFrameTime = timestamp;

            const bgCtx = this.bgCtx;
            const frontCtx = this.frontCtx;
            const width = this.width;
            const height = this.height;

            // 1. Renderizado en Canvas de Fondo
            if (bgCtx) {
                bgCtx.clearRect(0, 0, width, height);

                // A. Red de Conexiones entre Motores (incluye Connection Surge)
                this._drawMotorConnections(bgCtx);

                // B. Partículas Cósmicas de Fondo
                this._drawBackgroundParticles(bgCtx, width, height);

                // C. Palabras flotantes ambientales de fondo
                this._drawFloatingWords(bgCtx, width, height);
            }

            // 2. Renderizado en Canvas Frontal (Efectos de Alto Impacto)
            if (frontCtx) {
                frontCtx.clearRect(0, 0, width, height);

                // A. Ondas de Choque (Shockwaves)
                this._drawShockwaves(frontCtx);

                // B. Pulsos en el Núcleo IDEA al absorber energía
                this._drawNucleoPulses(frontCtx);

                // C. Ráfagas de Partículas (expansión y retorno al núcleo)
                this._drawBursts(frontCtx);

                // D. "Ideas Volando" emergentes de la explosión (frontales sobre tarjetas)
                this._drawForegroundWords(frontCtx);

                // E. Modo Núcleo Activo (Vórtice Orbital durante Procesamiento IA)
                if (this.isProcessing) {
                    this._drawProcessingVortex(frontCtx);
                }
            }

            this.rafId = requestAnimationFrame(this.loop);
        }

        _drawBackgroundParticles(ctx, width, height) {
            for (let i = 0; i < this.particles.length; i++) {
                const p = this.particles[i];

                p.twinklePhase += p.twinkleSpeed;
                p.alpha = p.baseAlpha + Math.sin(p.twinklePhase) * 0.15;
                if (p.alpha < 0.08) p.alpha = 0.08;

                p.phase += p.oscFreq;
                p.x += p.vx + Math.sin(p.phase) * p.oscAmp;
                p.y += p.vy;

                if (p.x < -15) p.x = width + 15;
                if (p.x > width + 15) p.x = -15;
                if (p.y < -15) p.y = height + 15;
                if (p.y > height + 15) p.y = -15;

                ctx.save();
                ctx.globalAlpha = p.alpha;
                ctx.fillStyle = p.color;
                ctx.shadowColor = p.color;
                ctx.shadowBlur = p.radius * 3;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();

                // Conexiones de filamentos entre partículas cercanas
                for (let j = i + 1; j < this.particles.length; j++) {
                    const p2 = this.particles[j];
                    const dx = p.x - p2.x;
                    const dy = p.y - p2.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < 78) {
                        ctx.save();
                        const lineAlpha = (1 - dist / 78) * 0.09;
                        ctx.globalAlpha = lineAlpha;
                        ctx.strokeStyle = p.color;
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(p.x, p.y);
                        ctx.lineTo(p2.x, p2.y);
                        ctx.stroke();
                        ctx.restore();
                    }
                }
            }
        }

        _drawFloatingWords(ctx, width, height) {
            this.wordSpawnTimer++;
            const maxWords = window.innerWidth < 640 ? 3 : 6;
            if (this.wordSpawnTimer > 90 && this.words.length < maxWords) {
                this.spawnFloatingWord();
                this.wordSpawnTimer = 0;
            }

            for (let i = this.words.length - 1; i >= 0; i--) {
                const w = this.words[i];
                w.age++;

                if (w.state === 'fade-in') {
                    w.alpha += 0.018;
                    if (w.alpha >= w.maxAlpha) {
                        w.alpha = w.maxAlpha;
                        w.state = 'floating';
                    }
                } else if (w.state === 'floating') {
                    if (w.age >= w.life) {
                        w.state = 'fade-out';
                    }
                } else if (w.state === 'fade-out') {
                    w.alpha -= 0.015;
                    if (w.alpha <= 0) {
                        this.words.splice(i, 1);
                        continue;
                    }
                }

                w.x += w.vx;
                w.y += w.vy;

                ctx.save();
                ctx.globalAlpha = Math.max(0, w.alpha);
                ctx.font = `800 ${Math.round(14 * w.scale)}px 'Poppins', sans-serif`;
                ctx.fillStyle = w.color;
                ctx.shadowColor = w.color;
                ctx.shadowBlur = 8;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                ctx.translate(w.x, w.y);
                ctx.rotate(w.rotation + Math.sin(w.age * 0.025) * 0.05);
                ctx.fillText(w.text, 0, 0);
                ctx.restore();
            }
        }

        _drawMotorConnections(ctx) {
            const cards = document.querySelectorAll('.motor-select-card');
            const nucleo = document.getElementById('universo-nucleo-idea');
            if (cards.length < 2 || !this.panel) return;

            const panelRect = this.panel.getBoundingClientRect();
            const centers = [];
            cards.forEach(card => {
                const r = card.getBoundingClientRect();
                const mKey = card.getAttribute('data-motor');
                centers.push({
                    key: mKey,
                    x: r.left + r.width / 2 - panelRect.left,
                    y: r.top + r.height / 2 - panelRect.top,
                    color: card.style.getPropertyValue('--motor-color') || '#8b5cf6'
                });
            });

            ctx.save();

            // 1. Filamentos en reposo entre motores
            for (let i = 0; i < centers.length; i++) {
                for (let j = i + 1; j < centers.length; j++) {
                    const c1 = centers[i];
                    const c2 = centers[j];
                    const dx = c1.x - c2.x;
                    const dy = c1.y - c2.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist > 70 && dist < 340) {
                        const lineAlpha = (1 - dist / 340) * 0.12;
                        ctx.globalAlpha = lineAlpha;
                        ctx.strokeStyle = c1.color;
                        ctx.lineWidth = 1.2;
                        ctx.setLineDash([5, 8]);
                        ctx.beginPath();
                        ctx.moveTo(c1.x, c1.y);
                        ctx.lineTo(c2.x, c2.y);
                        ctx.stroke();
                    }
                }
            }

            // 2. Conexiones radiales hacia el Núcleo IDEA en reposo
            let nX = this.width / 2;
            let nY = 130;
            if (nucleo) {
                const nRect = nucleo.getBoundingClientRect();
                nX = nRect.left + nRect.width / 2 - panelRect.left;
                nY = nRect.top + nRect.height / 2 - panelRect.top;

                centers.forEach(c => {
                    const dx = c.x - nX;
                    const dy = c.y - nY;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < 450) {
                        const lineAlpha = (1 - dist / 450) * 0.10;
                        ctx.globalAlpha = lineAlpha;
                        ctx.strokeStyle = '#8b5cf6';
                        ctx.lineWidth = 1;
                        ctx.setLineDash([3, 7]);
                        ctx.beginPath();
                        ctx.moveTo(nX, nY);
                        ctx.lineTo(c.x, c.y);
                        ctx.stroke();
                    }
                });
            }

            // 3. ILUMINACIÓN BRILLANTE DE CONEXIONES DURANTE LA EXPLOSIÓN (Connection Surge)
            if (this.connectionSurge && this.connectionSurge.active) {
                const surge = this.connectionSurge;
                surge.progress += surge.speed;
                const surgeAlpha = Math.max(0, (1 - surge.progress) * 0.88);

                ctx.setLineDash([]);
                ctx.lineWidth = 2.4;
                ctx.strokeStyle = surge.color;
                ctx.shadowColor = surge.color;
                ctx.shadowBlur = 14;

                // Líneas radiantes hacia todos los demás motores
                centers.forEach(c => {
                    if (c.key !== surge.sourceKey) {
                        ctx.globalAlpha = surgeAlpha * 0.8;
                        ctx.beginPath();
                        ctx.moveTo(surge.sourceX, surge.sourceY);
                        ctx.lineTo(c.x, c.y);
                        ctx.stroke();

                        // Fotón / paquete de energía viajando hacia el motor destino
                        const photonX = surge.sourceX + (c.x - surge.sourceX) * surge.progress;
                        const photonY = surge.sourceY + (c.y - surge.sourceY) * surge.progress;

                        ctx.globalAlpha = surgeAlpha;
                        ctx.fillStyle = '#ffffff';
                        ctx.beginPath();
                        ctx.arc(photonX, photonY, 4, 0, Math.PI * 2);
                        ctx.fill();
                    }
                });

                // Línea de alta energía hacia el Núcleo IDEA
                ctx.globalAlpha = surgeAlpha;
                ctx.beginPath();
                ctx.moveTo(surge.sourceX, surge.sourceY);
                ctx.lineTo(nX, nY);
                ctx.stroke();

                const corePhotonX = surge.sourceX + (nX - surge.sourceX) * surge.progress;
                const corePhotonY = surge.sourceY + (nY - surge.sourceY) * surge.progress;
                ctx.fillStyle = '#f59e0b';
                ctx.beginPath();
                ctx.arc(corePhotonX, corePhotonY, 5, 0, Math.PI * 2);
                ctx.fill();

                if (surge.progress >= 1) {
                    surge.active = false;
                }
            }

            ctx.restore();
        }

        _drawShockwaves(ctx) {
            for (let i = this.shockwaves.length - 1; i >= 0; i--) {
                const sw = this.shockwaves[i];
                sw.radius += sw.speed;
                sw.alpha -= 0.022;

                if (sw.radius >= sw.maxRadius || sw.alpha <= 0) {
                    this.shockwaves.splice(i, 1);
                    continue;
                }

                ctx.save();
                ctx.globalAlpha = Math.max(0, sw.alpha);
                ctx.strokeStyle = sw.color;
                ctx.lineWidth = sw.lineWidth;
                ctx.shadowColor = sw.color;
                ctx.shadowBlur = 18;
                ctx.beginPath();
                ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            }
        }

        _drawNucleoPulses(ctx) {
            for (let i = this.nucleoPulses.length - 1; i >= 0; i--) {
                const np = this.nucleoPulses[i];
                np.radius += 2.2;
                np.alpha -= 0.035;

                if (np.radius >= np.maxRadius || np.alpha <= 0) {
                    this.nucleoPulses.splice(i, 1);
                    continue;
                }

                ctx.save();
                ctx.globalAlpha = Math.max(0, np.alpha);
                ctx.strokeStyle = np.color;
                ctx.lineWidth = 2.5;
                ctx.shadowColor = np.color;
                ctx.shadowBlur = 14;
                ctx.beginPath();
                ctx.arc(np.x, np.y, np.radius, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            }
        }

        _drawBursts(ctx) {
            const nucleoEl = document.getElementById('universo-nucleo-idea');

            for (let i = this.burstParticles.length - 1; i >= 0; i--) {
                const bp = this.burstParticles[i];

                if (bp.isReturningToNucleo && bp.targetX && bp.targetY) {
                    // Atracción gravitatoria hacia el Núcleo IDEA
                    const dx = bp.targetX - bp.x;
                    const dy = bp.targetY - bp.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist > 24) {
                        bp.vx += (dx / dist) * 0.85;
                        bp.vy += (dy / dist) * 0.85;
                    } else {
                        // Al llegar al Núcleo IDEA: absorbida y genera onda dorada en el núcleo
                        this.nucleoPulses.push({
                            x: bp.targetX,
                            y: bp.targetY,
                            radius: 12,
                            maxRadius: 55,
                            alpha: 0.8,
                            color: '#f59e0b'
                        });

                        if (nucleoEl) {
                            nucleoEl.classList.remove('nucleo-pulse-active');
                            void nucleoEl.offsetWidth;
                            nucleoEl.classList.add('nucleo-pulse-active');
                        }

                        this.burstParticles.splice(i, 1);
                        continue;
                    }
                }

                bp.vx *= 0.965;
                bp.vy *= 0.965;
                bp.x += bp.vx;
                bp.y += bp.vy;
                bp.life -= bp.decay;

                if (bp.life <= 0) {
                    this.burstParticles.splice(i, 1);
                    continue;
                }

                ctx.save();
                ctx.globalAlpha = Math.max(0, bp.life * 0.95);
                ctx.fillStyle = bp.color;
                ctx.shadowColor = bp.color;
                ctx.shadowBlur = bp.isReturningToNucleo ? 12 : 8;
                ctx.beginPath();
                ctx.arc(bp.x, bp.y, bp.radius * bp.life, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        }

        _drawForegroundWords(ctx) {
            for (let i = this.foregroundWords.length - 1; i >= 0; i--) {
                const w = this.foregroundWords[i];
                w.age++;

                if (w.state === 'emerging') {
                    w.scale += (w.targetScale - w.scale) * 0.12;
                    w.alpha += 0.08;
                    if (w.alpha >= w.maxAlpha) {
                        w.alpha = w.maxAlpha;
                        w.state = 'floating';
                    }
                } else if (w.state === 'floating') {
                    if (w.age >= w.life) {
                        w.state = 'dissolving';
                    }
                } else if (w.state === 'dissolving') {
                    w.alpha -= 0.02;
                    w.scale += 0.005;
                    if (w.alpha <= 0) {
                        this.foregroundWords.splice(i, 1);
                        continue;
                    }
                }

                w.vx *= 0.982;
                w.vy *= 0.982;
                w.x += w.vx;
                w.y += w.vy + Math.sin(w.age * 0.03) * 0.25;

                ctx.save();
                ctx.globalAlpha = Math.max(0, w.alpha);

                const fontSize = Math.round(13 * w.scale);
                ctx.font = `800 ${fontSize}px 'Poppins', sans-serif`;
                const textMetrics = ctx.measureText(w.text);
                const textW = textMetrics.width;
                const textH = fontSize * 1.2;
                const pillPaddingX = 14 * w.scale;
                const pillPaddingY = 6 * w.scale;
                const pillW = textW + pillPaddingX * 2;
                const pillH = textH + pillPaddingY * 2;
                const pillRadius = pillH / 2;

                ctx.translate(w.x, w.y);
                ctx.rotate(w.rotation);

                // Pastilla translúcida estética que da legibilidad cristalina sobre las tarjetas
                ctx.shadowColor = w.color;
                ctx.shadowBlur = 14;
                ctx.fillStyle = 'rgba(255, 255, 255, 0.90)';
                ctx.strokeStyle = w.color;
                ctx.lineWidth = 1.6;

                ctx.beginPath();
                if (typeof ctx.roundRect === 'function') {
                    ctx.roundRect(-pillW / 2, -pillH / 2, pillW, pillH, pillRadius);
                } else {
                    ctx.rect(-pillW / 2, -pillH / 2, pillW, pillH);
                }
                ctx.fill();
                ctx.stroke();

                // Tipografía nítida en el color del concepto
                ctx.shadowBlur = 6;
                ctx.fillStyle = w.color;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(w.text, 0, 1);

                ctx.restore();
            }
        }

        _drawProcessingVortex(ctx) {
            this.processingTime += 0.05;
            const execCard = document.getElementById('motor-execution-card');
            let cx = this.width / 2;
            let cy = this.height * 0.65;
            if (execCard && this.panel) {
                const exRect = execCard.getBoundingClientRect();
                const panRect = this.panel.getBoundingClientRect();
                cx = exRect.left + exRect.width / 2 - panRect.left;
                cy = exRect.top + exRect.height / 2 - panRect.top;
            }

            const motorDef = PALETA_MOTORES[this.processingMotorKey] || PALETA_MOTORES.explorador;

            ctx.save();
            for (let ring = 1; ring <= 4; ring++) {
                const radius = 50 * ring + Math.sin(this.processingTime * 2.5 + ring) * 10;
                ctx.globalAlpha = 0.35 / ring;
                ctx.strokeStyle = (ring % 2 === 0) ? '#ffffff' : motorDef.color;
                ctx.lineWidth = 2.5;
                ctx.setLineDash([10, 14]);
                ctx.beginPath();
                ctx.arc(cx, cy, radius, this.processingTime * (ring % 2 === 0 ? 1.2 : -1.2), Math.PI * 2 + this.processingTime);
                ctx.stroke();
            }
            ctx.restore();
        }

        start() {
            if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
            if (!this.initialized) {
                this.init();
            }
            if (!this.running) {
                this.running = true;
                this.lastFrameTime = performance.now();
                this.rafId = requestAnimationFrame(this.loop);
            }
        }

        stop() {
            if (this.rafId) {
                cancelAnimationFrame(this.rafId);
                this.rafId = null;
            }
            this.running = false;
        }
    }

    /**
     * =============================================================================
     * MOTOR DE NACIMIENTO DE UNA IDEA (EL FOCO / MOMENTO EUREKA)
     * =============================================================================
     */
    class NacimientoIdeaEngine {
        constructor() {
            this.hero = null;
            this.canvas = null;
            this.ctx = null;
            this.bulb = null;
            this.badge = null;
            this.statusHint = null;
            this.particles = [];
            this.running = false;
            this.rafId = null;
            this.state = 'dormido';
            this.width = 300;
            this.height = 160;
            this.dpr = 1;
            this.initialized = false;

            this.loop = this.loop.bind(this);
            this.resize = this.resize.bind(this);
        }

        init(heroId = 'nacimiento-idea-hero', canvasId = 'foco-particles-canvas') {
            this.hero = document.getElementById(heroId);
            this.canvas = document.getElementById(canvasId);
            this.bulb = document.getElementById('foco-bulb-core');
            this.badge = document.getElementById('eureka-moment-badge');
            this.statusHint = document.getElementById('foco-status-hint');

            if (!this.canvas || !this.bulb) return false;
            this.ctx = this.canvas.getContext('2d');
            this.resize();

            // Click directo en el foco para despertar o detonar Eureka manualmente
            this.bulb.addEventListener('click', () => {
                this.triggerFocoDespertar();
            });

            window.addEventListener('resize', this.resize);

            this.setBulbState('dormido');
            this.start();
            this.initialized = true;
            return true;
        }

        resize() {
            if (!this.canvas || !this.hero) return;
            this.dpr = window.devicePixelRatio || 1;
            const rect = this.hero.getBoundingClientRect();
            this.width = Math.max(rect.width || 300, 200);
            this.height = Math.max(rect.height || 160, 100);

            this.canvas.width = Math.floor(this.width * this.dpr);
            this.canvas.height = Math.floor(this.height * this.dpr);
            this.canvas.style.width = this.width + 'px';
            this.canvas.style.height = this.height + 'px';
            if (this.ctx) {
                this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
            }
        }

        getBulbCenter() {
            if (!this.bulb || !this.hero) return { x: this.width / 2, y: 60 };
            const bRect = this.bulb.getBoundingClientRect();
            const hRect = this.hero.getBoundingClientRect();
            return {
                x: bRect.left + bRect.width / 2 - hRect.left,
                y: bRect.top + bRect.height / 2 - hRect.top
            };
        }

        triggerFocoDespertar() {
            if (!this.bulb) return;
            if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                this.setBulbState('encendido');
                if (this.statusHint) this.statusHint.textContent = '✦ Foco encendido: escribe tu idea para darle vida';
                return;
            }

            // Paso 1: Foco despierta con pulso y halo creciente
            this.setBulbState('despertando');
            if (this.statusHint) {
                this.statusHint.textContent = '✦ Una idea comienza a despertar...';
                this.statusHint.style.color = '#8b5cf6';
            }

            setTimeout(() => {
                // Paso 2: Momento EUREKA (máxima luminosidad, chispas y badge ✦ EUREKA ✦)
                this.setBulbState('eureka');
                const center = this.getBulbCenter();

                // Emisión de chispas estelares doradas y violetas
                for (let i = 0; i < 38; i++) {
                    const angle = Math.random() * Math.PI * 2;
                    const speed = Math.random() * 4.8 + 1.8;
                    this.particles.push({
                        x: center.x,
                        y: center.y,
                        vx: Math.cos(angle) * speed,
                        vy: Math.sin(angle) * speed - 0.5,
                        radius: Math.random() * 2.8 + 1.2,
                        color: (i % 3 === 0) ? '#ffffff' : ((i % 2 === 0) ? '#f59e0b' : '#8b5cf6'),
                        alpha: 1.0,
                        life: 1.0,
                        decay: Math.random() * 0.02 + 0.014
                    });
                }

                if (this.badge) {
                    this.badge.classList.remove('badge-eureka-visible');
                    void this.badge.offsetWidth;
                    this.badge.classList.add('badge-eureka-visible');
                }

                if (this.statusHint) {
                    this.statusHint.textContent = '✦ ¡Eureka! Las posibilidades se abren';
                    this.statusHint.style.color = '#f59e0b';
                }

                // Paso 3: Dispersión suave y foco queda encendido
                setTimeout(() => {
                    this.setBulbState('encendido');
                    if (this.statusHint) {
                        this.statusHint.textContent = '✦ Foco encendido: escribe tu idea para darle vida';
                        this.statusHint.style.color = '#64748b';
                    }
                }, 1350);

            }, 550);
        }

        triggerFocoEscribiendo(campo = 'titulo', longitud = 0) {
            if (!this.bulb) return;
            this.bulb.classList.add('foco-escribiendo');
            clearTimeout(this._writeTimeout);
            this._writeTimeout = setTimeout(() => {
                if (this.bulb) this.bulb.classList.remove('foco-escribiendo');
            }, 280);

            // Generar micro-partículas ascendentes hacia el foco
            if (this.particles.length < 24) {
                const center = this.getBulbCenter();
                this.particles.push({
                    x: center.x + (Math.random() - 0.5) * 70,
                    y: center.y + 35 + Math.random() * 20,
                    vx: (Math.random() - 0.5) * 0.8,
                    vy: -Math.random() * 1.5 - 0.6,
                    radius: Math.random() * 2.2 + 1,
                    color: (campo === 'titulo') ? '#8b5cf6' : '#f59e0b',
                    alpha: 0.85,
                    life: 0.85,
                    decay: 0.022
                });
            }

            if (this.statusHint) {
                if (longitud > 25) {
                    this.statusHint.textContent = '✦ La idea está tomando forma...';
                    this.statusHint.style.color = '#059669';
                } else {
                    this.statusHint.textContent = '✦ Dando forma a tu pensamiento...';
                    this.statusHint.style.color = '#8b5cf6';
                }
            }
        }

        triggerFocoNacimiento() {
            if (!this.bulb) return;
            this.setBulbState('nacimiento');
            const center = this.getBulbCenter();

            // Pequeña explosión de nacimiento: 💡 → ✦ → ✧ → partículas
            for (let i = 0; i < 48; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = Math.random() * 5.2 + 2.0;
                this.particles.push({
                    x: center.x,
                    y: center.y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed - 0.8,
                    radius: Math.random() * 3.4 + 1.4,
                    color: (i % 3 === 0) ? '#ffffff' : ((i % 2 === 0) ? '#10b981' : '#f59e0b'),
                    alpha: 1.0,
                    life: 1.0,
                    decay: Math.random() * 0.018 + 0.012
                });
            }

            if (this.statusHint) {
                this.statusHint.textContent = '✦ ¡Tu Idea acaba de nacer!';
                this.statusHint.style.color = '#10b981';
            }

            setTimeout(() => {
                this.setBulbState('encendido');
            }, 1200);
        }

        setBulbState(newState) {
            if (!this.bulb) return;
            this.bulb.classList.remove('foco-dormido', 'foco-despertando', 'foco-eureka', 'foco-encendido', 'foco-nacimiento');
            this.bulb.classList.add(`foco-${newState}`);
            this.state = newState;
        }

        loop() {
            if (!this.running) return;

            if (this.ctx && this.canvas) {
                this.ctx.clearRect(0, 0, this.width, this.height);

                for (let i = this.particles.length - 1; i >= 0; i--) {
                    const p = this.particles[i];
                    p.x += p.vx;
                    p.y += p.vy;
                    p.life -= p.decay;

                    if (p.life <= 0) {
                        this.particles.splice(i, 1);
                        continue;
                    }

                    this.ctx.save();
                    this.ctx.globalAlpha = Math.max(0, p.life);
                    this.ctx.fillStyle = p.color;
                    this.ctx.shadowColor = p.color;
                    this.ctx.shadowBlur = 8;
                    this.ctx.beginPath();
                    this.ctx.arc(p.x, p.y, p.radius * p.life, 0, Math.PI * 2);
                    this.ctx.fill();
                    this.ctx.restore();
                }
            }

            this.rafId = requestAnimationFrame(this.loop);
        }

        start() {
            if (this.running) return;
            this.running = true;
            this.rafId = requestAnimationFrame(this.loop);
        }

        stop() {
            if (this.rafId) {
                cancelAnimationFrame(this.rafId);
                this.rafId = null;
            }
            this.running = false;
        }
    }

    // Instancias Globales
    window.UniversoCreativo = UniversoCreativoEngine;
    window.universoCreativo = new UniversoCreativoEngine();

    window.NacimientoIdea = NacimientoIdeaEngine;
    window.nacimientoIdea = new NacimientoIdeaEngine();

})(window);
