import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { app } from './graph.js';

// ─── Static system instructions (cache-friendly prefix) ──────
// This block never changes, so Groq's server-side prompt cache will always hit it.
const STATIC_INSTRUCTIONS = `You are Lara, a friendly and concise personal assistant.

RESPONSE RULES (follow strictly):
- Keep responses SHORT and conversational. 2-4 sentences max for simple questions.
- NEVER use markdown tables. Use bullet points or plain sentences instead.
- Only use bold (**text**) sparingly for truly important info like links or event names.
- If showing a Google Meet link, write it as a clickable link: [Join Meeting](url)
- If a web search result includes an image URL, embed it with markdown: ![description](url)
- Do NOT add unnecessary headers, dividers, or structure. Chat naturally.
- For calendar events, list simply: "📅 Event Name — Date, Time (Meet link if any)"`;

/**
 * Returns the current date/time rounded to the nearest 15 minutes.
 * This makes the temporal part of the system prompt stable so Groq's
 * automatic prompt cache can hit it consistently (50% cost reduction).
 */
function getStableTemporalContext() {
    const now = new Date();
    // Round minutes down to nearest 15
    const roundedMinutes = Math.floor(now.getMinutes() / 15) * 15;
    now.setMinutes(roundedMinutes, 0, 0);

    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
    const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone });
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short', timeZone });

    return `TODAY: ${dateStr} | TIME: ~${timeStr} | TIMEZONE: ${timeZone}`;
}

const ChatFn = async ({ query = null, sessionId = null, refreshToken = null } = {}) => {
    if (!query || !sessionId) return { message: '' };

    // Combine stable static instructions + stable rounded temporal context
    // This maximizes Groq's automatic prompt cache hit rate
    const systemPrompt = `${STATIC_INSTRUCTIONS}\n\n${getStableTemporalContext()}`;

    const res = await app.invoke({
        messages: [
            new SystemMessage(systemPrompt),
            new HumanMessage(query)
        ]
    }, {
        configurable: {
            thread_id: String(sessionId),
            refreshToken: refreshToken,
        } 
    });
    
    return { message: res.messages?.at(-1)?.content || '' };
};

export { ChatFn };