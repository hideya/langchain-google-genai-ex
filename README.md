# Google Gemini + MCP Tools + LangChain.js → Fixed!

### Simple library to fix Gemini API schema issues with MCP tools / LangChain.js

This library provides an extended version of `ChatGoogleGenerativeAI` that **fixes Gemini schema compatibility issues** when using MCP servers with complex schemas (like Notion). It prevents cascading failures where one complex server breaks the entire MCP integration.

The schema error usually looks like:  
`[GoogleGenerativeAI Error]: ... [400 Bad Request] Invalid JSON payload received.`

> This library addresses compatibility issues present as of August 31, 2025, with LangChain.js v0.2.16 and @google/generative-ai v0.21.0.


## Quick Example

```typescript
import { ChatGoogleGenerativeAIEx } from '@hideya/langchain-google-genai-ex';

// ❌ This fails when Notion (or other complex schema servers) are included
const llm = new ChatGoogleGenerativeAI({ model: "google-2.5-flash" });

// ✅ This works with complex MCP servers and prevents cascading failures 
const llm = new ChatGoogleGenerativeAIEx({ model: "google-2.5-flash" });
```

**That's it!** Your MCP tool schema errors are gone, and simple servers remain functional even when complex ones are present. 🎉

## Tested MCP Servers

This package has been tested with the following **Notion** (`https://mcp.notion.com/mcp`), which has complex schemas and requires schema transformation to work with Gemini.

When you configure **multiple servers** including one with complex schemas (like Notion), it breaks the **entire MCP integration** - even the simple servers stop working. This library prevents this cascading failure.


## Prerequisites

Before installing, make sure you have:

- **Node.js 18+** - Required for modern JavaScript features
- **Google API Key** - Get yours at [Google AI Studio](https://ai.google.dev/gemini-api/docs/api-key)
- **LangChain.js** - This package works with [`@langchain/core`](https://www.npmjs.com/package/@langchain/core)
  and [`@langchain/mcp-adapters`](https://www.npmjs.com/package/@langchain/mcp-adapters)
- **MCP Servers** - Access to the MCP servers of your favorite, such as Notion and GitHub.

**Note on Dependencies:** This package uses specific versions of `@langchain/google-genai` (~0.2.16) and `@google/generative-ai` (~0.21.0) to ensure schema transformation reliability.


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

When using MCP servers with complex schemas (like Notion) alongside Google Gemini via LangChain.js, you encounter a **cascading failure** where one complex server breaks the entire MCP integration:

```
[GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent: [400 Bad Request] Invalid JSON payload received. Unknown name "anyOf" at 'tools[0].function_declarations[8].parameters.properties[2]...': Proto field is not repeating, cannot start list.
```

**The Real Problem**: This isn't just about individual server compatibility - it's about **ecosystem contamination**. When you configure multiple MCP servers through `MultiServerMCPClient`, servers with complex schemas (like Notion) break the **entire tool collection**, making even simple servers (like filesystem or weather) unusable.

**What breaks Gemini's validation:**
- **Complex schema servers**: Notion generates `anyOf`, `$ref`, `allOf` constructs that violate Gemini's requirements
- **Schema composition**: `allOf`, `anyOf`, `oneOf` keywords in tool definitions
- **Reference systems**: `$ref` pointers and `$defs` definitions  
- **Type flexibility**: Arrays of types like `["string", "null"]`
- **Advanced properties**: `additionalProperties`, `patternProperties`, etc.

**The Cascading Effect**:
```typescript
// This configuration will fail entirely:
const client = new MultiServerMCPClient({
  mcpServers: {
    filesystem: { /* works individually */ },
    github: { /* works individually */ },
    notion: { /* complex schema - breaks everything */ }  // ← This breaks ALL servers
  }
});
// Result: Even weather and filesystem calls fail!
```

> **📣 Recent Updates**: Google has relaxed some schema requirements in newer SDK versions (v1.7.0+) and Gemini 2.5, now supporting `$ref`, `$defs`, and other JSON Schema features through new `*JsonSchema` fields. However, LangChain.js `ChatGoogleGenerativeAI` still uses the legacy `parameters` field with the original OpenAPI 3.0 subset restrictions.

> **Technical Note**: Google Vertex AI (not Gemini API) provides OpenAI-compatible endpoints with more relaxed schema requirements, but requires different authentication and billing setup.

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

### ✅ **Intelligent Schema Transformation**
- **Smart conversion** of `allOf`/`anyOf`/`oneOf` to equivalent object structures
- **Reference resolution** - handles `$ref` and `$defs` by flattening definitions
- **Type normalization** - converts type arrays `["string", "null"]` to `nullable` properties
- **Property validation** - filters `required` fields that don't exist in `properties`
- **Format compatibility** - removes unsupported JSON Schema formats and keywords
- **Nested structure handling** - recursively processes complex object hierarchies


## Google's Official Fix vs. This Library

### Google's New SDK Solution
Google has officially addressed this schema compatibility issue in their new **Google GenAI SDK** (`@google/genai`):

- ✅ **Fixed**: `@google/genai` + `mcpToTool()` handles MCP schema transformation automatically
- ✅ **Official**: Built-in MCP support with proper schema conversion
- ✅ **Active**: Actively maintained and includes latest Gemini 2.0+ features

### Why This Library is Still Essential

**LangChain.js Integration Gap**: The new Google SDK doesn't integrate with LangChain.js ecosystem:

- ❌ **LangChain.js** still uses the legacy `@google/generative-ai` (EOL Aug 2025)
- ❌ **@langchain/mcp-adapters** doesn't work with Google's new `mcpToTool()`
- ❌ **Schema issues persist** in the LangChain.js → legacy SDK → Gemini API pathway
- ❌ **Double conversion problem**: LangChain's `convertToOpenAIFunction()` re-breaks fixed schemas

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
    tools: [mcpToTool(client)], // ← Automatic schema transformation
  },
});
```

```typescript
// If you use LangChain.js:
import { ChatGoogleGenerativeAIEx } from "@hideya/langchain-google-genai-ex";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";

// Use this library until LangChain.js migrates to new Google SDK
const llm = new ChatGoogleGenerativeAIEx({ model: "gemini-2.5-flash" });

const client = new MultiServerMCPClient({...});
const mcpTools = await client.getTools();
const agent = createReactAgent({ llm, tools: mcpTools });
```

**Bottom Line**: This library serves as a critical bridge for LangChain.js users while the ecosystem transitions to Google's new official SDK.

> **🔬 Want to understand the technical details?** See our comprehensive [**Technical Analysis**](./GOOGLE_OFFICIAL_FIX_COMPATIBILITY.md) explaining why LangChain.js can't directly use Google's official fix and the architectural challenges involved.


## How It Works

`ChatGoogleGenerativeAIEx` solves the schema compatibility problem through **surgical interception** at the critical conversion point:

> **📋 Want to understand why upstream fixes don't work?** See our detailed [**Tool Conversion Pipeline Analysis**](./LANGCHAIN_TOOL_CONVERSION_PIPELINE.md) explaining LangChain.js's hidden "double conversion" approach.

> **🔬 Want to understand the broader ecosystem issues?** See our comprehensive [**Technical Analysis**](./GOOGLE_OFFICIAL_FIX_COMPATIBILITY.md) explaining why LangChain.js can't directly use Google's official fix.

```typescript
// The magic happens in the invocationParams() override
export class ChatGoogleGenerativeAIEx extends ChatGoogleGenerativeAI {
  override invocationParams(options?: any): any {
    const req = super.invocationParams(options);
    return normalizeGeminiToolsPayload({ ...req }); // ← Schema transformation here
  }
}
```

**Why this approach works:**

1. **Precise Timing**: Intercepts tool definitions right before API submission
2. **Non-Destructive**: Original tool functionality remains completely intact  
3. **Full Compatibility**: Extends rather than replacing the original class
4. **Transparent**: Your application logic doesn't need to change

**Architectural Context**: This works within LangChain.js's existing tool conversion pipeline, transforming schemas **after** LangChain's universal tool processing but **before** Google's API validation—the only viable interception point.

> **Stability Note**: The implementation uses specific versions of `@langchain/google-genai` (~0.2.16) and `@google/generative-ai` (~0.21.0) to ensure reliable interception of the conversion process.

### Technical Foundation

This solution is built on extensive research of LangChain.js's internal architecture:

> **Deep Technical Analysis**: Our approach is proven through comprehensive analysis of LangChain's tool conversion pipeline, ecosystem compatibility challenges, and architectural trade-offs. See the technical documents linked above for the complete research foundation. 


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
- [🏗️ **Architectural Decisions**](./ARCHITECTURAL_DECISIONS.md) - Why we fix at invocationParams() level
- [📦 **NPM Package**](https://www.npmjs.com/package/@hideya/langchain-google-genai-ex)
- [🐛 **Issues & Bug Reports**](https://github.com/hideya/langchain-google-genai-ex/issues)
- [🔧 **Source Code**](https://github.com/hideya/langchain-google-genai-ex)

---

**Made with ❤️ for developers frustrated by Gemini schema validation errors.**
