# Google Gemini + MCP Tools + LangChain.js → Fixed!

### Simple library to fix Gemini API schema issues with MCP tools / LangChain.js

This library provides an extended version of `ChatGoogleGenerativeAI` that **fixes Gemini schema compatibility issues** when using MCP servers with complex schemas (like Airtable). It prevents cascading failures where one complex server breaks the entire MCP integration when using `MultiServerMCPClient()`.

The schema error usually looks like:  
`[GoogleGenerativeAI Error]: ... [400 Bad Request] Invalid JSON payload received.`

> This library addresses compatibility issues present as of September 2, 2025, with LangChain.js v0.2.16 and @google/generative-ai v0.21.0.

## Quick Example

```typescript
import { ChatGoogleGenerativeAIEx } from '@hideya/langchain-google-genai-ex';

// ❌ This fails when Airtable (or other complex schema servers) are included
const llm = new ChatGoogleGenerativeAI({ model: "gemini-2.5-flash" });

// ✅ This works with complex MCP servers and prevents cascading failures 
const llm = new ChatGoogleGenerativeAIEx({ model: "gemini-2.5-flash" });
```

**That's it!** Your MCP tool schema errors are gone, and simple servers remain functional even when complex ones are present. 🎉

## 📋 Table of Contents

Below we'll explain what and how this library works in detail:

- [Prerequisites](#prerequisites)
- [Installation](#installation)  
- [The Problem You're Probably Having](#the-problem-youre-probably-having)
- [Complete Usage Example](#complete-usage-example)
- [Features](#features)
- [Why Not Upstream Schema Fixes?](#why-not-upstream-schema-fixes)
- [Google's Official Fix vs. This Library](#googles-official-fix-vs-this-library)
- [How It Works](#how-it-works)
- [API Reference](#api-reference)
- [Contributing](#contributing)

## Prerequisites

Before installing, make sure you have:

- **Node.js 18+** - Required for modern JavaScript features
- **Google API Key** - Get yours at [Google AI Studio](https://ai.google.dev/gemini-api/docs/api-key)
- **LangChain.js** - This package works with [`@langchain/core`](https://www.npmjs.com/package/@langchain/core)
  and [`@langchain/mcp-adapters`](https://www.npmjs.com/package/@langchain/mcp-adapters)
- **MCP Servers** - Access to the MCP servers you want to use

**Note on Dependencies:** This package uses specific versions of `@langchain/google-genai` (~0.2.16) and `@google/generative-ai` (~0.21.0) to ensure schema transformation reliability.

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

This typically occurs when you configure multiple MCP servers using `MultiServerMCPClient`, especially if some of these servers have complex schemas.

If you searched for `GoogleGenerativeAIFetchError: [GoogleGenerativeAI Error] 400 Bad Request`, this section explains the cause and how to workaround it when using LangChain.

### Why This Happens

- [**Gemini's schema requirements for function calling are very strict**](https://ai.google.dev/api/caching#Schema)
  MCP servers define their tools using flexible JSON schemas and LLMs invoke MCP tools via function calling. Most LLMs accept these schemas just fine.
- But Gemini **rejects valid MCP tool schemas** if they contain fields it doesn't expect (e.g., use of `anyOf`).
- The result is a **400 Bad Request** - even though the same MCP server works fine with OpenAI, Anthropic, etc.
- Google provides a fix in its new Gemini SDK (`@google/genai`), but LangChain.js cannot leverage it due to its architectural misalignment.

For many developers, this can make Gemini difficult to use with LangChain.js and some MCP servers. Even if only one complex MCP server is included in the MCP definitions passed to `MultiServerMCPClient`, all subsequent MCP usage starts failing with the error above.

**This library handles all these schema incompatibilities through downstream transformation, converting complex MCP tool schemas into Gemini-friendly formats so you can focus on building instead of debugging schema errors.**

## Complete Usage Example

```typescript
import { ChatGoogleGenerativeAIEx } from '@hideya/langchain-google-genai-ex';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { MultiServerMCPClient } from '@langchain/mcp-adapters';
import { HumanMessage } from '@langchain/core/messages';

// Set up MCP client with complex tools (like Airtable) that generates "400 error"
const client = new MultiServerMCPClient({
  mcpServers: {
    airtable: {
      transport: "stdio",
      command: "npx",
      args: ["-y", "airtable-mcp-server"],
      env: { "AIRTABLE_API_KEY": `${process.env.AIRTABLE_API_KEY}` }
    }
  }
});

const mcpTools = await client.getTools();

// Use the enhanced ChatGoogleGenerativeAI
const llm = new ChatGoogleGenerativeAIEx({ 
  model: "gemini-2.5-flash",
  apiKey: process.env.GOOGLE_API_KEY 
});

// Create agent with MCP tools
const agent = createReactAgent({ llm, tools: mcpTools });

// This works! No more schema errors
const result = await agent.invoke({
  messages: [new HumanMessage("Tell me about my Airtable account")]
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

### ✅ **Comprehensive Schema Transformation**
- **Systematic conversion** of `allOf`/`anyOf`/`oneOf` to equivalent object structures
- **Reference resolution** - handles `$ref` and `$defs` by flattening definitions
- **Type normalization** - converts type arrays `["string", "null"]` to `nullable` properties
- **Property validation** - filters `required` fields that don't exist in `properties`
- **Format compatibility** - removes unsupported JSON Schema formats and keywords
- **Nested structure handling** - recursively processes complex object hierarchies


### Migration Path

**Choose your integration approach:**

#### Option A: Using Google's New SDK Directly
If you're starting fresh or can migrate away from LangChain.js, use Google's official solution:

```typescript
// If you use Google's SDK directly:
import { GoogleGenAI, mcpToTool } from "@google/genai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

const ai = new GoogleGenAI({});

// Use Google's official solution!
const client = new Client(...);
const response = await ai.models.generateContent({
  model: "gemini-2.5-flash",
  contents: "What is the weather in London?",
  config: {
    tools: [mcpToTool(client)], // ← Upstream schema transformation
  },
});
```

#### Option B: Using LangChain.js (Current Ecosystem)
If you need LangChain.js integration, use this library as the comprehensive solution:

```typescript
// If you use LangChain.js:
import { ChatGoogleGenerativeAIEx } from "@hideya/langchain-google-genai-ex";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";

// Use this library - the definitive LangChain.js solution
const llm = new ChatGoogleGenerativeAIEx({ model: "gemini-2.5-flash" });

const client = new MultiServerMCPClient({...});
const mcpTools = await client.getTools();
const agent = createReactAgent({ llm, tools: mcpTools });
```

This library serves as a good solution for LangChain.js users while the issue is fixed in ChatGoogleGenerativeAI.


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

[MIT](./LICENSE)

## Links

- [📖 **Full API Documentation**](https://hideya.github.io/langchain-google-genai-ex/)
- [📦 **NPM Package**](https://www.npmjs.com/package/@hideya/langchain-google-genai-ex)
- [🐛 **Issues & Bug Reports**](https://github.com/hideya/langchain-google-genai-ex/issues)
- [🔧 **Source Code**](https://github.com/hideya/langchain-google-genai-ex)
