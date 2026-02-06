import "dotenv/config";
import { ChatGoogleGenerativeAIEx } from "../index.js";
// import { ChatGoogleGenerativeAIEx } from "@h1deya/langchain-google-genai-ex";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { createAgent, HumanMessage } from "langchain";

// Uncomment the following to enable verbose logging
// process.env.LANGCHAIN_GOOGLE_GENAI_EX_VERBOSE = "true";

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

  // const model = new ChatGoogleGenerativeAI({ model: "gemini-2.5-flash" });
  // const model = new ChatGoogleGenerativeAIEx({ model: "gemini-2.5-flash"} );
  const model = new ChatGoogleGenerativeAIEx({ model: "gemini-3-flash-preview"} );

  const agent = createAgent({ model, tools: mcpTools });

  const result = await agent.invoke({
    messages: [
      new HumanMessage("Fetch the raw HTML content from bbc.com and tell me the titile")
    ]
  });

  console.log(result.messages[result.messages.length - 1].content);
  await client.close();
})();
