1. **Edit index.html to update the payload and handle setupComplete**
   - I will modify `index.html` to change the `realtimeInput` payload structure from `mediaChunks: [...]` to `audio: { mimeType: "audio/pcm;rate=16000", data: base64Data }`.
   - I will add a variable `let isSetupComplete = false;` to track if `setupComplete` has been received.
   - I will update `liveWebSocket.onmessage` to set `isSetupComplete = true` when `response.setupComplete` is received.
   - I will update the `audioWorkletNode.port.onmessage` handler to only send audio if `isSetupComplete` is true.
   - I will add `console.log` statements to log WebSocket errors, Gemini responses, and indicate that PCM audio is being generated and sent.

2. **Verify changes in index.html**
   - I will use `read_file` or `cat` to inspect `index.html` and verify that my edits for payload structure, `setupComplete` handling, and diagnostic logs were correctly applied.

3. **Run tests**
   - I will execute `npm test` or `node test.js` to ensure the application still passes tests and check for regressions.

4. **Complete pre-commit steps**
   - Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.

5. **Submit the change**
   - Once everything is verified and tests pass, I will submit the change on a new branch with a descriptive commit message.
