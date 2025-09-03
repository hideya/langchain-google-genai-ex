# Design Decision: Why We Chose the Drop-in Replacement Approach

## Summary

During the development of `@hideya/langchain-google-genai-ex`, we extensively evaluated two approaches for solving Gemini schema compatibility issues with MCP tools:

- **Option A**: Explicit transformation function (`transformMcpToolsForGemini()`)
- **Option B**: Drop-in replacement class (`ChatGoogleGenerativeAIEx`)

After deep technical analysis and testing, we chose **Option B** as the sole API. This document explains the technical reasoning behind this decision.

## The Problem We're Solving

Google Gemini has strict schema requirements for function calling that reject valid MCP tool schemas containing fields like `anyOf`, `exclusiveMaximum`, etc. This causes errors like:

```
[GoogleGenerativeAI Error]: [400 Bad Request] Invalid JSON payload received. 
Unknown name "anyOf" at 'tools[0].function_declarations[8].parameters.properties[2]...'
```

## Initial Approach Evaluation

### Option A: Explicit Transformation Function

```typescript
import { transformMcpToolsForGemini } from '@hideya/langchain-google-genai-ex';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';

const mcpTools = await client.getTools();
const transformedTools = transformMcpToolsForGemini(mcpTools);
const llm = new ChatGoogleGenerativeAI({ model: "gemini-1.5-flash" });
const agent = createReactAgent({ llm, tools: transformedTools });
```

**Perceived Benefits:**
- Explicit control over transformation
- Works with standard `ChatGoogleGenerativeAI`
- Functional programming approach
- Easy to test transformation in isolation

### Option B: Drop-in Replacement Class

```typescript
import { ChatGoogleGenerativeAIEx } from '@hideya/langchain-google-genai-ex';

const mcpTools = await client.getTools();
const llm = new ChatGoogleGenerativeAIEx({ model: "gemini-1.5-flash" });
const agent = createReactAgent({ llm, tools: mcpTools }); // Auto-transformed
```

**Perceived Benefits:**
- Drop-in replacement
- Low risk for misuse
- Clean API surface
- Preserves all original functionality

## Technical Investigation: LangChain's Tool Binding Process

To understand which approach was architecturally sound, we analyzed LangChain's internal implementation:

### How `createReactAgent()` Works

Since the failed tests used `createReactAgent()` of LangGraph, its implementation was investigated.

From `/node_modules/@langchain/langgraph/dist/prebuilt/react_agent_executor.js`:

```typescript
const getModelRunnable = async (llm) => {
    // ...
    let modelWithTools;
    if (await _shouldBindTools(llm, toolClasses)) {
        modelWithTools = llm.bindTools(toolClasses);  // ← Critical point
    }
    // ...
};
```

`createReactAgent()` internally calls `llm.bindTools(toolClasses)` with the tools passed to it.

For more information about `bindTools()`, 
see [this official **"Tool calling"** document](https://js.langchain.com/docs/concepts/tool_calling/).

### The Tool Lifecycle Problem

#### Option A's Fatal Flaw: Premature Transformation

1. **User transforms tools**: `transformMcpToolsForGemini(mcpTools)` → `transformedTools`
2. **User passes to agent**: `createReactAgent({ llm, tools: transformedTools })`
3. **LangChain processes tools**: Internal metadata, validation, etc.
4. **LangChain calls**: `llm.bindTools(transformedTools)` (fixed tools + internal process)
5. **Result**: Tool execution context is broken

Although this fixes the 400 Bad Request caused by schema incompatibilities,
it fails to execute properly:

**Test Result**: 

```
Unfortunately, I'm unable to access information about your Notion account 
at this time due to an error with the tool.invoke function.
```

#### Option B's Success: Transform at Binding Time

1. **User passes original tools**: `createReactAgent({ llm, tools: mcpTools })`
2. **LangChain processes tools**: All internal processing complete
3. **LangChain calls**: `llm.bindTools(mcpTools)` (original tools + internal process)
4. **ChatGoogleGenerativeAIEx.bindTools()**: 
   ```typescript
   override bindTools(tools: any[], kwargs?: Partial<GoogleGenerativeAIChatCallOptions>) {
     const transformedTools = transformMcpToolsForGemini(tools);
     return super.bindTools(transformedTools, kwargs);
   }
   ```
5. **Result**: Schema transformed at exactly the desired moment

This approach works fine.

**Test Result**:
```
Your Notion account is linked to the email address ..., 
and your username is ...
```

### Simplified Comparision of the Transformation Timing

**Option A**

```
  User Code --→ LangChain Processing --→ LLM Binding
             ↑
     <Transform Tools>
        Too Early!
```

**Option B**

```
  User Code --→ LangChain Processing --→ LLM Binding
                                      ↑
                              <Transform Tools>
                               Desiered Timing!
```

### The LangChain Tool Object Structure

LangChain tools aren't just schemas - they're complex objects with:

```typescript
{
  name: "notion_get_user_info",
  description: "Get information about the current user",
  schema: { /* JSON Schema */ },
  // LangChain-specific metadata:
  lc: { /* LangChain lifecycle info */ },
  type: "tool",
  id: ["langchain", "tools", "base"],
  // Execution context:
  invoke: function() { /* actual tool execution */ },
  // Internal state and references
}
```

Early transformation seems to interfere with LangChain's internal tool processing, breaking the execution context that tools need to function.

## Final Decision: Option B Only

We decided to **drop Option A entirely** because it was difficult to make it work reliably.


## Conclusion

By choosing the drop-in replacement approach, we created a library that:
- **Solves the problem completely** without breaking tool execution
- **Requires no configuration** from users
- **Is robust against future changes** in LangChain's internals
- **Has a clean, obvious API** that is hardly susceptible to misuse
