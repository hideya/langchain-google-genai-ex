import "dotenv/config";
// import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
// import { ChatGoogleGenerativeAIEx } from "@h1deya/langchain-google-genai-ex";
import { ChatGoogleGenerativeAIEx } from "../index.js";
import { createAgent } from "langchain";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";

// The following Fetch MCP server causes "400 Bad Request"
const client = new MultiServerMCPClient({
  throwOnLoadError: true,
  useStandardContentBlocks: true,
  mcpServers: {
    fetch: {
      transport: "stdio",
      command: "uvx",
      args: ["--with", "mcp<2", "mcp-server-fetch==2025.4.7"],
    },
  },
});

(async () => { // workaround for top-level await
  try {
    const mcpTools = await client.getTools();

    // const model = new ChatGoogleGenerativeAI({ model: "gemini-3.5-flash" });
    const model = new ChatGoogleGenerativeAIEx({ model: "gemini-3.5-flash" });

    const agent = createAgent({ model, tools: mcpTools });

    // This works! No more schema errors
    const result = await agent.invoke({
      messages: [
        {
          role: "user",
          content: "Fetch the raw HTML content from bbc.com and tell me the title",
        },
      ],
    });

    console.log(result.messages.at(-1)?.content);
  } finally {
    await client.close();
  }
})();
