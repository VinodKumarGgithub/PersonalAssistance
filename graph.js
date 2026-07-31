import { END, MemorySaver, MessagesAnnotation, StateGraph } from "@langchain/langgraph";
import { callModel } from "./llm.js";
import { tools } from "./tools.js";


const checkpointer = new MemorySaver()

const continueCondtion = async (state) => {

    const lastMessage = state?.messages?.at(-1)

    if(lastMessage?.tool_calls?.length > 0){
        return 'tools';
    }
    else{
        return END;
    }

}
    
    
const app = new StateGraph(MessagesAnnotation)
.addNode('llm', callModel)
.addNode('tools', tools)
.addEdge('__start__','llm')
.addConditionalEdges('llm',continueCondtion)
.addEdge('tools', 'llm')
    .compile({ checkpointer, recursionLimit: 15 });


export { app, checkpointer }
