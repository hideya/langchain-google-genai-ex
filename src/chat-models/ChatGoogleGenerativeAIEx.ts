import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { transformMcpToolForGemini } from "../schema-adapter/gemini.js";

/**
 * Extended ChatGoogleGenerativeAI class with enhanced capabilities:
 */
export class ChatGoogleGenerativeAIEx extends ChatGoogleGenerativeAI {

  // Need implementation that allows the user to do this:
  //   const llm = new ChatGoogleGenerativeAIEx({ model: "gemini-2.5-flash" });
  //   const client = new MultiServerMCPClient({...});
  //   const mcpTools = await client.getTools();
  //   const agent = createReactAgent({ llm, tools: mcpTools });
  // instead of:
  //   const llm = new ChatGoogleGenerativeAI({ model: "gemini-2.5-flash" });
  //   const client = new MultiServerMCPClient({...});
  //   const mcpTools = await client.getTools();
  //   const transformedTools = transformMcpToolsForGemini(mcpTools);
  //   const agent = createReactAgent({ llm, tools: transformedTools });

}
