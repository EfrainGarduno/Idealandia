const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname));

// Check if API key is provided
if (!process.env.GEMINI_API_KEY) {
    console.error("Warning: GEMINI_API_KEY environment variable not set.");
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const chat = ai.chats.create({ model: 'gemini-2.5-flash' });

app.post('/api/chat', async (req, res) => {
    try {
        const { message } = req.body;
        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        const response = await chat.sendMessage({ message: message });
        const text = response.text;

        res.json({ reply: text });
    } catch (error) {
        console.error('Error in /api/chat:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
