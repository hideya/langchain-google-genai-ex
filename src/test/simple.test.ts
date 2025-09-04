import "dotenv/config";
import { ChatGoogleGenerativeAIEx } from "../index.js";
// import { ChatGoogleGenerativeAIEx } from "@hideya/langchain-google-genai-ex";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { HumanMessage } from "@langchain/core/messages";

// The following Fetch MCP server causes "400 Bad Request"
const client = new MultiServerMCPClient({
  mcpServers: {
    fetch: {
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
    messages: [new HumanMessage("Read the top news headlines on bbc.com")]
  });

  console.log(result.messages[result.messages.length - 1].content);
  await client.close();
})();
