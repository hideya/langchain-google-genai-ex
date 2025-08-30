# Architectural Decisions: Why We Fix at invocationParams() Level

> **📅 Research Date**: This architectural analysis is based on research conducted on August 31, 2025, examining LangChain.js ecosystem design patterns and alternative approaches to schema compatibility. Technology stacks evolve rapidly, so please verify current best practices.

## Overview

This document explains the architectural decisions behind `@hideya/langchain-google-genai-ex`, specifically why we chose to fix schema compatibility at the `invocationParams()` level rather than at the root cause (`zodToJsonSchema`) or other upstream levels.

## The Core Question

After discovering that `zodToJsonSchema` is the root cause of Gemini schema incompatibility, a natural question arises:

> **"Why not fix the issue by updating `zodToJsonSchema` directly, maybe by applying `transformMcpToolForGemini()` afterwards?"**

This document analyzes this approach and explains our architectural choices.

## The Appeal of Root Cause Fixes

### Why Fixing `zodToJsonSchema` Seems Attractive

1. **Conceptual elegance**: Address the problem where it originates
2. **Universal coverage**: Would fix ALL LangChain.js + Gemini integrations automatically  
3. **Simpler libraries**: No need for "surgical interception" patterns
4. **Cleaner architecture**: Fix the root rather than symptoms

The logic is compelling: if `zodToJsonSchema` produces OpenAI-compatible schemas that break Gemini, why not make it produce Gemini-compatible schemas instead?

## The Practical Challenges

### 1. Ownership & Control Issues

```
zodToJsonSchema (external project)
    ↓
@langchain/core (LangChain team)
    ↓  
@langchain/google-genai (LangChain team)
    ↓
Our library (our control)
```

**Challenge**: `zodToJsonSchema` is maintained by a different team/project than LangChain.js. Getting schema compatibility changes accepted would require:
- Convincing external maintainers
- Coordinating with multiple projects
- Long approval/release cycles

### 2. The OpenAI vs Gemini Conflict

The fundamental issue: `zodToJsonSchema` is **designed** to produce OpenAI-compatible schemas, but Gemini needs a **strict subset** of that functionality.

**OpenAI-compatible output** (what `zodToJsonSchema` correctly produces):
```json
{
  "type": "object",
  "properties": {
    "status": {
      "anyOf": [
        { "type": "string" },
        { "type": "null" }
      ]
    }
  },
  "$defs": { ... }
}
```

**Gemini-compatible equivalent** (what we need):
```json
{
  "type": "object", 
  "properties": {
    "status": {
      "type": "string",
      "nullable": true
    }
  }
}
```

**Question**: How do you resolve this in a shared utility without breaking OpenAI compatibility?

### 3. Breaking Changes Risk

Any modification to `zodToJsonSchema` could break:
- **OpenAI integrations**: Expect full JSON Schema features
- **Other LLM providers**: May rely on specific schema formats
- **Existing user code**: Built around current schema output
- **Downstream libraries**: That depend on predictable schema structure

### 4. Implementation Complexity

A root-level fix would require something like:

```typescript
function zodToJsonSchema(schema, options?: { 
  targetProvider?: 'openai' | 'gemini' | 'anthropic' | 'bedrock'
}) {
  const baseSchema = generateBaseSchema(schema);
  
  switch(options?.targetProvider) {
    case 'gemini': 
      return transformForGemini(baseSchema);
    case 'anthropic': 
      return transformForAnthropic(baseSchema);
    case 'bedrock':
      return transformForBedrock(baseSchema);
    default: 
      return baseSchema; // OpenAI format
  }
}
```

**Problems with this approach**:
- Adds complexity to a fundamental utility
- Requires maintaining provider-specific transformations
- Creates potential for new bugs across all providers
- Still requires provider detection logic throughout LangChain

## Alternative Approaches Considered

### Option 1: LangChain-Level Fix

Fix within `@langchain/google-genai` itself:

```typescript
// Inside ChatGoogleGenerativeAI
function convertToGeminiFunction(tool) {
  const openAIFunction = convertToOpenAIFunction(tool);
  return transformMcpToolForGemini({
    name: openAIFunction.name,
    description: openAIFunction.description, 
    inputSchema: openAIFunction.parameters
  });
}
```

**Pros**: 
- Provider-specific (no OpenAI conflicts)
- Could benefit entire community
- Easier to get accepted than core changes

**Cons**:
- Requires LangChain maintainer buy-in
- Still need our library until it's implemented and released
- May take months/years to get accepted

### Option 2: Zod-Level Intervention

Modify Zod schemas before they reach `zodToJsonSchema`:

```typescript
// Intercept Zod schemas and make them Gemini-compatible
function makeZodGeminiCompatible(zodSchema) {
  // Transform Zod schema definition itself
  return zodSchema.transform(/* Gemini-compatible transformations */);
}
```

**Pros**:
- Addresses issue before JSON Schema generation
- Could work across multiple conversion utilities

**Cons**:
- Very complex to implement reliably
- May break tool functionality 
- Hard to maintain as Zod evolves

## Our Chosen Architecture: Surgical Interception

### Why `invocationParams()` Level is Optimal

```typescript
export class ChatGoogleGenerativeAIEx extends ChatGoogleGenerativeAI {
  override invocationParams(options?: any): any {
    const req = super.invocationParams(options);  // ← Let everyone do their job
    return normalizeGeminiToolsPayload({ ...req }); // ← Fix the final result
  }
}
```

**Advantages**:

1. **✅ Works immediately**: No waiting for upstream changes
2. **✅ Non-destructive**: Doesn't break existing code anywhere
3. **✅ Precise timing**: Fixes schemas at the exact right moment
4. **✅ Proven reliability**: Battle-tested with complex MCP servers
5. **✅ Complete control**: We can iterate and improve quickly
6. **✅ Zero dependencies**: No coordination with external teams needed

**Trade-offs accepted**:

1. **Requires our library**: Users must install an additional package
2. **Interception complexity**: More complex than a root fix would be
3. **Provider-specific**: Only fixes Gemini, not a universal solution

## Decision Matrix

| Approach | Immediate Fix | No Breaking Changes | Easy Maintenance | Community Benefit | Feasibility |
|----------|---------------|-------------------|------------------|-------------------|-------------|
| **Fix zodToJsonSchema** | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Fix LangChain Core** | ❌ | ❌ | ❌ | ✅ | ❓ |
| **Zod-level Intervention** | ❓ | ❌ | ❌ | ❓ | ❌ |
| **Our invocationParams()** | ✅ | ✅ | ✅ | ✅ | ✅ |

## Long-term Strategy

Our architectural decision doesn't preclude future improvements:

### Phase 1 (Current): Proven Solution
- ✅ Maintain `invocationParams()` interception approach
- ✅ Serve users who need Gemini + MCP tools working **now**
- ✅ Gather real-world usage data and edge cases

### Phase 2 (Future): Community Contribution
- Propose `convertToGeminiFunction` utility to `@langchain/google-genai`
- Share our proven schema transformation logic
- Help LangChain maintainers implement native Gemini compatibility

### Phase 3 (Long-term): Upstream Integration  
- If LangChain adopts native Gemini schema transformation
- Deprecate our library gracefully
- Migrate users to native solution

## Conclusion

While fixing `zodToJsonSchema` would be architecturally elegant, our `invocationParams()` interception approach is the **pragmatic optimum**:

- **Immediately solves the problem** for developers who need it now
- **Doesn't break anything** in the existing ecosystem  
- **Provides proven value** with complex real-world MCP servers
- **Maintains flexibility** for future architectural evolution

The key insight: **Perfect architectural purity is less valuable than working solutions that help developers be productive immediately**.

Our approach proves that sometimes the "right" architectural decision is the one that **delivers value now** while keeping options open for the future.

## References

- [LangChain Tool Conversion Pipeline Analysis](./LANGCHAIN_TOOL_CONVERSION_PIPELINE.md) - Technical details on why upstream fixes fail
- [Google Official Fix Compatibility Analysis](./GOOGLE_OFFICIAL_FIX_COMPATIBILITY.md) - Ecosystem-level compatibility challenges
- [zodToJsonSchema Library](https://github.com/StefanTerdell/zod-to-json-schema) - The root cause utility
- [LangChain.js Core Utils](https://github.com/langchain-ai/langchainjs/tree/main/langchain-core/src/utils) - LangChain's function calling utilities

---

*For the most current information, please refer to the official documentation links provided throughout this document.*
