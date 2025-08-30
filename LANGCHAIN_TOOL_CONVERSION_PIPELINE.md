# LangChain.js Tool Conversion Pipeline: Why Upstream Schema Fixes Fail

## TL;DR

**The Problem**: LangChain.js has a hidden "double conversion" issue where tools are converted to OpenAI format internally, even after upstream schema transformations. This re-introduces Gemini-incompatible schema features and breaks upstream fixes.

**The Solution**: Schema fixes must be applied at the `invocationParams()` level - the only interception point after LangChain's internal conversion but before API submission.

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

## Why Upstream Approaches Fail

### Attempted Solution 1: Pre-converted Function Declarations

```typescript
// This doesn't work:
function mcpToolsToGeminiFDs(mcpTools) {
  return mcpTools.map(t => 
    jsonSchemaToGeminiOldTool(t.inputSchema, { name: t.name, description: t.description })
  );
}

class GeminiLC extends ChatGoogleGenerativeAI {
  invocationParams(options?: any) {
    const t = options?.tools;
    if (Array.isArray(t) && t[0]?.functionDeclarations) {
      // Already Gemini FDs → pass through exactly as-is
      return { tools: t }; // ❌ This gets ignored!
    }
    return super.invocationParams(options);
  }
}

const geminiTools = mcpToolsToGeminiFDs(mcpTools);
const llm = new GeminiLC({ model: "gemini-2.5-flash" });
const agent = createReactAgent({
  llm: llm.withConfig({ tools: geminiTools }), // ❌ LangChain ignores this format
  tools: mcpTools, // ❌ LangChain processes these instead
});
```

**Why this fails**: LangChain.js doesn't recognize pre-converted function declarations and processes the original `mcpTools` through its standard conversion pipeline.

### Attempted Solution 2: Tool Format Detection

```typescript
// This also doesn't work:
invocationParams(options?: any) {
  const t = options?.tools;
  if (Array.isArray(t) && t[0]?.functionDeclarations) {
    // Try to detect and preserve Gemini format
    return { tools: t }; // ❌ Still gets overridden by LangChain's processing
  }
  return super.invocationParams(options);
}
```

**Why this fails**: The detection happens too early. LangChain's tool processing occurs after this check, in the parent class's `invocationParams()` method.

## The Correct Solution Architecture

### Why `invocationParams()` Interception Works

```typescript
export class ChatGoogleGenerativeAIEx extends ChatGoogleGenerativeAI {
  override invocationParams(options?: any): any {
    const req = super.invocationParams(options);  // ← Let LangChain do ALL its processing first
    return normalizeGeminiToolsPayload({ ...req }); // ← Fix the final result
  }
}
```

This works because:

1. **`super.invocationParams(options)`**: Allows LangChain to complete its entire tool conversion pipeline
2. **`normalizeGeminiToolsPayload()`**: Fixes the schemas AFTER all LangChain processing is done
3. **Timing**: Intercepts at the last possible moment before API submission

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

## Conclusion

The "double conversion" problem in LangChain.js reveals a fundamental architectural challenge: **universal tool processing doesn't account for provider-specific schema requirements**. 

While upstream schema fixes seem logical, they fail because LangChain applies its own conversion layer that developers cannot easily bypass. The `invocationParams()` interception pattern provides the only reliable solution point.

This analysis explains why `@hideya/langchain-google-genai-ex` uses "surgical interception" rather than upstream transformation - it's not just an implementation choice, but an **architectural necessity** dictated by LangChain.js's internal design.

Understanding this pattern will help developers facing similar compatibility issues with other LLM providers that have strict schema requirements.
