# Propuesta de Animación para el Avatar Estático de Idealita

Dado que el avatar actual (`img/idealita-avatar-new.png`) es una imagen estática (PNG), las animaciones nativas SVG (como la sincronización labial exacta mediante manipulación de paths, el parpadeo de ojos o el movimiento de brazos) ya no son posibles de forma directa.

Sin embargo, para mantener una experiencia inmersiva y reactiva durante las sesiones de Gemini Live, se pueden aplicar las siguientes técnicas sobre la imagen estática:

## 1. Animaciones basadas en CSS (Implementadas actualmente)
*   **Hologram Float (Flotación):** La imagen tiene una animación CSS continua (`hologram-float`) que traslada el elemento en el eje Y suavemente para simular que está levitando, lo cual va acorde con la temática holográfica.
*   **State Modifiers (Brillo reactivo):**
    *   **Estado de Escucha (`state-listening`):** Se aplica un `drop-shadow` de color morado/azulado.
    *   **Estado Hablando (`state-speaking`):** Se aplica un `drop-shadow` intenso color cyan.

## 2. Propuestas de Animación Avanzada (Para desarrollo futuro)

### A. CSS Transforms Reactivos (Escala y Pulso)
Podemos reactivar el bucle de renderizado `globalAnimateAvatar()` en `index.html` para modificar dinámicamente las propiedades CSS de la imagen basándonos en la amplitud de la voz (volumen):
```javascript
// Ejemplo conceptual dentro de globalAnimateAvatar()
const scale = 1 + (average / 255) * 0.1; // Crece un máximo del 10%
const avatarImg = document.getElementById('idealita-hologram');
avatarImg.style.transform = `translateY(-5px) scale(${scale})`;
```

### B. Múltiples Imágenes (Sprite Sheet / Intercambio de Frames)
Para simular el habla de forma más realista, se requeriría el diseño de 2 a 4 variantes de la imagen PNG:
1.  Boca cerrada (Reposo)
2.  Boca ligeramente abierta
3.  Boca abierta (Vocalizando)
4.  Ojos cerrados (Parpadeo)

**Implementación:**
*   **Parpadeo:** Se puede usar `setInterval` para intercambiar aleatoriamente entre la imagen normal y la imagen con los ojos cerrados durante 100-200ms.
*   **Habla:** Dentro del analizador de audio (`globalAnimateAvatar`), dependiendo del nivel de amplitud del sonido, se intercambia la fuente (`src`) de la imagen o se ajusta el `background-position` de un sprite sheet para mostrar las diferentes formas de la boca.

### C. Live2D / WebGL (Solución Óptima a Largo Plazo)
Si se desea recuperar la interactividad y la sincronización labial completa conservando el diseño oficial:
*   La imagen PNG debe ser segmentada (cortar la boca, ojos, cabello, cabeza) por un artista.
*   Las partes se ensamblan usando una librería como **PixiJS** (con mallas 2D) o **Live2D Cubism**.
*   El analizador de audio de la Web Audio API alimentaría los parámetros del modelo Live2D (ej. `ParamMouthOpenY`) para abrir y cerrar la boca en sincronía con el audio, además de permitir seguir el ratón o reaccionar a eventos.