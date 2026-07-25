const Groq = require('groq-sdk');
const fs = require('fs');
const path = require('path');

let groq = null;
let knowledgeContext = '';

function loadKnowledge() {
  try {
    const knowledgePath = path.join(__dirname, '..', 'knowledge.json');
    if (fs.existsSync(knowledgePath)) {
      const data = JSON.parse(fs.readFileSync(knowledgePath, 'utf8'));
      knowledgeContext = `You are ${data.identity.name}, version ${data.identity.version}. ${data.identity.description}.\n\nYour personality: ${data.response_context.personality}\n\nGuidelines:\n- ${data.response_context.guidelines.join('\n- ')}\n\nFAQ:\n${data.response_context.faq.map(f => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n')}`;
      console.log('Knowledge context loaded.');
    }
  } catch (err) {
    console.error('Failed to load knowledge:', err.message);
  }
}

function init() {
  const apiKey = process.env.KEY;
  if (apiKey && apiKey !== '') {
    groq = new Groq({ apiKey });
    loadKnowledge();
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
    content: knowledgeContext || `You are a helpful support assistant for Jump Up Events. Your role is to help users with their questions about the server, events, and general inquiries.

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
