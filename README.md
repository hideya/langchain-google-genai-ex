# Google Gemini + MCP Tools + LangChain.js → Fixed!

### Simple library to fix Gemini API schema issues with MCP tools / LangChain.js

This library provides an extended version of `ChatGoogleGenerativeAI` that **fixes Gemini schema compatibility issues with feature rich MCP servers** like GitHub, Notion, etc.

The schema error usually looks like:  
`[GoogleGenerativeAI Error]: ... [400 Bad Request] Invalid JSON payload received.`

## Quick Example

```typescript
import { ChatGoogleGenerativeAIEx } from '@hideya/langchain-google-genai-ex';

// ❌ This fails with complex MCP tools, such as GitHub, Notion, etc.
const llm = new ChatGoogleGenerativeAI({ model: "google-2.5-flash" });

// ✅ This works with complex MCP tools  
const llm = new ChatGoogleGenerativeAIEx({ model: "google-2.5-flash" });
```

**That's it!** Your MCP tool schema errors are gone. 🎉

## Tested MCP Servers

This package has been tested with the following feature rich MCP servers
(these fail with the plain `ChatGoogleGenerativeAI` as of Aug 26, 2025):

- ✅ **Notion** (`https://mcp.notion.com/mcp`) - Complex nested objects, anyOf unions
- ✅ **GitHub** (`https://api.githubcopilot.com/mcp/`)
- ✅ **SQLite** ([mcp-server-sqlite](https://pypi.org/project/mcp-server-sqlite/))
- ✅ **File Systems** ([@modelcontextprotocol/server-filesystem](https://www.npmjs.com/package/@modelcontextprotocol/server-filesystem))
- ✅ **Playwright** ([@playwright/mcp](https://www.npmjs.com/package/@playwright/mcp))


## Prerequisites

Before installing, make sure you have:

- **Node.js 18+** - Required for modern JavaScript features
- **Google API Key** - Get yours at [Google AI Studio](https://ai.google.dev/gemini-api/docs/api-key)
- **LangChain.js** - This package works with [`@langchain/core`](https://www.npmjs.com/package/@langchain/core)
  and [`@langchain/mcp-adapters`](https://www.npmjs.com/package/@langchain/mcp-adapters)
- **MCP Servers** - Access to the MCP servers of your favorite, such as Notion and GitHub.

## Installation

```bash
npm install @hideya/langchain-google-genai-ex
```
and the followings as needed:
```bash
# LangChain dependencies (if not already installed)
npm install @langchain/core @langchain/mcp-adapters

# Utilities for MCP Tool calling (as needed)
npm install @langchain/langgraph
```

## The Problem You're Probably Having

When using feature rich MCP tools with Google Gemini via LangChain.js, you get errors like this:

```
[GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent: [400 Bad Request] Invalid JSON payload received. Unknown name "type" at 'tools[0].function_declarations[8].parameters.properties[2].value.items.all_of[1].any_of[1]...': Proto field is not repeating, cannot start list.
... followed by many more
```

**Why this happens:** Many MCP servers (like GitHub, Notion, etc.) generate complex JSON schemas that work with most LLM providers, but [Google Gemini has strict OpenAPI 3.0 subset requirements](https://ai.google.dev/api/caching#Schema).

**Note:** Google Vertex AI (not Gemini API) provides OpenAI-compatible endpoints that support more relaxed requirements.

**What breaks Gemini:**
- Properties not supported in OpenAPI 3.0 subset
- `allOf`, `anyOf`, `oneOf` schema composition
- Complex nested schemas with type arrays
- `$ref` references and `$defs`

**This library handles all these schema incompatibilities automatically, transforming complex MCP tool schemas into Gemini-friendly formats so you can focus on building instead of debugging schema errors.**

## Complete Usage Example

```typescript
import { ChatGoogleGenerativeAIEx } from '@hideya/langchain-google-genai-ex';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { MultiServerMCPClient } from '@langchain/mcp-adapters';
import { HumanMessage } from '@langchain/core/messages';

// Set up MCP client with complex tools (like Notion)
const client = new MultiServerMCPClient({
  mcpServers: {
    notion: {
      transport: "stdio",
      command: "npx",
      args: ["-y", "mcp-remote", "https://mcp.notion.com/mcp"]
    }
  }
});

const mcpTools = await client.getTools();

// Use the enhanced ChatGoogleGenerativeAI
const llm = new ChatGoogleGenerativeAIEx({ 
  model: "google-2.5-flash",
  apiKey: process.env.GOOGLE_API_KEY 
});

// Create agent with MCP tools
const agent = createReactAgent({ llm, tools: mcpTools });

// This works! No more schema errors
const result = await agent.invoke({
  messages: [new HumanMessage("Search my Notion workspace for project updates")]
});

console.log(result.messages[result.messages.length - 1].content);

await client.close();
```

## Features

### ✅ **All Original ChatGoogleGenerativeAI Features**
`ChatGoogleGenerativeAIEx` extends the original class, so you get everything:
- Streaming, function calling, system instructions
- All model parameters and configurations
- Full LangChain.js integration

### ✅ **Automatic Schema Transformation** 
- Converts `allOf`/`anyOf`/`oneOf` to Gemini-compatible formats
- Removes unsupported JSON Schema features
- Filters invalid required fields
- Handles complex nested structures

## How It Works

`ChatGoogleGenerativeAIEx` solves the schema compatibility problem by intercepting
tool definitions at the critical moment - right before they're sent to Gemini's API.
It transforms problematic schema constructs into Gemini-compatible formats
without affecting the original tool functionality or  your application logic.

This targeted approach ensures reliability while maintaining full compatibility
with the original `ChatGoogleGenerativeAI` interface.

## API Reference

For complete API documentation with detailed examples and type information, see:

**[📖 Full API Documentation](https://hideya.github.io/langchain-google-genai-ex/)**

## Contributing

Issues and PRs welcome! This package specifically targets the intersection of:
- LangChain.js framework
- Google Gemini API (via ChatGoogleGenerativeAI)  
- MCP (Model Context Protocol) tools
- Complex JSON Schema compatibility

## License

MIT

## Links

- [📖 **Full API Documentation**](https://hideya.github.io/langchain-google-genai-ex/)
- [📦 **NPM Package**](https://www.npmjs.com/package/@hideya/langchain-google-genai-ex)
- [🐛 **Issues & Bug Reports**](https://github.com/hideya/langchain-google-genai-ex/issues)
- [🔧 **Source Code**](https://github.com/hideya/langchain-google-genai-ex)

---

**Made with ❤️ for developers frustrated by Gemini schema validation errors.**
