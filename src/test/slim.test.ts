import "dotenv/config";
import { ChatGoogleGenerativeAIEx } from "../chat-models/ChatGoogleGenerativeAIEx.js";
// import { ChatGoogleGenerativeAIEx } from "@h1deya/langchain-google-genai-ex";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage } from "@langchain/core/messages";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";

// Create MCP client and connect to server
const client = new MultiServerMCPClient({
  mcpServers: {
    playwright: {
      command: "npx",
      args: ["@playwright/mcp@latest"]
    },
  }
});

(async () => {
  const mcpTools = await client.getTools();

  // const llm = new ChatGoogleGenerativeAI({model: "google-2.5-flash"});
  const llm = new ChatGoogleGenerativeAIEx({model: "google-2.5-flash"});

  const agent = createReactAgent({ llm, tools: mcpTools });

  const query = "Open the BBC.com page once";
  console.log("[Q]", query);

  const messages =  { messages: [new HumanMessage(query)] };
  const result = await agent.invoke(messages);
  const response = result.messages[result.messages.length - 1].content;

  console.log("[A]", response);

  await client.close();
})();
