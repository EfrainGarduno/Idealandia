const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8');

const tPartLoop = `                                                // Disable Audio playback if in text mode
                                                if (part.inlineData && !isVoiceMode) {
                                                    // Ignore audio chunks if we are in text mode
                                                    continue;
                                                }`;

const rPartLoop = `                                                // Handle Audio playback for Voice Mode
                                                if (part.inlineData && part.inlineData.mimeType.startsWith('audio/pcm')) {
                                                    if (!isVoiceMode) continue;

                                                    updateLiveStatus("Hablando...");
                                                    playPcmAudio(part.inlineData.data);
                                                }`;

if (html.includes(tPartLoop)) {
    html = html.replace(tPartLoop, rPartLoop);
    console.log("Patched inlineData processing inside loop");
}

const stopLiveStr = `            function stopLive() {`;

const playPcmFunc = `
            function playPcmAudio(base64Data) {
                if (!pcmPlaybackContext) return;

                const buffer = base64ToArrayBuffer(base64Data);
                const int16Array = new Int16Array(buffer);
                const float32Array = new Float32Array(int16Array.length);

                for (let i = 0; i < int16Array.length; i++) {
                    float32Array[i] = int16Array[i] / 32768.0;
                }

                const audioBuffer = pcmPlaybackContext.createBuffer(1, float32Array.length, 24000);
                audioBuffer.getChannelData(0).set(float32Array);


                const source = pcmPlaybackContext.createBufferSource();
                source.buffer = audioBuffer;

                if (window.avatarAnalyser) {
                    source.connect(window.avatarAnalyser);
                } else {
                    source.connect(pcmPlaybackContext.destination);
                }


                if (nextPlayTime < pcmPlaybackContext.currentTime) {
                    nextPlayTime = pcmPlaybackContext.currentTime;
                }

                source.start(nextPlayTime);
                nextPlayTime += audioBuffer.duration;

                activeAudioSources.push(source);

                source.onended = () => {
                     // Remove source from active array
                     const index = activeAudioSources.indexOf(source);
                     if (index > -1) {
                         activeAudioSources.splice(index, 1);
                     }

                     if(pcmPlaybackContext && activeAudioSources.length === 0 && pcmPlaybackContext.currentTime >= nextPlayTime) {
                          updateLiveStatus("Escuchando...");
                     }
                };
            }

            function stopLive() {`;

if (html.includes(stopLiveStr)) {
    html = html.replace(stopLiveStr, playPcmFunc);
    console.log("Patched playPcmAudio function");
}

// Ensure interrupted playback stops
const tTurnComplete = `                                        // Finish turn logic for text mode
                                        if (content.turnComplete) {`;

const rTurnComplete = `                                        if (content.interrupted === true) {
                                            // Stop all currently playing or scheduled audio
                                            activeAudioSources.forEach(source => {
                                                try { source.stop(); } catch (e) {}
                                            });
                                            activeAudioSources = [];

                                            // Reset the scheduling time to now so new audio plays immediately
                                            if (pcmPlaybackContext) {
                                                nextPlayTime = pcmPlaybackContext.currentTime;
                                            }

                                            updateLiveStatus("Escuchando...");

                                            // Close the transcription bubble immediately
                                            window.currentLiveMessageDiv = null;
                                            window.currentLiveMessageText = '';
                                        }

                                        // Finish turn logic for text mode
                                        if (content.turnComplete) {`;

if (html.includes(tTurnComplete)) {
    html = html.replace(tTurnComplete, rTurnComplete);
    console.log("Patched interrupted logic");
}

fs.writeFileSync('index.html', html);
