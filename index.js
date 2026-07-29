import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { app } from './graph.js';

const ChatFn = async ({ query = null, sessionId = null, refreshToken = null } = {}) => {
    if (!query || !sessionId) return { message: '' };

    const now = new Date();
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
    const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone });
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short', timeZone });
    const isoStr = now.toISOString();

    const systemPrompt = `You are a Personal Assistant, Lara. Your goal is to help the user with their tasks.

CURRENT TEMPORAL CONTEXT:
- Today's Date: ${dateStr}
- Current Time: ${timeStr}
- System Timezone: ${timeZone}
- Current ISO Timestamp: ${isoStr}

GUIDELINES FOR CALENDAR & MEETINGS:
1. Always calculate relative dates ("tomorrow", "next Friday", "at 3 PM") relative to current date and time specified above.
2. When creating meetings or calendar events, a Google Meet video conference link (meetLink) is automatically created by default.
3. IMPORTANT: Always include and display the Google Meet link (meetLink) prominently in your message response after creating or listing meetings so the user can easily join!
4. Format dates and times cleanly using markdown (tables, bold, links).`;

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