import "dotenv/config";
import { ChatGoogleGenerativeAIEx } from "../index.js";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage } from "@langchain/core/messages";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";

// Create MCP client and connect to servers
const client = new MultiServerMCPClient({
  mcpServers: {
    // "us-weather": {
    //   transport: "stdio",
    //   command: "npx",
    //   args: ["-y", "@h1deya/mcp-server-weather"]
    // },
    // fetch: {
    //   command: "uvx",
    //   args: [
    //     "mcp-server-fetch"
    //   ]
    // },
    airtable: {
      transport: "stdio",
      command: "npx",
      args: ["-y", "airtable-mcp-server"],
      env: {
        "AIRTABLE_API_KEY": `${process.env.AIRTABLE_API_KEY}`,
      }
    },
    // // NOTE: comment out "fetch" when you use "notion".
    // // They both have a tool named "fetch," which causes a conflict.
    // notion: {
    //   transport: "stdio",
    //   "command": "npx",  // OAuth via "mcp-remote"
    //   "args": ["-y", "mcp-remote", "https://mcp.notion.com/mcp"],
    // },
    // filesystem: {
    //   command: "npx",
    //   args: [
    //     "-y",
    //     "@modelcontextprotocol/server-filesystem",
    //     "."  // path to a directory to allow access to
    //   ]
    // },
    // github: {
    //   transport: "http",
    //   url: "https://api.githubcopilot.com/mcp/",
    //   headers: {
    //     "Authorization": `Bearer ${process.env.GITHUB_PERSONAL_ACCESS_TOKEN}`
    //   }
    // },
    // sqlite: {
    //   command: "uvx",
    //   args: [
    //     "mcp-server-sqlite",
    //     "--db-path",
    //     "test-mcp-server-sqlite.sqlite3"
    //   ]
    // },
    // playwright: {
    //   command: "npx",
    //   args: [
    //     "@playwright/mcp@latest"
    //   ]
    // },
  }
});

(async () => {
  const mcpTools = await client.getTools();

  const llm = new ChatGoogleGenerativeAIEx({model: "gemini-1.5-flash"});
  const agent = createReactAgent({ llm, tools: mcpTools });

  // const query = "Are there any weather alerts in California?";
  // const query = "Read the top news headlines on bbc.com";
  const query = "List all of the bases I have access to";
  // const query = "Tell me about my Notion account";

  // const query = "Tell me how many of directories in `.`";
  // const query = "Tell me about my GitHub profile"
  // const query = "Make a new table in SQLite DB and put items apple and orange " +
  //   "with counts 123 and 345 respectively, " +
  //   "then increment the coutns by 1, and show all the items in the table."
  // const query = "Open the BBC.com page, then close it";

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
