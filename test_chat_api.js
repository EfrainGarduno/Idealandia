const assert = require('assert');

// We are going to mock Gemini so we can test the API.
const { GoogleGenAI } = require('@google/genai');

const originalCreate = GoogleGenAI.prototype.chats;
let recordedMessages = [];
GoogleGenAI.prototype.chats = {
    create: function() {
        return {
             sendMessage: async (input) => {
                 recordedMessages.push(input);
                 if (input && input.message && typeof input.message === 'string') {
                      return { text: "Respuesta mockeada message text", functionCalls: [{ name: "consultar_documentacion", id: "123", args: { tema: "pension" } }] };
                 } else if (input && input.message && Array.isArray(input.message)) {
                      return { text: "Respuesta mockeada message array tool" };
                 }
                 return { text: "Respuesta por defecto" };
             }
        }
    }
};

const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const app = express();
app.use(bodyParser.json());
app.use(cookieParser());

const pool = require('mysql2/promise').createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'test',
});


app.post('/api/chat', async (req, res) => {
    try {
        let text = req.body.text;
        if (!text) {
            return res.status(400).json({ error: 'Text field is required' });
        }

        const ai = new GoogleGenAI({apiKey: 'mock'});
        ai.chats = GoogleGenAI.prototype.chats; // Ensure mock is picked up
        const chat = ai.chats.create({model: 'mock'});

        let response = await chat.sendMessage({ message: text });
        let responseText = "";

        if (response.functionCalls && response.functionCalls.length > 0) {
            const calls = response.functionCalls;
            let functionResponses = [];

            for (const call of calls) {
                 functionResponses.push({
                     functionResponse: {
                         id: call.id,
                         name: call.name,
                         response: { result: "mocked tool" }
                     }
                 });
            }
            if (functionResponses.length > 0) {
                 // According to User Instructions, we must use { message: [{ role: 'user', parts: [...] }] } for tools in THIS wrapper.
                 // OR we can wrap the array of functionResponses.
                 response = await chat.sendMessage({ message: [{ role: 'user', parts: functionResponses }] });
            }
        }

        if (response.text) {
             responseText = response.text;
        }

        res.status(200).json({ response: responseText });

    } catch (error) {
        console.error('Error generating response:', error);
        res.status(500).json({ error: 'Error interno del servidor al procesar el mensaje.' });
    }
});

const http = require('http');
const srv = app.listen(3002, () => {
    const textReq = JSON.stringify({ text: 'Hola Idealita' });
    const optionsText = {
      hostname: 'localhost',
      port: 3002,
      path: '/api/chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': textReq.length
      }
    };

    let reqText = http.request(optionsText, res2 => {
         let rawData2 = '';
         res2.on('data', chunk => { rawData2 += chunk; });
         res2.on('end', () => {
             assert.strictEqual(res2.statusCode, 200, "Should return 200 on success.");
             const data2 = JSON.parse(rawData2);
             assert.strictEqual(data2.response, "Respuesta mockeada message array tool");

             // Now test invalid request
             const optionsInvalid = {
               hostname: 'localhost',
               port: 3002,
               path: '/api/chat',
               method: 'POST',
               headers: {
                 'Content-Type': 'application/json',
                 'Content-Length': Buffer.byteLength('{}')
               }
             };
             let reqInvalid = http.request(optionsInvalid, res3 => {
                  let rawData3 = '';
                  res3.on('data', chunk => { rawData3 += chunk; });
                  res3.on('end', () => {
                      assert.strictEqual(res3.statusCode, 400, "Should return 400 for empty text");
                      const data3 = JSON.parse(rawData3);
                      assert.ok(data3.error, "Should have error object");
                      console.log('Success test passed.');
                      srv.close();
                      process.exit(0);
                  });
             });
             reqInvalid.end('{}');
         });
    });
    reqText.on('error', e => {
         console.error(e); process.exit(1);
    });
    reqText.write(textReq);
    reqText.end();
});
