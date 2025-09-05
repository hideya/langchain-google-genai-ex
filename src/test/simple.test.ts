import "dotenv/config";
import { ChatGoogleGenerativeAIEx } from "../index.js";
// import { ChatGoogleGenerativeAIEx } from "@h1deya/langchain-google-genai-ex";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage } from "@langchain/core/messages";

const client = new MultiServerMCPClient({
  mcpServers: {
    fetch: { // This MCP server causes "400 Bad Request"
      command: "uvx",
      args: ["mcp-server-fetch==2025.4.7"]
    }
  }
});

(async () => {
  const mcpTools = await client.getTools();

  // const llm = new ChatGoogleGenerativeAI({ model: "gemini-2.5-flash" });
  const llm = new ChatGoogleGenerativeAIEx({ model: "gemini-2.5-flash"} );

  const agent = createReactAgent({ llm, tools: mcpTools });

  const result = await agent.invoke({
    messages: [new HumanMessage("Read https://en.wikipedia.org/wiki/MIT_License and summarize")]
  });

  console.log(result.messages[result.messages.length - 1].content);
  await client.close();
})();
