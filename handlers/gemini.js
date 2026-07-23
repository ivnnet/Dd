const { GoogleGenAI } = require('@google/genai');

let ai = null;

function init(apiKey) {
  if (apiKey && apiKey !== 'YOUR_GEMINI_API_KEY') {
    ai = new GoogleGenAI({ apiKey });
    console.log('Gemini AI initialized.');
  } else {
    console.log('No Gemini API key set — AI auto-responses disabled.');
  }
}

function isReady() {
  return ai !== null;
}

async function getAutoResponse(userMessage, history = []) {
  if (!ai) return null;

  const systemInstruction = `You are a helpful support assistant for Jump Up Events. Your role is to help users with their questions about the server, events, and general inquiries.

Guidelines:
- Be friendly, concise, and helpful.
- If you cannot fully resolve the issue, gently offer to transfer to a human staff member.
- Always end your response with a line like: "If you need further help, just let me know and I'll connect you with a staff member."
- Do not make promises you cannot keep.
- Keep responses under 200 words.`;

  const contents = [
    ...history.map(msg => ({
      role: msg.role,
      parts: [{ text: msg.text }],
    })),
    { role: 'user', parts: [{ text: userMessage }] },
  ];

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents,
      config: {
        systemInstruction,
        maxOutputTokens: 500,
      },
    });
    return response.text || null;
  } catch (err) {
    console.error('Gemini API error:', err);
    return null;
  }
}

module.exports = { init, isReady, getAutoResponse };
