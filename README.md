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
const llm = new ChatGoogleGenerativeAI({ model: "google-2.5-flash" });

// ✅ This works with complex MCP servers and prevents cascading failures 
const llm = new ChatGoogleGenerativeAIEx({ model: "google-2.5-flash" });
```

**That's it!** Your MCP tool schema errors are gone, and simple servers remain functional even when complex ones are present. 🎉


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

When using MCP servers with complex schemas alongside Google Gemini via LangChain.js, you sometimes encounter a "400 Bad Request" error.

```
[GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent: [400 Bad Request] Invalid JSON payload received. Unknown name "anyOf" at 'tools[0].function_declarations[8].parameters.properties[2]...': Proto field is not repeating, cannot start list.
```

This typically happens when you configure multiple MCP servers through `MultiServerMCPClient`. 
Even one server with complex schemas can break the **entire tool collection** with the "400 error", making all the other servers unusable.  This is because of Gemini's tighter JSON schema requirements for function calling.

[**What breaks Gemini's validation:**](https://ai.google.dev/api/caching#Schema)
- **Complex schema servers**: Servers  `anyOf`, `$ref`, `allOf` constructs that violate Gemini's requirements
- **Schema composition**: `allOf`, `anyOf`, `oneOf` keywords in tool definitions
- **Reference systems**: `$ref` pointers and `$defs` definitions  
- **Type flexibility**: Arrays of types like `["string", "null"]`
- **Advanced properties**: `additionalProperties`, `patternProperties`, etc.

**The Cascading Effect**:
```typescript
// This configuration will fail entirely:
const client = new MultiServerMCPClient({
  mcpServers: {
    simple1: { /* works individually */ },
    simple2: { /* works individually */ },
    complex: { /* complex schema - breaks everything */ }  // ← This breaks ALL servers
  }
});
// Result: Even simple1 and simple2 calls fail!
```

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
    notion: {
      transport: "stdio",
      command: "npx",
      args: ["-y", "airtable-mcp-server"],
      env: { "AIRTABLE_API_KEY": `${process.env.AIRTABLE_API_KEY}` }}
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

### ✅ **Intelligent Schema Transformation**
- **Smart conversion** of `allOf`/`anyOf`/`oneOf` to equivalent object structures
- **Reference resolution** - handles `$ref` and `$defs` by flattening definitions
- **Type normalization** - converts type arrays `["string", "null"]` to `nullable` properties
- **Property validation** - filters `required` fields that don't exist in `properties`
- **Format compatibility** - removes unsupported JSON Schema formats and keywords
- **Nested structure handling** - recursively processes complex object hierarchies

## Why Not Upstream Schema Fixes?

You might wonder: *"Why not fix the schemas before they reach LangChain?"* Our testing reveals why this upstream approach is problematic:

### The Double Conversion Problem

Upstream fixes fail because of LangChain's internal processing:

```
Upstream Fix Attempt:
MCP Tools → transformMcpToolsForGemini() → "Fixed" Tools → LangChain → convertToOpenAIFunction() → Broken Again ❌

This Downstream Solution:  
MCP Tools → LangChain → convertToOpenAIFunction() → normalizeGeminiToolsPayload() → Actually Fixed ✅
```

### Real Evidence from Testing

A comprehensive testing proves upstream fixes are unreliable:

- **Notion Case**: Upstream transformation **breaks working schemas** (✅ → ❌)
- **Airtable Case**: Upstream transformation **can't handle complex edge cases** (❌ → ❌)
- **Fetch Case**: Upstream works for simple issues, but downstream is more reliable

> 📋 **Technical Details**: See our [**Tool Conversion Pipeline Analysis**](./LANGCHAIN_TOOL_CONVERSION_PIPELINE.md) for the complete explanation of why upstream fixes fail.

### The Architectural Insight

The key insight: LangChain's `convertToOpenAIFunction()` uses `zodToJsonSchema()` which seem to **reintroduce problematic schema features** regardless of upstream transformations. Upstream fixes can't predict what this conversion will produce, but our downstream approach sees the final payload and fixes exactly what's needed.

## Google's Official Fix vs. This Library

### Google's New SDK Solution
Google has officially addressed this schema compatibility issue in their new **Google GenAI SDK** (`@google/genai`):

- ✅ **Fixed**: `@google/genai` + `mcpToTool()` handles MCP schema transformation
- ✅ **Official**: Built-in MCP support with proper schema conversion
- ✅ **Active**: Actively maintained and includes latest Gemini 2.0+ features

### Why This Library is Still Essential

**LangChain.js Integration Gap**: The new Google SDK doesn't integrate with LangChain.js ecosystem:

- ❌ **LangChain.js** still uses the legacy `@google/generative-ai` (EOL Aug 2025)
- ❌ **@langchain/mcp-adapters** doesn't work with Google's new `mcpToTool()`
- ❌ **Schema issues persist** in the LangChain.js → legacy SDK → Gemini API pathway
- ❌ **Double conversion problem**: LangChain's `convertToOpenAIFunction()` would re-break fixed schemas

> 🔬 **Technical Details**: See our comprehensive [**Google Official Fix Compatibility Analysis**](./GOOGLE_OFFICIAL_FIX_COMPATIBILITY.md) explaining why LangChain.js can't directly use Google's official fix.

### Migration Path
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

**Bottom Line**: This library serves as the **definitive solution** for LangChain.js users while the ecosystem transitions to Google's new official SDK.

## How It Works

`ChatGoogleGenerativeAIEx` solves the schema compatibility problem through **surgical downstream interception** at the critical conversion point:

```typescript
// The magic happens in the invocationParams() override
export class ChatGoogleGenerativeAIEx extends ChatGoogleGenerativeAI {
  override invocationParams(options?: any): any {
    const req = super.invocationParams(options);
    return normalizeGeminiToolsPayload({ ...req }); // ← Downstream schema transformation here
  }
}
```

**Why this downstream approach works:**

1. **Precise Timing**: Intercepts tool definitions right before API submission
2. **Non-Destructive**: Original tool functionality remains completely intact  
3. **Full Compatibility**: Extends rather than replacing the original class
4. **Transparent**: Your application logic doesn't need to change

**Architectural Context**: This works within LangChain.js's existing tool conversion pipeline, transforming schemas **after** LangChain's universal tool processing but **before** Google's API validation—the only viable interception point.

> **Stability Note**: The implementation uses specific versions of `@langchain/google-genai` (~0.2.16) and `@google/generative-ai` (~0.21.0) to ensure reliable interception of the conversion process.

### Technical Foundation

This solution is built on extensive research and validation:

- **Comprehensive Testing**: [Validated against 10 MCP servers](./src/test/individual-servers.test.ts) with different schema complexity levels
- **Pipeline Analysis**: Deep research into [LangChain's tool conversion pipeline](./LANGCHAIN_TOOL_CONVERSION_PIPELINE.md)
- **Architectural Analysis**: [Why upstream fixes don't work](./ARCHITECTURAL_DECISIONS.md) and why downstream interception is optimal
- **Ecosystem Understanding**: [Google's official fix compatibility challenges](./GOOGLE_OFFICIAL_FIX_COMPATIBILITY.md) 

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
- [🔬 **Google Official Fix Compatibility Analysis**](./GOOGLE_OFFICIAL_FIX_COMPATIBILITY.md) - Why LangChain.js can't use Google's official MCP schema fix
- [📋 **Tool Conversion Pipeline Analysis**](./LANGCHAIN_TOOL_CONVERSION_PIPELINE.md) - Why upstream schema fixes fail in LangChain.js  
- [🏗️ **Architectural Decisions**](./ARCHITECTURAL_DECISIONS.md) - Why we fix at downstream level
- [🧪 **Test Results**](./src/test/individual-servers.test.ts) - Comprehensive validation against 10 MCP servers
- [📦 **NPM Package**](https://www.npmjs.com/package/@hideya/langchain-google-genai-ex)
- [🐛 **Issues & Bug Reports**](https://github.com/hideya/langchain-google-genai-ex/issues)
- [🔧 **Source Code**](https://github.com/hideya/langchain-google-genai-ex)

---

**Made with ❤️ for developers frustrated by Gemini schema validation errors.**