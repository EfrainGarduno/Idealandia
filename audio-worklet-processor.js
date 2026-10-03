class PCMProcessor extends AudioWorkletProcessor {
    process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (input.length > 0) {
            const channelData = input[0];
            const pcmData = new Int16Array(channelData.length);
            for (let i = 0; i < channelData.length; i++) {
                // Convert float [-1, 1] to Int16 [-32768, 32767]
                let s = Math.max(-1, Math.min(1, channelData[i]));
                pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }
            // Send the Int16 buffer to the main thread
            this.port.postMessage(pcmData.buffer, [pcmData.buffer]);
        }
        return true;
    }
}

registerProcessor('pcm-processor', PCMProcessor);
