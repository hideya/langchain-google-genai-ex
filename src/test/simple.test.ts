import "dotenv/config";
import { ChatGoogleGenerativeAIEx } from "../ChatGoogleGenerativeAIEx.js";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
// import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage } from "@langchain/core/messages";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";

// Create client and connect to server
const client = new MultiServerMCPClient({
  // Global tool configuration options
  // Whether to throw on errors if a tool fails to load (optional, default: true)
  throwOnLoadError: true,
  // Whether to prefix tool names with the server name (optional, default: false)
  prefixToolNameWithServerName: false,
  // Optional additional prefix for tool names (optional, default: "")
  additionalToolNamePrefix: "",

  // Use standardized content block format in tool outputs
  useStandardContentBlocks: true,

  // Server configuration
  mcpServers: {
    // https://github.com/modelcontextprotocol/quickstart-resources/tree/main/weather-server-python
    "us-weather": {  // US weather only
      transport: "stdio",
      command: "npx",
      args: ["-y", "@h1deya/mcp-server-weather"]
    },
    notionMCP: {
      transport: "stdio",
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.notion.com/mcp"],
    },
    github: {
      transport: "http",
      url: "https://api.githubcopilot.com/mcp/",
      headers: {
        "Authorization": `Bearer ${process.env.GITHUB_PERSONAL_ACCESS_TOKEN}`
      }
    },
  }
});

(async () => {
  const mcpTools = await client.getTools();

  const llm = new ChatGoogleGenerativeAIEx({model: "google-2.5-flash"});
  // const llm = new ChatGoogleGenerativeAI({model: "google-2.5-flash"});
  // const llm = new ChatOpenAI({model: "gpt-5-mini"});

  const agent = createReactAgent({ llm, tools: mcpTools });

  // const query = "Are there any weather alerts in California?";
  // const query = "Tell me about my Notion account";
  const query = "Tell me information about my GitHub profile"

  const messages =  { messages: [new HumanMessage(query)] };
  const result = await agent.invoke(messages);
  const response = result.messages[result.messages.length - 1].content;

  console.log(response);

  await client.close();
})();
