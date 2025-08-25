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
    "us-weather": {
      transport: "stdio",
      command: "npx",
      args: ["-y", "@h1deya/mcp-server-weather"]
    },
    filesystem: {
      command: "npx",
      args: [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "."  // path to a directory to allow access to
      ]
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
    sqlite: {
      command: "uvx",
      args: [
        "mcp-server-sqlite",
        "--db-path",
        "test-mcp-server-sqlite.sqlite3"
      ]
    },
    playwright: {
      command: "npx",
      args: [
        "@playwright/mcp@latest"
      ]
    },
  }
});

(async () => {
  const mcpTools = await client.getTools();

  const llm = new ChatGoogleGenerativeAIEx({model: "google-2.5-flash"});
  // const llm = new ChatGoogleGenerativeAI({model: "google-2.5-flash"});
  // const llm = new ChatOpenAI({model: "gpt-5-mini"});

  const agent = createReactAgent({ llm, tools: mcpTools });

  const query = "Are there any weather alerts in California?";
  // const query = "Tell me how many of directories in `.`";
  // const query = "Tell me about my Notion account";
  // const query = "Tell me about my GitHub profile"
  // const query = "Make a new table in SQLite DB and put items apple and orange " +
  //   "with counts 123 and 345 respectively, " +
  //   "then increment the coutns by 1, and show all the items in the table."
  // const query = "Open bbc.com page";

  console.log("\x1b[33m");  // color to yellow
  console.log("[Q]", query);
  console.log("\x1b[0m");  // reset the color

  const messages =  { messages: [new HumanMessage(query)] };
  const result = await agent.invoke(messages);
  const response = result.messages[result.messages.length - 1].content;

  console.log("\x1b[36m");  // color to cyan
  console.log("[A]", response);
  console.log("\x1b[0m");  // reset the color

  await client.close();
})();
