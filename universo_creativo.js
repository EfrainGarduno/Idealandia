/**
 * =============================================================================
 * UNIVERSO CREATIVO DE IDEAS (V2: EXPLOSIÓN CREATIVA)
 * =============================================================================
 * Sistema modular Canvas 2D de alta energía, elegancia y dinamismo.
 * Componentes:
 * 1. Campo de Partículas Cósmicas Multidimensionales.
 * 2. "Ideas Volando": Conceptos flotantes con ciclo de vida orgánico.
 * 3. Red de Conexiones Luminosas y pulsos de fotones entre motores.
 * 4. Explosión de Activación multidireccional con atracción magnética.
 * 5. Núcleo Creativo de Procesamiento (Vórtice energético durante llamada IA).
 * 6. Destello de Revelación (Flash de Eureka al recibir respuesta).
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
            this.canvas = null;
            this.ctx = null;
            this.panel = null;
            this.rafId = null;
            this.initialized = false;
            this.running = false;

            // Capas del Universo Creativo
            this.particles = [];
            this.words = [];
            this.burstParticles = [];
            this.shockwaves = [];
            this.networkPhotons = [];

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

        init(canvasId = 'universo-vivo-canvas', panelId = 'workspace-panel-motores') {
            this.canvas = document.getElementById(canvasId);
            this.panel = document.getElementById(panelId);
            if (!this.canvas || !this.panel) return false;

            this.ctx = this.canvas.getContext('2d');
            this.resize();

            // Poblar partículas iniciales
            this._seedParticles();

            // Poblar primeras palabras flotantes
            this.words = [];
            const initialWordsCount = window.innerWidth < 640 ? 3 : 5;
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
            if (!this.canvas || !this.panel) return;
            this.dpr = window.devicePixelRatio || 1;
            const rect = this.panel.getBoundingClientRect();
            this.width = Math.max(rect.width || this.panel.offsetWidth || 320, 320);
            this.height = Math.max(rect.height || this.panel.offsetHeight || 500, 500);

            this.canvas.width = Math.floor(this.width * this.dpr);
            this.canvas.height = Math.floor(this.height * this.dpr);
            this.canvas.style.width = this.width + 'px';
            this.canvas.style.height = this.height + 'px';

            this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        }

        _seedParticles() {
            const isMobile = window.innerWidth < 640;
            const count = isMobile ? 32 : 58;
            const colors = [
                '#6c40f7', '#059669', '#d97706', '#0284c7',
                '#16a34a', '#e11d48', '#8b5cf6', '#ea580c'
            ];

            this.particles = [];
            for (let i = 0; i < count; i++) {
                this.particles.push({
                    x: Math.random() * this.width,
                    y: Math.random() * this.height,
                    radius: Math.random() * 2.8 + 1.2,
                    depth: Math.random() * 0.8 + 0.2, // 0.2 (fondo) a 1.0 (primer plano)
                    color: colors[Math.floor(Math.random() * colors.length)],
                    baseAlpha: Math.random() * 0.28 + 0.14,
                    alpha: 0.2,
                    twinkleSpeed: Math.random() * 0.025 + 0.015,
                    twinklePhase: Math.random() * Math.PI * 2,
                    vx: (Math.random() - 0.5) * 0.45,
                    vy: -Math.random() * 0.35 - 0.08, // suave deriva ascendente
                    oscFreq: Math.random() * 0.018 + 0.008,
                    oscAmp: Math.random() * 0.5 + 0.2,
                    phase: Math.random() * Math.PI * 2
                });
            }
        }

        spawnFloatingWord(explicitText = null, isInitial = false) {
            const text = explicitText || PALABRAS_CREATIVAS[Math.floor(Math.random() * PALABRAS_CREATIVAS.length)];
            const colors = ['#6c40f7', '#059669', '#d97706', '#0284c7', '#8b5cf6', '#e11d48', '#4338ca'];
            const color = colors[Math.floor(Math.random() * colors.length)];

            const padding = 60;
            const x = padding + Math.random() * Math.max(this.width - padding * 2, 100);
            const y = padding + Math.random() * Math.max(this.height - padding * 2, 100);

            this.words.push({
                text: text,
                color: color,
                x: x,
                y: y,
                vx: (Math.random() - 0.5) * 0.35,
                vy: -Math.random() * 0.3 - 0.05,
                scale: Math.random() * 0.25 + 0.85,
                rotation: (Math.random() - 0.5) * 0.08, // radianes suaves
                alpha: isInitial ? (Math.random() * 0.2 + 0.1) : 0,
                maxAlpha: Math.random() * 0.22 + 0.18,
                state: isInitial ? 'floating' : 'fade-in',
                life: Math.floor(Math.random() * 160 + 200),
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

            // 1. Onda de Choque Expansiva (Shockwave)
            this.shockwaves.push({
                x: x,
                y: y,
                radius: 10,
                maxRadius: Math.min(this.width, this.height) * 0.45,
                color: color,
                alpha: 0.9,
                lineWidth: 4,
                speed: 8.5
            });

            // 2. Ráfaga de Partículas de Alta Energía (50-70 partículas)
            const count = window.innerWidth < 640 ? 38 : 64;
            const execCard = document.getElementById('motor-execution-card');
            let targetX = this.width / 2;
            let targetY = this.height * 0.65;
            if (execCard && this.panel) {
                const exRect = execCard.getBoundingClientRect();
                const panRect = this.panel.getBoundingClientRect();
                targetX = exRect.left + exRect.width / 2 - panRect.left;
                targetY = exRect.top + 30 - panRect.top;
            }

            for (let i = 0; i < count; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = Math.random() * 6.5 + 2.0;
                const isAttracted = (Math.random() < 0.35); // 35% viajan hacia el núcleo ejecutor

                this.burstParticles.push({
                    x: x,
                    y: y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    radius: Math.random() * 3.5 + 1.5,
                    color: color,
                    alpha: 1.0,
                    life: 1.0,
                    decay: Math.random() * 0.018 + 0.012,
                    isAttracted: isAttracted,
                    targetX: targetX,
                    targetY: targetY,
                    trail: []
                });
            }

            // 3. Palabras de Activación Específicas del Motor
            const wordsPool = motorConfig.palabras || ['IDEAS', 'CREAR', 'INNOVAR'];
            wordsPool.forEach((w, idx) => {
                setTimeout(() => {
                    if (this.running) {
                        const wordX = x + (Math.random() - 0.5) * 120;
                        const wordY = y + (Math.random() - 0.5) * 80;
                        this.words.push({
                            text: w,
                            color: color,
                            x: Math.max(40, Math.min(this.width - 40, wordX)),
                            y: Math.max(40, Math.min(this.height - 40, wordY)),
                            vx: (Math.random() - 0.5) * 0.4,
                            vy: -Math.random() * 0.4 - 0.1,
                            scale: 1.15,
                            rotation: (Math.random() - 0.5) * 0.1,
                            alpha: 0,
                            maxAlpha: 0.45,
                            state: 'fade-in',
                            life: 220,
                            age: 0
                        });
                    }
                }, idx * 120);
            });
        }

        setProcessingMode(active, motorKey = 'explorador') {
            this.isProcessing = !!active;
            this.processingMotorKey = motorKey;
            this.processingTime = 0;

            const execCard = document.getElementById('motor-execution-card');
            if (execCard) {
                if (active) {
                    execCard.classList.add('motor-execution-processing');
                    const motorDef = PALETA_MOTORES[motorKey] || PALETA_MOTORES.explorador;
                    execCard.style.setProperty('--motor-color', motorDef.color);
                    execCard.style.setProperty('--motor-glow', `${motorDef.color}55`);
                } else {
                    execCard.classList.remove('motor-execution-processing');
                }
            }

            // Si culmina el análisis, emitir Destello de Eureka
            if (!active) {
                this.triggerEurekaFlash(motorKey);
            }
        }

        triggerEurekaFlash(motorKey) {
            if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

            const motorDef = PALETA_MOTORES[motorKey] || PALETA_MOTORES.explorador;
            const execCard = document.getElementById('motor-execution-card');
            let x = this.width / 2;
            let y = this.height * 0.6;
            if (execCard && this.panel) {
                const exRect = execCard.getBoundingClientRect();
                const panRect = this.panel.getBoundingClientRect();
                x = exRect.left + exRect.width / 2 - panRect.left;
                y = exRect.top + exRect.height / 2 - panRect.top;
            }

            // Destello expansivo dorado/color
            this.shockwaves.push({
                x: x,
                y: y,
                radius: 15,
                maxRadius: Math.min(this.width, this.height) * 0.6,
                color: '#fbbf24', // Dorado creativo
                alpha: 1.0,
                lineWidth: 5,
                speed: 12
            });

            this.shockwaves.push({
                x: x,
                y: y,
                radius: 5,
                maxRadius: Math.min(this.width, this.height) * 0.45,
                color: motorDef.color,
                alpha: 0.85,
                lineWidth: 3,
                speed: 9
            });

            // Lluvia de microchispas de culminación
            for (let i = 0; i < 35; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = Math.random() * 4.5 + 1.5;
                this.burstParticles.push({
                    x: x,
                    y: y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    radius: Math.random() * 3 + 1.5,
                    color: (i % 2 === 0) ? '#fbbf24' : motorDef.color,
                    alpha: 1.0,
                    life: 1.0,
                    decay: Math.random() * 0.025 + 0.015,
                    isAttracted: false,
                    trail: []
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

            const ctx = this.ctx;
            const width = this.width;
            const height = this.height;

            // Limpieza con estela sutil de persistencia
            ctx.clearRect(0, 0, width, height);

            // 1. Red de Conexiones entre Tarjetas de Motores
            this._drawMotorConnections(ctx);

            // 2. Partículas Cósmicas Ambientales
            this._drawParticles(ctx, width, height);

            // 3. "Ideas Volando" (Palabras Flotantes)
            this._drawFloatingWords(ctx, width, height);

            // 4. Ondas de Choque (Shockwaves)
            this._drawShockwaves(ctx);

            // 5. Partículas Explosivas (Bursts)
            this._drawBursts(ctx);

            // 6. Efecto Vórtice durante Procesamiento IA
            if (this.isProcessing) {
                this._drawProcessingVortex(ctx);
            }

            this.rafId = requestAnimationFrame(this.loop);
        }

        _drawParticles(ctx, width, height) {
            for (let i = 0; i < this.particles.length; i++) {
                const p = this.particles[i];

                p.twinklePhase += p.twinkleSpeed;
                p.alpha = p.baseAlpha + Math.sin(p.twinklePhase) * 0.12;
                if (p.alpha < 0.05) p.alpha = 0.05;

                p.phase += p.oscFreq;
                p.x += p.vx + Math.sin(p.phase) * p.oscAmp;
                p.y += p.vy;

                // Reposicionamiento cíclico continuo
                if (p.x < -15) p.x = width + 15;
                if (p.x > width + 15) p.x = -15;
                if (p.y < -15) p.y = height + 15;
                if (p.y > height + 15) p.y = -15;

                ctx.save();
                ctx.globalAlpha = p.alpha;
                ctx.fillStyle = p.color;
                ctx.shadowColor = p.color;
                ctx.shadowBlur = p.radius * 2;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();

                // Conexiones sinérgicas inter-partículas
                for (let j = i + 1; j < this.particles.length; j++) {
                    const p2 = this.particles[j];
                    const dx = p.x - p2.x;
                    const dy = p.y - p2.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < 72) {
                        ctx.save();
                        const lineAlpha = (1 - dist / 72) * 0.07;
                        ctx.globalAlpha = lineAlpha;
                        ctx.strokeStyle = p.color;
                        ctx.lineWidth = 0.85;
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
            // Manejar spawn continuo de nuevas palabras
            this.wordSpawnTimer++;
            const maxWords = window.innerWidth < 640 ? 4 : 7;
            if (this.wordSpawnTimer > 90 && this.words.length < maxWords) {
                this.spawnFloatingWord();
                this.wordSpawnTimer = 0;
            }

            for (let i = this.words.length - 1; i >= 0; i--) {
                const w = this.words[i];
                w.age++;

                // Transiciones de estado
                if (w.state === 'fade-in') {
                    w.alpha += 0.015;
                    if (w.alpha >= w.maxAlpha) {
                        w.alpha = w.maxAlpha;
                        w.state = 'floating';
                    }
                } else if (w.state === 'floating') {
                    if (w.age >= w.life) {
                        w.state = 'fade-out';
                    }
                } else if (w.state === 'fade-out') {
                    w.alpha -= 0.012;
                    if (w.alpha <= 0) {
                        // Generar micro-chispas al desvanecerse
                        for (let k = 0; k < 5; k++) {
                            this.burstParticles.push({
                                x: w.x,
                                y: w.y,
                                vx: (Math.random() - 0.5) * 1.5,
                                vy: (Math.random() - 0.5) * 1.5,
                                radius: Math.random() * 1.8 + 1,
                                color: w.color,
                                alpha: 0.6,
                                life: 0.6,
                                decay: 0.025,
                                isAttracted: false,
                                trail: []
                            });
                        }
                        this.words.splice(i, 1);
                        continue;
                    }
                }

                w.x += w.vx;
                w.y += w.vy;

                // Renderizado elegante de la palabra
                ctx.save();
                ctx.globalAlpha = Math.max(0, w.alpha);
                ctx.font = `700 ${Math.round(13 * w.scale)}px 'Poppins', sans-serif`;
                ctx.fillStyle = w.color;
                ctx.shadowColor = w.color;
                ctx.shadowBlur = 6;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                ctx.translate(w.x, w.y);
                ctx.rotate(w.rotation + Math.sin(w.age * 0.02) * 0.04);
                ctx.fillText(w.text, 0, 0);
                ctx.restore();
            }
        }

        _drawMotorConnections(ctx) {
            const cards = document.querySelectorAll('.motor-select-card');
            if (cards.length < 2 || !this.panel) return;

            const panelRect = this.panel.getBoundingClientRect();
            const centers = [];
            cards.forEach(card => {
                const r = card.getBoundingClientRect();
                centers.push({
                    x: r.left + r.width / 2 - panelRect.left,
                    y: r.top + r.height / 2 - panelRect.top,
                    key: card.dataset.motor
                });
            });

            // Dibujar líneas de sinergia entre motores cercanos con pulsos
            ctx.save();
            for (let i = 0; i < centers.length; i++) {
                for (let j = i + 1; j < centers.length; j++) {
                    const c1 = centers[i];
                    const c2 = centers[j];
                    const dx = c1.x - c2.x;
                    const dy = c1.y - c2.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    // Conectar motores adyacentes en la matriz
                    if (dist > 80 && dist < 320) {
                        const lineAlpha = (1 - dist / 320) * 0.06;
                        ctx.globalAlpha = lineAlpha;
                        ctx.strokeStyle = '#8b5cf6';
                        ctx.lineWidth = 1;
                        ctx.setLineDash([4, 6]);
                        ctx.beginPath();
                        ctx.moveTo(c1.x, c1.y);
                        ctx.lineTo(c2.x, c2.y);
                        ctx.stroke();
                    }
                }
            }
            ctx.restore();
        }

        _drawShockwaves(ctx) {
            for (let i = this.shockwaves.length - 1; i >= 0; i--) {
                const sw = this.shockwaves[i];
                sw.radius += sw.speed;
                sw.alpha -= 0.025;

                if (sw.radius >= sw.maxRadius || sw.alpha <= 0) {
                    this.shockwaves.splice(i, 1);
                    continue;
                }

                ctx.save();
                ctx.globalAlpha = Math.max(0, sw.alpha);
                ctx.strokeStyle = sw.color;
                ctx.lineWidth = sw.lineWidth;
                ctx.shadowColor = sw.color;
                ctx.shadowBlur = 12;
                ctx.beginPath();
                ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            }
        }

        _drawBursts(ctx) {
            for (let i = this.burstParticles.length - 1; i >= 0; i--) {
                const bp = this.burstParticles[i];

                // Atracción magnética hacia el área de ejecución
                if (bp.isAttracted && bp.targetX && bp.targetY) {
                    const dx = bp.targetX - bp.x;
                    const dy = bp.targetY - bp.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist > 15) {
                        bp.vx += (dx / dist) * 0.45;
                        bp.vy += (dy / dist) * 0.45;
                    }
                }

                bp.vx *= 0.97;
                bp.vy *= 0.97;
                bp.x += bp.vx;
                bp.y += bp.vy;
                bp.life -= bp.decay;

                if (bp.life <= 0) {
                    this.burstParticles.splice(i, 1);
                    continue;
                }

                ctx.save();
                ctx.globalAlpha = Math.max(0, bp.life * 0.85);
                ctx.fillStyle = bp.color;
                ctx.shadowColor = bp.color;
                ctx.shadowBlur = 8;
                ctx.beginPath();
                ctx.arc(bp.x, bp.y, bp.radius * bp.life, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        }

        _drawProcessingVortex(ctx) {
            this.processingTime += 0.04;
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

            // Anillos en vórtice orbital
            ctx.save();
            for (let ring = 1; ring <= 3; ring++) {
                const radius = 45 * ring + Math.sin(this.processingTime * 2 + ring) * 8;
                ctx.globalAlpha = 0.22 / ring;
                ctx.strokeStyle = motorDef.color;
                ctx.lineWidth = 2;
                ctx.setLineDash([8, 12]);
                ctx.beginPath();
                ctx.arc(cx, cy, radius, this.processingTime * (ring % 2 === 0 ? 1 : -1), Math.PI * 2 + this.processingTime);
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
