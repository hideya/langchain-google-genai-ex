import "dotenv/config";
import { ChatGoogleGenerativeAIEx } from "../index.js";
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { createAgent, HumanMessage } from "langchain";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";

const MODEL_NAME = "gemini-2.5-flash";
// const MODEL_NAME = "gemini-3-flash-preview";

// Uncomment the following to enable verbose logging
process.env.LANGCHAIN_GOOGLE_GENAI_EX_VERBOSE = "true";

// Create MCP client and connect to servers
const client = new MultiServerMCPClient({
  mcpServers: {
    // Very simple MCP server that yields no issues, only a sanity check
    "us-weather": {  // US weather only
      command: "npx",
      args: [
        "-y",
        "@h1deya/mcp-server-weather"
      ]
    },

    // This Fetch server has issues
    fetch: {
      command: "uvx",
      args: [
        "mcp-server-fetch==2025.4.7"
      ]
    },

    // This Airtable local server has issues
    airtable: {
      transport: "stdio",
      command: "npx",
      args: ["-y", "airtable-mcp-server@1.10.0"],
      env: {
        "AIRTABLE_API_KEY": `${process.env.AIRTABLE_API_KEY}`,
      }
    },

    // Yields no issues, only a sanity check
    github: {
      transport: "http",
      url: "https://api.githubcopilot.com/mcp/",
      headers: {
        "Authorization": `Bearer ${process.env.GITHUB_PERSONAL_ACCESS_TOKEN}`
      }
    },
  }
});

// const query = "How many weather alerts in California?";
const query = "Fetch the raw HTML content from bbc.com and tell me the titile";
// const query = "List all of the Airtable bases I have access to";
// const query = "Tell me about my GitHub profile";

(async () => {
  const mcpTools = await client.getTools();

  const model = new ChatGoogleGenerativeAIEx({model: MODEL_NAME});
  // const model = new ChatGoogleGenerativeAI({model: MODEL_NAME});

  const agent = createAgent({ model, tools: mcpTools });

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
