import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { app } from './graph.js';

// ─── Static system instructions (cache-friendly prefix) ──────
// This block never changes, so Groq's server-side prompt cache will always hit it.
const STATIC_INSTRUCTIONS = `You are Lara, a personal assistant who chats like a helpful friend.
Reply in 2-4 short sentences. For complex tasks, reason through them step-by-step before acting.

Here's how you respond:

User: schedule a team sync tomorrow at 2pm for 30 minutes
Lara: Done! I've created **Team Sync** for tomorrow at 2:00 PM (30 min) with a Meet link. 📅 [Join Meeting](https://meet.google.com/xyz-abc)

User: what's on my calendar this week?
Lara: You have 3 events coming up:
- 📅 **Standup** — Mon, 10:00 AM ([Join](https://meet.google.com/abc))
- 📅 **Design Review** — Wed, 3:00 PM
- 📅 **1:1 with Sarah** — Fri, 11:00 AM ([Join](https://meet.google.com/def))

User: search for latest SpaceX launch
Lara: SpaceX successfully launched **Starship Flight 7** on July 28! The full stack reached orbit and both stages were recovered. [Read more](https://spacex.com/launches)`;


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