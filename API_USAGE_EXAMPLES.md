# API Usage Examples

This document shows both approaches to using `@hideya/langchain-google-genai-ex`.

## Option 1: Automatic Schema Transformation (Recommended)

**Best for**: Most users who want a simple drop-in replacement

```typescript
import { ChatGoogleGenerativeAIEx } from '@hideya/langchain-google-genai-ex';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { MultiServerMCPClient } from '@langchain/mcp-adapters';

// Get your MCP tools
const client = new MultiServerMCPClient({ /* your servers */ });
const mcpTools = await client.getTools();

// Just swap the class - everything else stays the same!
const llm = new ChatGoogleGenerativeAIEx({ 
  model: "google-2.5-flash",  // Model name remapping included
  apiKey: process.env.GOOGLE_API_KEY 
});

// Use original tools directly - schemas fixed automatically
const agent = createReactAgent({ llm, tools: mcpTools });
const result = await agent.invoke({ messages: [...] });
```

**Benefits**:
- ✅ Zero configuration required
- ✅ Works with any schema complexity
- ✅ Future-proof against LangChain changes
- ✅ No transformation code to maintain

## Option 2: Manual Schema Transformation

**Best for**: Advanced users who want explicit control over transformations

```typescript
import { transformMcpToolsForGemini } from '@hideya/langchain-google-genai-ex/schema-adapter';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { MultiServerMCPClient } from '@langchain/mcp-adapters';

// Get your MCP tools
const client = new MultiServerMCPClient({ /* your servers */ });
const mcpTools = await client.getTools();

// Manually transform schemas to be Gemini-compatible
const geminiTools = transformMcpToolsForGemini(mcpTools);

// Use standard LangChain class with transformed tools
const llm = new ChatGoogleGenerativeAI({ 
  model: "gemini-1.5-flash",
  apiKey: process.env.GOOGLE_API_KEY 
});

const agent = createReactAgent({ llm, tools: geminiTools });
const result = await agent.invoke({ messages: [...] });
```

**Benefits**:
- ✅ Explicit control over transformation process
- ✅ Can inspect/debug transformed schemas
- ✅ Mix with other transformation logic
- ✅ Use with standard LangChain classes

**Trade-offs**:
- ❌ Requires understanding of schema transformation
- ❌ Must remember to apply transformation
- ❌ More code to write and maintain

## Advanced: Individual Tool Transformation

For maximum control, transform individual tools:

```typescript
import { transformMcpToolForGemini } from '@hideya/langchain-google-genai-ex/schema-adapter';

const { functionDeclaration } = transformMcpToolForGemini({
  name: 'my_tool',
  description: 'Does something useful', 
  inputSchema: { /* complex schema */ }
});

console.log('Gemini-compatible schema:', functionDeclaration.parameters);
```

## Which Approach Should You Choose?

### Use ChatGoogleGenerativeAIEx if:
- You want the simplest possible integration
- You're migrating from `ChatGoogleGenerativeAI`
- You don't need to debug schema transformations
- You want automatic future compatibility

### Use Manual Transformation if:
- You need explicit control over the process
- You want to understand exactly what's changing
- You're building your own abstractions
- You need to mix with other transformation logic

## Mixed Approach

You can even mix both approaches in the same codebase:

```typescript
// Automatic for most use cases
const quickAgent = createReactAgent({ 
  llm: new ChatGoogleGenerativeAIEx({ model: "google-2.5-flash" }), 
  tools: mcpTools 
});

// Manual for debugging specific tools
const debuggedTools = transformMcpToolsForGemini(problematicTools);
console.log('Transformed schemas:', debuggedTools.map(t => t.schema));
```

Both approaches solve the same core problem - they just offer different levels of control and simplicity!
