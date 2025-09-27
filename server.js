// server.js
import 'dotenv/config';
import express from 'express';
import { GoogleGenerativeAI } from "@google/generative-ai";
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const port = 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/schedule', async (req, res) => {
  try {
    const { text, timeZone, history } = req.body;

    const systemInstruction = {
      role: "system",
      parts: [{
        text: `You are an expert scheduling assistant. Your goal is to gather all necessary information to schedule an event.
- Today's date is ${new Date().toISOString()}. The user is in the "${timeZone}" timezone.
- You must get a title, a precise start time, a duration, and a list of participants.
- If any information is missing, ask clarifying questions. Be friendly and conversational.
- Once you have ALL the required information (title, when, duration_min, participants), you MUST format your final response as a single valid JSON object, prefixed with the special marker "[DONE]".
- The JSON object must have these exact keys: "title", "when" (in YYYY-MM-DDTHH:mm format), "duration_min" (as a number), and "participants" (as a string).
- Example of a final output: [DONE]{"title": "Team Meeting", "when": "2025-09-28T14:30", "duration_min": 60, "participants": "John, Jane"}
- Do NOT output the "[DONE]" marker until you are absolutely certain you have all the information.`
      }],
    };

    // --- CHANGE IS HERE ---
    // The system instruction is now part of the model's configuration.
   const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash", // ...to this.
  systemInstruction: systemInstruction,
});
    // And the history is now passed by itself, without the system instruction.
    const chat = model.startChat({
      history: history,
    });
    // --- END OF CHANGE ---

    const result = await chat.sendMessage(text);
    const response = result.response;
    const aiText = response.text();

    if (aiText.includes('[DONE]')) {
      const jsonString = aiText.substring(aiText.indexOf('{'));
      const data = JSON.parse(jsonString);
      res.json({ type: 'schedule_success', data });
    } else {
      res.json({ type: 'conversation', text: aiText });
    }

  } catch (error) {
    console.error("Error calling Google AI:", error);
    res.status(500).json({ type: 'error', text: "An error occurred on the server." });
  }
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});