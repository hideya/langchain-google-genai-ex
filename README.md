# Fix Gemini "400 Error" with LangChain.js + MCP [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/hideya/langchain-google-genai-ex/blob/main/LICENSE) [![npm version](https://img.shields.io/npm/v/@h1deya/langchain-google-genai-ex.svg)](https://www.npmjs.com/package/@h1deya/langchain-google-genai-ex)


### Drop-in replacement that unblocks MCP tool schemas in Gemini

This library provides **a drop-in replacement for `@langchain/google-genai`
that fixes Gemini's 400 Bad Request errors** when using LangChain.js with MCP servers.
Automatically transforms schemas with unsupported constructs (e.g., anyOf, allOf) into Gemini-compatible JSON.

The schema error usually looks like:  
`[GoogleGenerativeAI Error]: ... [400 Bad Request] Invalid JSON payload received.`

This error typically occurs when using `MultiServerMCPClient()`.  
This library prevents its cascading failures where one complex server breaks the entire MCP integration.

## How to Use This Library

### Drop-in Replacement

Replace:

```typescript
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
...
const llm = new ChatGoogleGenerativeAI({ ... });
```

with:

```typescript
import { ChatGoogleGenerativeAIEx } from '@h1deya/langchain-google-genai-ex';
...
const llm = new ChatGoogleGenerativeAIEx({ ... });
```

**That's it!** No configuration, no additional steps.

**This automatically fixes:**
- ✅ "anyOf must be the only field set" errors
- ✅ "Unknown name 'exclusiveMaximum'" schema validation errors  
- ✅ "Invalid JSON payload" errors from complex MCP schemas
- ✅ Cascading failures where one complex server breaks entire MCP integration
- ✅ Works with both Gemini 1.5 and 2.5

You can easily switch back to the original `ChatGoogleGenerativeAI`
when its schema handling improves,
or when the MCP server's schema improves to meet Gemini's strict requirements.

A simple usage example, which is ready to clone and run, can be found
[here](https://github.com/hideya/langchain-google-genai-ex-usage).

> This library addresses compatibility issues present as of September 5, 2025, with LangChain.js (@langchain/core) v0.3.72 and @langchain/google-genai v0.2.16.

## Table of Contents

Below we'll explain what and how this library works in detail:

- [Prerequisites](#prerequisites)
- [Installation](#installation)  
- [The Problem You're Probably Having](#the-problem-youre-probably-having)
- [Complete Usage Example](#complete-usage-example)
- [Features](#features)
- [API Reference](https://hideya.github.io//langchain-google-genai-ex/classes/ChatGoogleGenerativeAIEx.html)

## Prerequisites

Before installing, make sure you have:

- **Node.js 18+** - Required for modern JavaScript features
- **Google API Key** - Get yours at [Google AI Studio](https://ai.google.dev/gemini-api/docs/api-key)
- **LangChain.js** - This package works with [`@langchain/core`](https://www.npmjs.com/package/@langchain/core)
  and [`@langchain/mcp-adapters`](https://www.npmjs.com/package/@langchain/mcp-adapters)
- **MCP Servers** - Access to the MCP servers you want to use

Tested with `@langchain/core@0.3.72` and `@langchain/google-genai@0.2.16`.

## Installation

```bash
npm i @h1deya/langchain-google-genai-ex
```

## The Problem You're Probably Having

If you've ever tried using **Google Gemini** together with **LangChain.js** and **MCP servers with complex schemas**, you may have run into this error:

```
[GoogleGenerativeAI Error]: Error fetching from 
https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent: 
[400 Bad Request] Invalid JSON payload received. 
Unknown name "anyOf" at 'tools[0].function_declarations[8]...
```

This typically occurs when you configure multiple MCP servers using `MultiServerMCPClient`,
especially when some of the servers have complex schemas.

If you searched for `GoogleGenerativeAIFetchError: [GoogleGenerativeAI Error] 400 Bad Request`,
the following sections explain the cause and how to workaround it when using LangChain.

> The MCP servers I have encountered so far that have failed are:
> - `@notionhq/notion-mcp-server@1.9.0` (run with `npx`)
> - `airtable-mcp-server@1.6.1` (run with `npx`)
> - `mcp-server-fetch==2025.4.7` (run with `uvx`)

### Why This Happens

- [**Gemini's schema requirements for function calling are very strict**](https://ai.google.dev/api/caching#Schema).
- MCP servers define their tools using flexible JSON schemas, and LLMs invoke MCP tools via function calling.
  Most LLMs accept these schemas just fine.
- However, Gemini API rejects MCP tool schemas if they contain fields it doesn't expect (e.g., use of `anyOf`).
- The result is a **400 Bad Request** - even though the same MCP server works fine with OpenAI, Anthropic, etc.
- Google Vertex AI that supports API endpoints with relaxed schema requirements but it requires GCP setup.
- Google provides a fix in its new Gemini SDK ([`@google/genai`](https://github.com/googleapis/js-genai?tab=readme-ov-file#model-context-protocol-mcp-support-experimental)),
  but LangChain.js users cannot leverage it due to architectural incompatibility.

For many developers, this can make Gemini difficult to use with LangChain.js and some MCP servers.
Even if only one incompatible MCP server is included in the MCP definitions passed to `MultiServerMCPClient`,
all subsequent MCP usage starts failing with the 400 Bad Request error.

**This library handles all these schema incompatibilities through schema transformation, 
converting complex MCP tool schemas into Gemini-friendly formats**,
so you can focus on building instead of debugging schema errors.

## Complete Usage Example

```typescript
// import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatGoogleGenerativeAIEx } from '@h1deya/langchain-google-genai-ex';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { MultiServerMCPClient } from '@langchain/mcp-adapters';
import { HumanMessage } from '@langchain/core/messages';

// The following Fetch MCP server causes "400 Bad Request"
const client = new MultiServerMCPClient({
  mcpServers: {
    fetch: {
      command: "uvx",
      args: ["mcp-server-fetch==2025.4.7"]
    }
  }
});

const mcpTools = await client.getTools();

// const llm = new ChatGoogleGenerativeAI({ model: "gemini-2.5-flash" });
const llm = new ChatGoogleGenerativeAIEx({ model: "gemini-2.5-flash"} );

const agent = createReactAgent({ llm, tools: mcpTools });

// This works! No more schema errors
const result = await agent.invoke({
  messages: [new HumanMessage("Read the top news headlines on bbc.com")]
});

console.log(result.messages[result.messages.length - 1].content);
await client.close();
```

A simple usage example, which is ready to clone and run, can be found
[here](https://github.com/hideya/langchain-google-genai-ex-usage).

**Key Benefits:**
- **Simple to use** - Just replace the import and the classname
- **Preserves all functionality** - Streaming, system instructions, etc.
- **No breaking changes** - Drop-in replacement for ChatGoogleGenerativeAI

## Features

### All Original ChatGoogleGenerativeAI Features
`ChatGoogleGenerativeAIEx` extends the original class, so you get everything:
- Streaming, function calling, system instructions
- All model parameters and configurations
- Full LangChain.js integration

### Comprehensive Schema Transformation
- **Systematic conversion** of `allOf`/`anyOf`/`oneOf` to equivalent object structures
- **Reference resolution** - handles `$ref` and `$defs` by flattening definitions
- **Type normalization** - converts type arrays `["string", "null"]` to `nullable` properties
- **Property validation** - filters `required` fields that don't exist in `properties`
- **Format compatibility** - removes unsupported JSON Schema formats and keywords
- **Nested structure handling** - recursively processes complex object hierarchies

### Known Limitations
- **Unresolved references:** If a schema points to `$ref` definitions that aren't available, they're simplified to a generic object.
- **Tuple-style arrays:** For schemas that define arrays with position-specific types, only the first item is used.
- **Enums and formats:** Only string enums and a small set of formats are kept; others are dropped.
- **Complex combinations:** `oneOf`/`allOf` are simplified, which may loosen or slightly change validation rules.

These adjustments keep most MCP tools working, but rare edge cases could behave differently from the original schema.
Please report issues you encounter using [Issue](https://github.com/hideya/langchain-google-genai-ex/issues).

See [this design decision document](./DESIGN_DECISIONS.md) for the implementation details.

## API Reference

Can be found [here](https://hideya.github.io//langchain-google-genai-ex/classes/ChatGoogleGenerativeAIEx.html)

## LINKS

- [A simple usage example](https://github.com/hideya/langchain-google-genai-ex-usage) which is ready to clone and run
- [Design decision document](./DESIGN_DECISIONS.md) describes the implementation details

## License

[MIT](./LICENSE)
