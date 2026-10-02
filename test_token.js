require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');

async function test() {
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const token = await ai.authTokens.create({
            config: {
                uses: 1,
                expireTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
                liveConnectConstraints: {
                    model: 'models/gemini-2.0-flash-exp', // Note: Live API typically uses 2.0-flash-exp for live currently in typical setups, but let's check standard
                    config: {
                        responseModalities: ['AUDIO']
                    }
                }
            }
        });
        console.log("Token:", token.name);
    } catch (e) {
        console.error("Error creating token:", e.message);
    }
}
test();
