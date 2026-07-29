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

const callModel = async (state) => {
    const messages = state.messages;
    const response = await llmWithTools.invoke(messages);
    return { messages: [response] };
};

export { llm, callModel };