const Groq = require('groq-sdk');

let groq = null;

function init() {
  const apiKey = process.env.KEY;
  if (apiKey && apiKey !== '') {
    groq = new Groq({ apiKey });
    console.log('Groq AI initialized.');
  } else {
    console.log('No Groq API key set (KEY env var) — AI auto-responses disabled.');
  }
}

function isReady() {
  return groq !== null;
}

async function getAutoResponse(userMessage, history = []) {
  if (!groq) return null;

  const systemMessage = {
    role: 'system',
    content: `You are a helpful support assistant for Jump Up Events. Your role is to help users with their questions about the server, events, and general inquiries.

Guidelines:
- Be friendly, concise, and helpful.
- If you cannot fully resolve the issue, gently offer to transfer to a human staff member.
- Always end your response with a line like: "If you need further help, just let me know and I'll connect you with a staff member."
- Do not make promises you cannot keep.
- Keep responses under 200 words.`,
  };

  const messages = [
    systemMessage,
    ...history.map(msg => ({
      role: msg.role,
      content: msg.text,
    })),
    { role: 'user', content: userMessage },
  ];

  try {
    const response = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages,
      max_tokens: 500,
    });
    return response.choices[0]?.message?.content || null;
  } catch (err) {
    console.error('Groq API error:', err);
    return null;
  }
}

module.exports = { init, isReady, getAutoResponse };
