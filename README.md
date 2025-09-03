# Google Gemini + MCP Tools + LangChain.js → Fixed!

### Simple library to fix Gemini API schema issues with MCP tools / LangChain.js

This library fixes **Gemini schema compatibility issues** when using MCP servers with complex schemas (like Airtable).
It prevents cascading failures where one complex server breaks the entire MCP integration when using `MultiServerMCPClient()`.
It supports both Gemini 1.5 and 2.5.

The schema error usually looks like:  
`[GoogleGenerativeAI Error]: ... [400 Bad Request] Invalid JSON payload received.`

> This library addresses compatibility issues present as of September 3, 2025, with LangChain.js (@langchain/core) v0.3.72 and @langchain/google-genai v0.2.16.

## How to Use This Library

### Drop-in Replacement

```typescript
import { ChatGoogleGenerativeAIEx } from '@hideya/langchain-google-genai-ex';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { MultiServerMCPClient } from '@langchain/mcp-adapters';

// Set up MCP client
const client = new MultiServerMCPClient({ /* your config */ });
const mcpTools = await client.getTools();

// Just replace ChatGoogleGenerativeAI with ChatGoogleGenerativeAIEx
const llm = new ChatGoogleGenerativeAIEx({ model: "gemini-2.5-flash" });
const agent = createReactAgent({ llm, tools: mcpTools }); // Auto-transformed!
```

**This automatically fixes:**
- ✅ "anyOf must be the only field set" errors (Gemini 1.5)
- ✅ "Unknown name 'exclusiveMaximum'" schema validation errors  
- ✅ "Invalid JSON payload" errors from complex MCP schemas
- ✅ Cascading failures where one complex server breaks entire MCP integration

**That's it!** No configuration, no additional steps.

You can always switch back to the original `ChatGoogleGenerativeAI`
when its schema handling improves,
or when the MCP server's schema improves to meet Gemini's strict requirements.

## 📋 Table of Contents

Below we'll explain what and how this library works in detail:

- [Prerequisites](#prerequisites)
- [Installation](#installation)  
- [The Problem You're Probably Having](#the-problem-youre-probably-having)
- [Complete Usage Example](#complete-usage-example)
- [Features](#features)
- [API Reference](#api-reference)
- [Contributing](#contributing)

## Prerequisites

Before installing, make sure you have:

- **Node.js 18+** - Required for modern JavaScript features
- **Google API Key** - Get yours at [Google AI Studio](https://ai.google.dev/gemini-api/docs/api-key)
- **LangChain.js** - This package works with [`@langchain/core`](https://www.npmjs.com/package/@langchain/core)
  and [`@langchain/mcp-adapters`](https://www.npmjs.com/package/@langchain/mcp-adapters)
- **MCP Servers** - Access to the MCP servers you want to use

## Installation

```bash
npm install @hideya/langchain-google-genai-ex
```
and the following as needed:
```bash
# LangChain dependencies (if not already installed)
npm install @langchain/core @langchain/mcp-adapters

# Utilities for MCP Tool calling (as needed)
npm install @langchain/langgraph
```

## The Problem You're Probably Having

If you've ever tried using **Google Gemini** together with **LangChain.js** and **MCP servers with complex schemas**, you may have run into this error:

```
[GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent: [400 Bad Request] Invalid JSON payload received. Unknown name "anyOf" at 'tools[0].function_declarations[8].parameters.properties[2]...': Proto field is not repeating, cannot start list.
```

This typically occurs when you configure multiple MCP servers using `MultiServerMCPClient`,
especially when some of the servers have complex schemas.

If you searched for `GoogleGenerativeAIFetchError: [GoogleGenerativeAI Error] 400 Bad Request`, this section explains the cause and how to workaround it when using LangChain.

### Why This Happens

- [**Gemini's schema requirements for function calling are very strict**](https://ai.google.dev/api/caching#Schema)
  MCP servers define their tools using flexible JSON schemas and LLMs invoke MCP tools via function calling.
  Most LLMs accept these schemas just fine.
- But Gemini **rejects valid MCP tool schemas** if they contain fields it doesn't expect (e.g., use of `anyOf`).
- The result is a **400 Bad Request** - even though the same MCP server works fine with OpenAI, Anthropic, etc.
- Google provides a fix in its new Gemini SDK (`@google/genai`),
  but LangChain.js cannot leverage it due to its architectural misalignment.

For many developers, this can make Gemini difficult to use with LangChain.js and some MCP servers.
Even if only one incompatible MCP server is included in the MCP definitions passed to `MultiServerMCPClient`,
all subsequent MCP usage starts failing with the error above.

**This library handles all these schema incompatibilities through schema transformation, 
onverting complex MCP tool schemas into Gemini-friendly formats
so you can focus on building instead of debugging schema errors.**

## Complete Usage Example

```typescript
import { ChatGoogleGenerativeAIEx } from '@hideya/langchain-google-genai-ex';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { MultiServerMCPClient } from '@langchain/mcp-adapters';
import { HumanMessage } from '@langchain/core/messages';

// Set up MCP client with complex tools (like Airtable) that cause "400 errors"
const client = new MultiServerMCPClient({
  mcpServers: {
    airtable: {
      transport: "stdio",
      command: "npx",
      args: ["-y", "airtable-mcp-server"],
      env: { "AIRTABLE_API_KEY": `${process.env.AIRTABLE_API_KEY}` }
    },
    notion: {
      transport: "stdio",
      command: "npx", // OAuth via "mcp-remote"
      args: ["-y", "mcp-remote", "https://mcp.notion.com/mcp"]
    }
  }
});

const mcpTools = await client.getTools();

// Use ChatGoogleGenerativeAIEx - tools are automatically transformed
const llm = new ChatGoogleGenerativeAIEx({ 
  model: "gemini-1.5-flash", // 2.5 is also supported
  apiKey: process.env.GOOGLE_API_KEY 
});

// Create agent with MCP tools - no manual transformation needed!
const agent = createReactAgent({ llm, tools: mcpTools });

// This works! No more schema errors
const result = await agent.invoke({
  messages: [new HumanMessage("Tell me about my Airtable account")]
});

console.log(result.messages[result.messages.length - 1].content);
await client.close();
```

**Key Benefits:**
- **Simple to use** - Just replace the import
- **Works with all MCP servers** - Airtable, Notion, GitHub, etc.
- **Preserves all functionality** - Streaming, system instructions, etc.
- **No breaking changes** - Drop-in replacement for ChatGoogleGenerativeAI

## Features

### ✅ **All Original ChatGoogleGenerativeAI Features**
`ChatGoogleGenerativeAIEx` extends the original class, so you get everything:
- Streaming, function calling, system instructions
- All model parameters and configurations
- Full LangChain.js integration

### ✅ **Comprehensive Schema Transformation**
- **Systematic conversion** of `allOf`/`anyOf`/`oneOf` to equivalent object structures
- **Reference resolution** - handles `$ref` and `$defs` by flattening definitions
- **Type normalization** - converts type arrays `["string", "null"]` to `nullable` properties
- **Property validation** - filters `required` fields that don't exist in `properties`
- **Format compatibility** - removes unsupported JSON Schema formats and keywords
- **Nested structure handling** - recursively processes complex object hierarchies


### Simple Migration

If you're already using LangChain.js and hitting schema errors, just replace your import:

```typescript
// Before: Failing with schema errors
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
const llm = new ChatGoogleGenerativeAI({ model: "gemini-1.5-flash" });
const agent = createReactAgent({ llm, tools: mcpTools }); // ❌ Fails
```

```typescript
// After: Just change the import
import { ChatGoogleGenerativeAIEx } from "@hideya/langchain-google-genai-ex";
const llm = new ChatGoogleGenerativeAIEx({ model: "gemini-1.5-flash" });
const agent = createReactAgent({ llm, tools: mcpTools }); // ✅ Works!
```

That's it! No other changes needed.


## API Reference

Can be found [here](https://hideya.github.io/langchain-google-genai-ex)

## License

[MIT](./LICENSE)
