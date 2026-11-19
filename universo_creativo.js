/**
 * =============================================================================
 * UNIVERSO CREATIVO DE IDEAS (V3: MOTOR DE CAPAS BIDIRECCIONALES)
 * =============================================================================
 * Arquitectura de Doble Canvas (Fondo + Frente):
 * - Canvas Fondo (#universo-vivo-canvas, z-index: 1): Partículas profundas,
 *   red de conexiones orgánicas y palabras flotantes visibles tras el vidrio.
 * - Canvas Frontal (#universo-front-canvas, z-index: 6, pointer-events: none):
 *   Ondas de choque expansivas, ráfagas explosivas 70+, vórtice IA y Flash de Eureka.
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
        explorador: { color: '#6c40f7', palabras: ['EXPLORAR', 'POSIBILIDADES', 'DESCUBRIR'] },
        madurador:  { color: '#059669', palabras: ['CRECER', 'SOLIDEZ', 'TRANSFORMAR'] },
        validador:  { color: '#d97706', palabras: ['COMPROBAR', 'SOLUCIONES', 'CERTEZA'] },
        negocio:    { color: '#0284c7', palabras: ['CREAR VALOR', 'FUTURO', 'SOSTENIBILIDAD'] },
        impacto:    { color: '#16a34a', palabras: ['IMPACTO', 'TRANSFORMAR', 'HUELLA'] },
        proposito:  { color: '#e11d48', palabras: ['PROPÓSITO', 'SENTIDO', 'VALORES'] },
        conector:   { color: '#8b5cf6', palabras: ['CONECTAR', 'SINERGIA', 'ALIANZAS'] },
        ejecutor:   { color: '#ea580c', palabras: ['ACCIÓN', 'CREAR', 'REALIDAD'] }
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
            this.words = [];
            this.networkPhotons = [];

            // Elementos Frente (Efectos de Alto Impacto)
            this.burstParticles = [];
            this.shockwaves = [];

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

            // Población inicial de conceptos flotantes ("Ideas Volando")
            this.words = [];
            const initialWordsCount = window.innerWidth < 640 ? 4 : 7;
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
                    baseAlpha: Math.random() * 0.35 + 0.25, // Mayor luminosidad para ser nítida tras el vidrio
                    alpha: 0.3,
                    twinkleSpeed: Math.random() * 0.03 + 0.015,
                    twinklePhase: Math.random() * Math.PI * 2,
                    vx: (Math.random() - 0.5) * 0.55,
                    vy: -Math.random() * 0.45 - 0.1, // deriva continua ascendente
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
                vx: (Math.random() - 0.5) * 0.45,
                vy: -Math.random() * 0.35 - 0.08,
                scale: Math.random() * 0.3 + 0.9,
                rotation: (Math.random() - 0.5) * 0.1,
                alpha: isInitial ? (Math.random() * 0.3 + 0.2) : 0,
                maxAlpha: Math.random() * 0.35 + 0.35, // Alta legibilidad
                state: isInitial ? 'floating' : 'fade-in',
                life: Math.floor(Math.random() * 180 + 220),
                age: 0
            });
        }

        triggerExplosion(motorKey, originX = null, originY = null) {
            if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

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

            // 1. Doble Onda de Choque Expansiva Frontal
            this.shockwaves.push({
                x: x,
                y: y,
                radius: 12,
                maxRadius: Math.min(this.width, this.height) * 0.55,
                color: color,
                alpha: 1.0,
                lineWidth: 5,
                speed: 10
            });

            this.shockwaves.push({
                x: x,
                y: y,
                radius: 6,
                maxRadius: Math.min(this.width, this.height) * 0.35,
                color: '#ffffff',
                alpha: 0.9,
                lineWidth: 3,
                speed: 14
            });

            // 2. Ráfaga Masiva de Partículas de Alta Energía (70-85 partículas frontales)
            const count = window.innerWidth < 640 ? 45 : 78;
            const nucleoIdea = document.getElementById('universo-nucleo-idea');
            const execCard = document.getElementById('motor-execution-card');
            
            let nucleoX = this.width / 2;
            let nucleoY = 130;
            if (nucleoIdea && this.panel) {
                const nRect = nucleoIdea.getBoundingClientRect();
                const panRect = this.panel.getBoundingClientRect();
                nucleoX = nRect.left + nRect.width / 2 - panRect.left;
                nucleoY = nRect.top + nRect.height / 2 - panRect.top;
            }

            let execX = this.width / 2;
            let execY = this.height * 0.65;
            if (execCard && this.panel) {
                const exRect = execCard.getBoundingClientRect();
                const panRect = this.panel.getBoundingClientRect();
                execX = exRect.left + exRect.width / 2 - panRect.left;
                execY = exRect.top + 30 - panRect.top;
            }

            for (let i = 0; i < count; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = Math.random() * 8.5 + 2.5;
                const attractorChoice = Math.random();
                let isAttracted = false;
                let tx = execX;
                let ty = execY;

                // 25% regresan al núcleo IDEA, 25% van al área de ejecución
                if (attractorChoice < 0.25) {
                    isAttracted = true;
                    tx = nucleoX;
                    ty = nucleoY;
                } else if (attractorChoice < 0.50) {
                    isAttracted = true;
                    tx = execX;
                    ty = execY;
                }

                this.burstParticles.push({
                    x: x,
                    y: y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    radius: Math.random() * 4.2 + 1.8,
                    color: (i % 3 === 0) ? '#ffffff' : color,
                    alpha: 1.0,
                    life: 1.0,
                    decay: Math.random() * 0.016 + 0.012,
                    isAttracted: isAttracted,
                    targetX: tx,
                    targetY: ty
                });
            }

            // 3. Palabras Contextuales del Motor Emergentes
            const wordsPool = motorConfig.palabras || ['IDEAS', 'CREAR', 'INNOVAR'];
            wordsPool.forEach((w, idx) => {
                setTimeout(() => {
                    if (this.running) {
                        const wordX = x + (Math.random() - 0.5) * 140;
                        const wordY = y + (Math.random() - 0.5) * 90;
                        this.words.push({
                            text: w,
                            color: color,
                            x: Math.max(50, Math.min(this.width - 50, wordX)),
                            y: Math.max(50, Math.min(this.height - 50, wordY)),
                            vx: (Math.random() - 0.5) * 0.5,
                            vy: -Math.random() * 0.5 - 0.15,
                            scale: 1.25,
                            rotation: (Math.random() - 0.5) * 0.12,
                            alpha: 0,
                            maxAlpha: 0.6,
                            state: 'fade-in',
                            life: 240,
                            age: 0
                        });
                    }
                }, idx * 100);
            });
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
                // Si culmina el análisis, emitir Destello de Eureka
                this.triggerEurekaFlash(motorKey);
            }
        }

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

            // Destello expansivo dorado y blanco de resolución
            this.shockwaves.push({
                x: x,
                y: y,
                radius: 15,
                maxRadius: Math.min(this.width, this.height) * 0.7,
                color: '#fbbf24',
                alpha: 1.0,
                lineWidth: 6,
                speed: 13
            });

            this.shockwaves.push({
                x: x,
                y: y,
                radius: 5,
                maxRadius: Math.min(this.width, this.height) * 0.5,
                color: '#ffffff',
                alpha: 1.0,
                lineWidth: 4,
                speed: 16
            });

            // Lluvia de destellos dorados y de color
            for (let i = 0; i < 48; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = Math.random() * 5.5 + 2.0;
                this.burstParticles.push({
                    x: x,
                    y: y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    radius: Math.random() * 3.6 + 1.6,
                    color: (i % 2 === 0) ? '#fbbf24' : motorDef.color,
                    alpha: 1.0,
                    life: 1.0,
                    decay: Math.random() * 0.022 + 0.014,
                    isAttracted: false
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

                // A. Red de Conexiones entre Motores y hacia el Núcleo IDEA
                this._drawMotorConnections(bgCtx);

                // B. Partículas Cósmicas de Fondo
                this._drawBackgroundParticles(bgCtx, width, height);

                // C. "Ideas Volando" (Palabras Flotantes en el espacio cósmico)
                this._drawFloatingWords(bgCtx, width, height);
            }

            // 2. Renderizado en Canvas Frontal (Efectos de Alto Impacto)
            if (frontCtx) {
                frontCtx.clearRect(0, 0, width, height);

                // A. Ondas de Choque (Shockwaves)
                this._drawShockwaves(frontCtx);

                // B. Ráfagas Explosivas Frontales
                this._drawBursts(frontCtx);

                // C. Modo Núcleo Activo (Vórtice Orbital durante Procesamiento IA)
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

                // Reposicionamiento suave al cruzar bordes
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
            const maxWords = window.innerWidth < 640 ? 4 : 8;
            if (this.wordSpawnTimer > 75 && this.words.length < maxWords) {
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
                        // Al disolverse genera micro-chispas
                        for (let k = 0; k < 6; k++) {
                            this.burstParticles.push({
                                x: w.x,
                                y: w.y,
                                vx: (Math.random() - 0.5) * 2,
                                vy: (Math.random() - 0.5) * 2,
                                radius: Math.random() * 2 + 1,
                                color: w.color,
                                alpha: 0.7,
                                life: 0.7,
                                decay: 0.025,
                                isAttracted: false
                            });
                        }
                        this.words.splice(i, 1);
                        continue;
                    }
                }

                w.x += w.vx;
                w.y += w.vy;

                // Renderizado con tipografía clara y sombra luminosa
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
                centers.push({
                    x: r.left + r.width / 2 - panelRect.left,
                    y: r.top + r.height / 2 - panelRect.top,
                    color: card.style.getPropertyValue('--motor-color') || '#8b5cf6'
                });
            });

            ctx.save();

            // 1. Filamentos entre motores cercanos
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

            // 2. Conexiones radiales hacia el núcleo IDEA
            if (nucleo) {
                const nRect = nucleo.getBoundingClientRect();
                const nX = nRect.left + nRect.width / 2 - panelRect.left;
                const nY = nRect.top + nRect.height / 2 - panelRect.top;

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

        _drawBursts(ctx) {
            for (let i = this.burstParticles.length - 1; i >= 0; i--) {
                const bp = this.burstParticles[i];

                if (bp.isAttracted && bp.targetX && bp.targetY) {
                    const dx = bp.targetX - bp.x;
                    const dy = bp.targetY - bp.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist > 20) {
                        bp.vx += (dx / dist) * 0.55;
                        bp.vy += (dy / dist) * 0.55;
                    }
                }

                bp.vx *= 0.96;
                bp.vy *= 0.96;
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
                ctx.shadowBlur = 10;
                ctx.beginPath();
                ctx.arc(bp.x, bp.y, bp.radius * bp.life, 0, Math.PI * 2);
                ctx.fill();
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

    // Instancia Singleton Global
    window.UniversoCreativo = UniversoCreativoEngine;
    window.universoCreativo = new UniversoCreativoEngine();

})(window);
