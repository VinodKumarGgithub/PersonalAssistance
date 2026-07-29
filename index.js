import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { app } from './graph.js';

const ChatFn = async ({ query = null, sessionId = null } = {}) => {
    if (!query || !sessionId) return { message: '' };

    const res = await app.invoke({
        messages: [
            new SystemMessage('You are a Personal Assistant, Lara. Your goal is to help the user with their tasks.'),
            new HumanMessage(query)
        ]
    }, {
        configurable: {
            thread_id: String(sessionId)
        } 
    });
    
    return { message: res.messages?.at(-1)?.content || '' };
};

export { ChatFn };