# LangChain.js Tool Conversion Pipeline: Why ChatGoogleGenerativeAIEx is Better Than Manual Schema Fixes

> **📅 Research Date**: This analysis is based on research conducted on August 31, 2025, examining LangChain.js v0.2.16, @langchain/core utilities, and related packages. Given the active development of LangChain.js, please verify current implementation details.

## TL;DR

**The Discovery**: Manual upstream schema transformations CAN work, but require deep knowledge of LangChain's internals and the correct property to transform (`tool.schema` not `tool.inputSchema`).

**Why ChatGoogleGenerativeAIEx is Better**: Provides convenience, reliability, and future-proofing without requiring developers to understand LangChain's internal tool processing.

---

## The Hidden Double Conversion Problem

### What Developers Expect vs. Reality

**Expected Flow (What Doesn't Work)**:
```
MCP Tools → Schema Fix → Gemini-Compatible Tools → ChatGoogleGenerativeAI → API
```

**Actual Flow (Why Upstream Fixes Fail)**:
```
MCP Tools → Schema Fix → Gemini Tools → invocationParams() → convertToOpenAIFunction() → Broken Schemas → API ❌
```

### The Root Cause: LangChain's Internal Tool Processing

LangChain.js performs tool conversion internally within `ChatGoogleGenerativeAI`, specifically:

1. **Your upstream fix**: Creates Gemini-compatible schemas ✅
2. **LangChain's hidden conversion**: Runs `convertToOpenAIFunction()` on ALL tools ❌
3. **Result**: Re-introduces `allOf`/`anyOf`/`$ref`/type arrays that break Gemini validation ❌

## Evidence from Source Code

### 1. LangChain's Universal Tool Conversion

From [`@langchain/core/utils/function_calling`](https://v02.api.js.langchain.com/functions/_langchain_core.utils_function_calling.convertToOpenAIFunction.html):

> "Formats a StructuredTool or RunnableToolLike instance into a format that is compatible with OpenAI function calling. **It uses the zodToJsonSchema function** to convert the schema..."

This `zodToJsonSchema` conversion is what re-introduces problematic schema features:

```typescript
// Inside LangChain's tool conversion (simplified)
import { convertToOpenAIFunction } from "@langchain/core/utils/function_calling";
import { zodToJsonSchema } from "zod-to-json-schema";

function processTools(tools) {
  return tools.map(tool => {
    // This ALWAYS happens, regardless of input format
    return convertToOpenAIFunction(tool); // ← Breaks Gemini-compatible schemas
  });
}
```

### 2. ChatGoogleGenerativeAI's Internal Processing

From [LangChain.js source code analysis](https://github.com/langchain-ai/langchainjs/blob/main/libs/langchain-google-genai/src/chat_models.ts):

```typescript
// Inside ChatGoogleGenerativeAI (conceptual)
async _generate(messages, options) {
  const prompt = convertBaseMessagesToContent(messages, ...);
  const parameters = this.invocationParams(options); // ← Tool conversion happens here
  const request = { ...parameters, contents: prompt };
  // ...
}
```

The `invocationParams()` method is where LangChain applies its universal tool conversion, **after** any upstream transformations.

### 3. Multiple Conversion Examples in LangChain Ecosystem

From [LangChain agent examples](https://github.com/langchain-ai/langgraphjs/blob/main/examples/chat_agent_executor_with_function_calling/base.ipynb):

```typescript
import { convertToOpenAIFunction } from "@langchain/core/utils/function_calling";

// This pattern is used throughout LangChain
const toolsAsOpenAIFunctions = tools.map((tool) =>
  convertToOpenAIFunction(tool)
);
const newModel = model.bind({ functions: toolsAsOpenAIFunctions });
```

This shows LangChain's consistent pattern of converting ALL tools to OpenAI format, regardless of the target model.

## Why Manual Schema Transformation is Challenging

### Challenge 1: Transforming the Wrong Property

```typescript
// ❌ Common mistake - transform wrong property
function transformMcpToolsWrong(mcpTools) {
  return mcpTools.map(tool => ({
    ...tool,
    inputSchema: transformedSchema  // LangChain doesn't read this!
  }));
}

const wrongTransform = transformMcpToolsWrong(mcpTools);
const agent = createReactAgent({ llm, tools: wrongTransform });
// Result: Still fails with schema errors - transformation ignored!
```

**Why this fails**: LangChain reads from `tool.schema`, not `tool.inputSchema`. Most developers try the wrong property first.

### Challenge 2: Requires Deep LangChain Knowledge

```typescript
// ✅ This actually works - but requires knowing internal details
function transformMcpToolsCorrect(mcpTools) {
  return mcpTools.map(tool => {
    const { functionDeclaration } = transformMcpToolForGemini({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.schema  // ← Must know to read from tool.schema
    });
    
    return {
      ...tool,
      schema: functionDeclaration.parameters  // ← Must know to update tool.schema
    };
  });
}

const correctTransform = transformMcpToolsCorrect(mcpTools);
const agent = createReactAgent({ llm, tools: correctTransform });
// Result: Works! But requires understanding LangChain internals
```

**The challenge**: Developers need to know that `DynamicStructuredTool` uses `tool.schema` internally, not `tool.inputSchema`.

## Why ChatGoogleGenerativeAIEx is Superior

### The "Just Works" Approach

```typescript
// 🎯 ChatGoogleGenerativeAIEx - No schema knowledge required
const llm = new ChatGoogleGenerativeAIEx({ model: "google-2.5-flash" });
const agent = createReactAgent({ 
  llm, 
  tools: originalMcpTools  // ← Use tools directly, no transformation needed
});
// Result: Works automatically for all schema complexity levels
```

### Why This Architecture is Better

```typescript
export class ChatGoogleGenerativeAIEx extends ChatGoogleGenerativeAI {
  override invocationParams(options?: any): any {
    const req = super.invocationParams(options);  // ← Let LangChain do ALL its processing first
    return normalizeGeminiToolsPayload({ ...req }); // ← Fix the final result
  }
}
```

**Advantages over manual transformation**:

1. **No Schema Knowledge Required**: Developers don't need to understand `tool.schema` vs `tool.inputSchema`
2. **Future-Proof**: If LangChain changes which property it reads, this still works
3. **Zero Configuration**: Just swap the class - no transformation code needed
4. **Handles All Complexity**: Works with any schema complexity level automatically
5. **Reliable Timing**: Fixes schemas at the last safe moment before API submission

### The Critical Timing

```
User Code → LangChain Processing → invocationParams() → [OUR INTERCEPTION POINT] → Gemini API
                                                      ↑
                                              Only safe place to fix schemas
```

## Technical Deep Dive: What Gets Broken

### Schema Features That Break Gemini

When LangChain runs `convertToOpenAIFunction()` → `zodToJsonSchema()`, it reintroduces:

1. **Schema composition**: `allOf`, `anyOf`, `oneOf` keywords
2. **Reference systems**: `$ref` pointers and `$defs` definitions
3. **Type flexibility**: Arrays of types like `["string", "null"]`
4. **Advanced properties**: `additionalProperties`, `patternProperties`
5. **Conditional logic**: `if`/`then`/`else` schema constructs

### Example: Before and After LangChain Conversion

**After upstream fix (Gemini-compatible)**:
```json
{
  "name": "search_repos",
  "parameters": {
    "type": "object",
    "properties": {
      "query": { "type": "string" },
      "sort": { "type": "string", "nullable": true }
    },
    "required": ["query"]
  }
}
```

**After LangChain's `convertToOpenAIFunction()` (Breaks Gemini)**:
```json
{
  "name": "search_repos", 
  "parameters": {
    "type": "object",
    "properties": {
      "query": { "type": "string" },
      "sort": { 
        "anyOf": [
          { "type": "string" },
          { "type": "null" }
        ]
      }
    },
    "required": ["query"],
    "$defs": { ... }
  }
}
```

The `anyOf` and `$defs` cause Gemini's validation to fail with errors like:
```
[GoogleGenerativeAI Error]: Invalid JSON payload received. 
Unknown name "anyOf" at 'tools[0].function_declarations[0].parameters.properties.sort'
```

## Implications for Other Schema Compatibility Issues

### General Pattern for LLM Integrations

This double conversion problem likely affects other LLM providers with strict schema requirements:

- **Anthropic Claude**: Has its own schema format requirements
- **Azure OpenAI**: May have variations from standard OpenAI
- **Other providers**: Each with specific schema restrictions

### Recommended Architecture Pattern

For any LLM provider integration with schema compatibility issues:

1. **Don't fight the upstream**: Let LangChain do its universal processing
2. **Intercept at invocation time**: Override `invocationParams()` or equivalent
3. **Transform the final payload**: Fix schemas just before API submission
4. **Preserve tool functionality**: Don't modify the actual tool objects

## Code References

- [LangChain.js convertToOpenAIFunction](https://v02.api.js.langchain.com/functions/_langchain_core.utils_function_calling.convertToOpenAIFunction.html)
- [LangChain.js ChatGoogleGenerativeAI source](https://github.com/langchain-ai/langchainjs/blob/main/libs/langchain-google-genai/src/chat_models.ts)
- [LangChain tool conversion examples](https://github.com/langchain-ai/langgraphjs/blob/main/examples/chat_agent_executor_with_function_calling/base.ipynb)
- [LangChain core function calling utilities](https://github.com/langchain-ai/langchainjs/blob/main/langchain/src/tools/convert_to_openai.ts)

## When Tool Contamination Occurs

The cascading failure happens earlier in the pipeline than you might expect:

```typescript
// The contamination sequence:
const client = new MultiServerMCPClient({ /* multiple servers */ });
const mcpTools = await client.getTools(); // ← CONTAMINATION HAPPENS HERE
//   Returns: [simpleTool1, simpleTool2, complexTool1, complexTool2, ...]

const agent = createReactAgent({ llm, tools: mcpTools }); // ← Receives pre-contaminated tools
const result = await agent.invoke({ messages: [...] }); // ← Validation fails on entire collection
```

**Key insight**: `MultiServerMCPClient.getTools()` aggregates tools from all servers into a single collection. When this collection contains both simple and complex schemas, LangChain validates the **entire collection** at once, causing even simple tools to fail validation.

This explains why individual servers work fine, but mixed configurations fail entirely:

- **Individual server**: `getTools()` returns only simple tools → ✅ Validation passes
- **Mixed servers**: `getTools()` returns simple + complex tools → ❌ Validation fails for all

### Evidence from Real Testing

```typescript
// This works (individual server):
const client = new MultiServerMCPClient({
  mcpServers: { filesystem: { /* simple schemas */ } }
});
const tools = await client.getTools(); // [14 simple filesystem tools]
// → Original ChatGoogleGenerativeAI: ✅ PASS

// This fails (mixed servers):
const client = new MultiServerMCPClient({
  mcpServers: {
    filesystem: { /* simple schemas */ },
    notion: { /* complex schemas */ }     // ← Contaminates entire collection
  }
});
const tools = await client.getTools(); // [14 simple + 13 complex tools]
// → Original ChatGoogleGenerativeAI: ❌ FAIL (even filesystem calls fail)
```

This contamination effect makes the schema compatibility problem more critical than initially apparent - it's not just about supporting individual complex servers, but preventing them from breaking the entire MCP ecosystem.

## Real-World Comparison

### Manual Schema Transformation (Possible but Complex)

```typescript
// Requires understanding LangChain internals
function transformMcpTools(mcpTools) {
  return mcpTools.map(tool => {
    const { functionDeclaration } = transformMcpToolForGemini({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.schema  // ← Must know correct property
    });
    
    return {
      ...tool,
      schema: functionDeclaration.parameters  // ← Must know correct target
    };
  });
}

const transformedTools = transformMcpTools(mcpTools);
const llm = new ChatGoogleGenerativeAI({ model: "gemini-1.5-flash" });
const agent = createReactAgent({ llm, tools: transformedTools });
```

**Developer burden**:
- ❌ Must research LangChain's internal tool structure
- ❌ Must implement transformation logic
- ❌ Must handle edge cases and schema variations
- ❌ Must update when LangChain changes internals
- ❌ Must debug when schemas don't transform correctly

### ChatGoogleGenerativeAIEx (Simple and Reliable)

```typescript
// Just swap the class - everything else identical
const llm = new ChatGoogleGenerativeAIEx({ model: "google-2.5-flash" });
const agent = createReactAgent({ llm, tools: mcpTools });  // ← Original tools!
```

**Developer experience**:
- ✅ No research required - just change the import
- ✅ No transformation code to write or maintain
- ✅ Handles all current and future schema complexities
- ✅ Works regardless of LangChain internal changes
- ✅ Zero debugging of schema transformations

## Conclusion

While manual schema transformation is **technically possible** when you understand LangChain's internals, ChatGoogleGenerativeAIEx provides a superior developer experience through:

- **Convenience**: No need to learn LangChain's internal tool structure
- **Reliability**: Works regardless of which properties LangChain uses internally
- **Future-proofing**: Automatically adapts to LangChain changes
- **Simplicity**: Just swap the class - no additional code required

The "surgical interception" approach isn't just a technical choice - it's a **developer experience optimization** that removes complexity and potential failure points from your application code.

---

*For the most current information, please refer to the official documentation links provided throughout this document.*
