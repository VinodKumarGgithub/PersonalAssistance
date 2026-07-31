import { ChatGroq } from "@langchain/groq";
import "dotenv/config";
import { toolsList } from "./tools.js";

const llm = new ChatGroq({
    model: 'openai/gpt-oss-120b',
    apiKey: process.env.GROQ_API_KEY,
    temperature: 0
});

// Bind tools so the LLM knows about available functions
const llmWithTools = llm.bindTools(toolsList);

/**
 * Calls the LLM with the current message state.
 * Handles errors gracefully instead of crashing the whole graph.
 */
const callModel = async (state, config) => {
    const messages = state.messages;
    try {
        const response = await llmWithTools.invoke(messages, config);
        return { messages: [response] };
    } catch (err) {
        const status = err?.status || err?.response?.status;
        const code = err?.error?.code || err?.code;
        const errMsg = err?.error?.message || err?.message || 'Unknown error';

        console.error(`❌ LLM Error [status=${status}, code=${code}]:`, errMsg);

        // Build a user-friendly error message
        let friendlyMessage;
        if (status === 429 || code === 'rate_limit_exceeded') {
            friendlyMessage = `⚠️ I'm receiving too many requests right now. Please wait a moment and try again.`;
        } else if (status === 401 || status === 403) {
            friendlyMessage = `⚠️ There's an issue with the AI service authentication. Please check your \`GROQ_API_KEY\`.`;
        } else if (status === 503 || status === 502 || code === 'service_unavailable') {
            friendlyMessage = `⚠️ The AI service is temporarily unavailable. Please try again in a few seconds.`;
        } else if (code === 'model_not_found' || status === 404) {
            friendlyMessage = `⚠️ The AI model is unavailable. Please check your model configuration.`;
        } else if (errMsg.toLowerCase().includes('context') || errMsg.toLowerCase().includes('tokens')) {
            friendlyMessage = `⚠️ This conversation has grown too long for the AI to process. Please start a **New Chat** to continue.`;
        } else {
            friendlyMessage = `⚠️ I encountered an issue: ${errMsg}. Please try again.`;
        }

        // Return the friendly error message as an AI response so the conversation continues
        const { AIMessage } = await import('@langchain/core/messages');
        return { messages: [new AIMessage(friendlyMessage)] };
    }
};

export { llm, callModel };