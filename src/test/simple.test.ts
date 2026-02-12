import "dotenv/config";
import { ChatGoogleGenerativeAIEx } from "../index.js";
// import { ChatGoogleGenerativeAIEx } from "@h1deya/langchain-google-genai-ex";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { createAgent, HumanMessage } from "langchain";

// Uncomment the following to enable verbose logging
// process.env.LANGCHAIN_GOOGLE_GENAI_EX_VERBOSE = "true";

// const MODEL_NAME = "gemini-2.0-flash";
const MODEL_NAME = "gemini-2.5-flash";
// const MODEL_NAME = "gemini-3-flash-preview";

const client = new MultiServerMCPClient({
  mcpServers: {
    // This Fetch local server has schema issues
    // https://pypi.org/project/mcp-server-fetch/
    fetch: {
      command: "uvx",
      args: ["mcp-server-fetch==2025.4.7"]
    },

    // // This Airtable local server has schema issues
    // // https://www.npmjs.com/package/airtable-mcp-server
    // airtable: {
    //   transport: "stdio",
    //   command: "npx",
    //   args: ["-y", "airtable-mcp-server@1.10.0"],
    //   env: {
    //     "AIRTABLE_API_KEY": `${process.env.AIRTABLE_API_KEY}`,
    //   }
    // },
  }
});

const query = "Fetch the raw HTML content from bbc.com and tell me the titile";
// const query = "List all of the Airtable bases I have access to";

(async () => {
  const mcpTools = await client.getTools();

  // const model = new ChatGoogleGenerativeAI({ model: MODEL_NAME });
  const model = new ChatGoogleGenerativeAIEx({ model: MODEL_NAME } );

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
