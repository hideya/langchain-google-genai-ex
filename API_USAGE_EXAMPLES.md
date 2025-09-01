# The Solution: ChatGoogleGenerativeAIEx

**The definitive fix for MCP tools + Google Gemini schema compatibility in LangChain.js**

## Quick Start

```typescript
import { ChatGoogleGenerativeAIEx } from '@hideya/langchain-google-genai-ex';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { MultiServerMCPClient } from '@langchain/mcp-adapters';

// Get your MCP tools
const client = new MultiServerMCPClient({ /* your servers */ });
const mcpTools = await client.getTools();

// The fix: Just swap the class - everything else stays the same!
const llm = new ChatGoogleGenerativeAIEx({ 
  model: "google-2.5-flash",  // Model name remapping included
  apiKey: process.env.GOOGLE_API_KEY 
});

// Use original tools directly - schemas fixed automatically
const agent = createReactAgent({ llm, tools: mcpTools });
const result = await agent.invoke({ messages: [...] });
```

**Benefits**:
- ✅ **Zero configuration required**
- ✅ **Works with any schema complexity**
- ✅ **Future-proof against LangChain changes**
- ✅ **No transformation code to maintain**
- ✅ **Proven reliable** with 10 different MCP servers

## Why Not Manual (Upstream) Fixes?

You might be tempted to fix schemas before they reach LangChain, but our testing proves this approach is problematic:

### The Evidence: Manual Fixes Are Unreliable

Our comprehensive testing against 10 MCP servers shows manual upstream transformations:

- **Break working schemas** (Notion: ✅ → ❌)
- **Can't handle complex edge cases** (Airtable: ❌ → ❌) 
- **Require deep LangChain internals knowledge**
- **Are unpredictably fragile**

> 📊 **See the full test results**: [Individual server validation](../src/test/individual-servers.test.ts) proving automatic approach superiority.

### The Technical Reason: Double Conversion Problem

Manual upstream fixes fail due to LangChain's internal processing pipeline:

```
❌ Manual Attempt:
MCP Tools → transformMcpToolsForGemini() → "Fixed" Tools → LangChain → convertToOpenAIFunction() → Broken Again

✅ Our Solution:  
MCP Tools → LangChain → convertToOpenAIFunction() → normalizeGeminiToolsPayload() → Actually Fixed
```

LangChain's `convertToOpenAIFunction()` uses `zodToJsonSchema()` which **reintroduces problematic schema features** regardless of upstream transformations. Manual fixes can't predict what this conversion will produce.

> 📋 **Technical Details**: See [Tool Conversion Pipeline Analysis](../LANGCHAIN_TOOL_CONVERSION_PIPELINE.md) for the complete explanation.

### The Architectural Insight

The key insight: Our automatic approach sees the **final payload** after all of LangChain's processing and applies **exactly the fixes needed**, nothing more, nothing less.

Manual approaches must **guess** what transformations are needed, but our surgical interception **knows** exactly what the final schema looks like.

## Why This Works: Surgical Interception

```typescript
export class ChatGoogleGenerativeAIEx extends ChatGoogleGenerativeAI {
  override invocationParams(options?: any): any {
    const req = super.invocationParams(options);  // ← Let LangChain do ALL its processing
    return normalizeGeminiToolsPayload({ ...req }); // ← Fix the final result
  }
}
```

**The magic**: We intercept at the **exact moment** between LangChain's processing and Gemini's API validation - the only point where reliable fixes are possible.

## Advanced Debugging (Schema Transformation Library)

For developers who need to debug schema transformations, we expose the underlying transformation functions:

```typescript
import { transformMcpToolForGemini, validateGeminiSchema } from '@hideya/langchain-google-genai-ex/schema-adapter';

// Debug individual tool transformation
const { functionDeclaration, wasTransformed, changesSummary } = transformMcpToolForGemini({
  name: 'my_tool',
  description: 'Does something useful', 
  inputSchema: { /* complex schema */ }
});

console.log('Was transformed:', wasTransformed);
console.log('Changes made:', changesSummary);
console.log('Validation errors:', validateGeminiSchema(functionDeclaration.parameters));
```

**Important**: These functions are provided for debugging and transparency, not as recommended user-facing solutions. The automatic approach via `ChatGoogleGenerativeAIEx` is the reliable production solution.

## The Bottom Line

Manual schema fixes seem logical but are **architecturally problematic** in the LangChain.js ecosystem. Our automatic approach provides:

- **Guaranteed reliability**: Works regardless of schema complexity
- **Zero maintenance**: No transformation code to debug or update
- **Future compatibility**: Adapts to LangChain internal changes automatically
- **Simple migration**: Just swap the import

**The definitive solution**: Use `ChatGoogleGenerativeAIEx` and focus on building your application, not debugging schema transformations.