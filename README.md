# Google Gemini + LangChain.js + MCP Tools = Fixed!

**ChatGoogleGenerativeAI extension that fixes schema compatibility issues with MCP tools, Gemini API, and LangChain.js.**

## Quick Start

```typescript
import { ChatGoogleGenerativeAIEx } from '@hideya/langchain-google-genai-ex';

// ❌ This fails with complex MCP tools
const llm = new ChatGoogleGenerativeAI({ model: "google-2.5-flash" });

// ✅ This works with complex MCP tools  
const llm = new ChatGoogleGenerativeAIEx({ model: "google-2.5-flash" });
```

**That's it!** Your MCP tool schema errors are gone. 🎉

## Prerequisites

Before installing, make sure you have:

- **Node.js 18+** - Required for modern JavaScript features
- **LangChain.js** - This package extends `@langchain/google-genai`
- **Google API Key** - Get yours at [Google AI Studio](https://ai.google.dev/gemini-api/docs/api-key)
- **MCP Tools** - From servers like Notion, GitHub, etc.

```bash
# Core LangChain dependencies (if not already installed)
npm install @langchain/core

# For MCP integration (if needed)
npm install @langchain/mcp-adapters @langchain/langgraph
```

## Installation

```bash
npm install @hideya/langchain-google-genai-ex
```

## The Problem You're Probably Having

When using feature rich MCP tools with Google Gemini via LangChain.js, you get errors like this:

```
[GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent: [400 Bad Request] Invalid JSON payload received. Unknown name "type" at 'tools[0].function_declarations[8].parameters.properties[2].value.items.all_of[1].any_of[1]...': Proto field is not repeating, cannot start list.
```

**Why this happens:** Many MCP servers (like Notion, Slack, etc.) generate complex JSON schemas that work with most LLM providers, but Google Gemini has strict OpenAPI 3.0 subset requirements.

**What breaks Gemini:**
- `allOf`, `anyOf`, `oneOf` schema composition
- `$ref` references and `$defs`  
- Complex nested schemas with type arrays
- Properties not supported in OpenAPI 3.0 subset

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

## Enhanced Features

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

### ✅ **Model Name Remapping**
```typescript
// Automatically converts google-* to gemini-* format
const llm = new ChatGoogleGenerativeAIEx({ model: "google-2.5-flash" });
console.log(llm.getModelName()); // "gemini-2.5-flash"
```

### ✅ **Enhanced Cached Content Support**
```typescript
const llm = new ChatGoogleGenerativeAIEx({ model: "google-2.5-flash" });

// Proper model name handling for cached content
llm.useCachedContent(cachedContent, modelParams);
```

## Supported MCP Servers

This package has been tested with MCP servers that generate complex schemas:

- ✅ **Notion** (`https://mcp.notion.com/mcp`) - Complex nested objects, anyOf unions
- ✅ **Weather Services** (`@h1deya/mcp-server-weather`) - Simple schemas (works with both)
- ✅ **File Systems** - Deep nesting, complex array items
- ✅ **Database Tools** - Schema references, multiple types

## Why Not Just Use the Original?

| Feature | ChatGoogleGenerativeAI | ChatGoogleGenerativeAIEx |
|---------|------------------------|--------------------------|
| Simple tools | ✅ Works | ✅ Works |
| Complex MCP tools | ❌ Schema errors | ✅ Works |
| Model name mapping | ❌ Manual | ✅ Automatic |
| Cached content | ⚠️ Name issues | ✅ Fixed |
| Schema transformation | ❌ None | ✅ Comprehensive |

## API Reference

For complete API documentation with detailed examples and type information, see:

**[📖 Full API Documentation](https://hideya.github.io/langchain-google-genai-ex/)**


## Testing Your Setup

Run our negative test to verify your setup handles complex schemas:

```typescript
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatGoogleGenerativeAIEx } from '@hideya/langchain-google-genai-ex';

// This should fail with complex MCP tools
const original = new ChatGoogleGenerativeAI({ model: "google-2.5-flash" });

// This should work with the same tools
const enhanced = new ChatGoogleGenerativeAIEx({ model: "google-2.5-flash" });
```

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
