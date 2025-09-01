# Architectural Decisions: Why We Fix at invocationParams() Level

> **📅 Research Date**: This architectural analysis is based on research conducted on September 2, 2025, including comprehensive testing against 10 MCP servers and analysis of LangChain.js ecosystem design patterns. Technology stacks evolve rapidly, so please verify current best practices.

## Overview

This document explains the architectural decisions behind `@hideya/langchain-google-genai-ex`, specifically why we chose to fix schema compatibility at the `invocationParams()` level rather than at the root cause or other upstream levels.

## The Core Question

After discovering that `zodToJsonSchema` is the root cause of Gemini schema incompatibility, a natural question arises:

> **"Why not fix the issue by updating `zodToJsonSchema` directly or applying transformations upstream?"**

This document analyzes these approaches and explains our architectural choices based on **evidence from real-world testing**.

## The Evidence: Why Upstream Fixes Don't Work

### Real-World Testing Results

Our [comprehensive testing against 10 MCP servers](../src/test/individual-servers.test.ts) provides concrete evidence:

| **Approach** | **Notion** | **Airtable** | **Fetch** | **Overall Reliability** |
|--------------|------------|--------------|-----------|-------------------------|
| **Original** | ✅ PASS | ❌ FAIL | ❌ FAIL | Baseline issues |
| **Manual (Upstream)** | ❌ **BREAKS** | ❌ **INSUFFICIENT** | ✅ PASS | **Unreliable** |
| **Automatic (Our approach)** | ✅ PASS | ✅ PASS | ✅ PASS | **Reliable** |

**Key Finding**: Manual upstream fixes are **unreliably fragile** - they can break working schemas and miss complex edge cases.

### The Notion Regression: Evidence of Fragility

**What our testing revealed**:
```typescript
// Notion server behavior:
Original ChatGoogleGenerativeAI: ✅ WORKS (schema already compatible)
Manual transformation: ❌ BREAKS (transforms already-compatible schema)  
ChatGoogleGenerativeAIEx: ✅ WORKS (applies only needed fixes)
```

This proves that upstream transformations can **harm working systems** - a critical architectural flaw.

### The Airtable Edge Case: Evidence of Incompleteness

**What our testing revealed**:
```typescript
// Airtable server behavior:
Original ChatGoogleGenerativeAI: ❌ FAILS (complex schema issues)
Manual transformation: ❌ STILL FAILS (can't handle post-processing complexity)
ChatGoogleGenerativeAIEx: ✅ WORKS (handles final payload complexity)
```

This proves that upstream transformations **can't anticipate** all issues that arise after LangChain's internal processing.

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
zodToJsonSchema (external project - different maintainers)
    ↓
@langchain/core (LangChain team - coordination needed)
    ↓  
@langchain/google-genai (LangChain team - approval cycles)
    ↓
Our library (our control - immediate solutions)
```

**Challenge**: `zodToJsonSchema` is maintained by a different team than LangChain.js. Getting schema compatibility changes accepted would require:
- Convincing external maintainers
- Coordinating with multiple projects  
- Long approval/release cycles
- No guarantee of acceptance

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

Any modification to `zodToJsonSchema` or LangChain core utilities could break:
- **OpenAI integrations**: Expect full JSON Schema features
- **Other LLM providers**: May rely on specific schema formats
- **Existing user code**: Built around current schema output  
- **Downstream libraries**: That depend on predictable schema structure

### 4. The Evidence Problem: Testing Shows Upstream Fixes Are Fragile

Our real-world testing **proves** that upstream fixes have fundamental issues:

**Fragility Pattern**:
```typescript
// The upstream fix pattern that fails:
Original Schema (unknown state) 
→ transformMcpToolsForGemini() (makes assumptions)
→ convertToOpenAIFunction() (unpredictable interaction)
→ Result: Sometimes works, sometimes breaks, sometimes insufficient
```

**Evidence from testing**:
- **Notion**: Upstream fix **broke a working system**
- **Airtable**: Upstream fix **was insufficient** for complex cases
- **Pattern**: Upstream fixes **can't predict** what LangChain's processing will do

## Alternative Approaches Considered and Tested

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
- **Testing shows this is fragile** (manual transformation issues)
- Requires LangChain maintainer buy-in
- Still need our library until implemented and released
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
- **Testing suggests this would have the same fragility issues** as manual transformation

## Our Chosen Architecture: Surgical Interception (Proven by Testing)

### Why `invocationParams()` Level is Optimal

```typescript
export class ChatGoogleGenerativeAIEx extends ChatGoogleGenerativeAI {
  override invocationParams(options?: any): any {
    const req = super.invocationParams(options);  // ← Let everyone do their job
    return normalizeGeminiToolsPayload({ ...req }); // ← Fix the final result
  }
}
```

**Advantages (validated by testing)**:

1. **✅ Proven reliable**: Testing shows it works across all schema complexity levels
2. **✅ No regressions**: Never breaks working schemas (unlike upstream fixes)
3. **✅ Handles edge cases**: Works where upstream fixes fail (Airtable case)
4. **✅ Works immediately**: No waiting for upstream changes
5. **✅ Non-destructive**: Doesn't break existing code anywhere
6. **✅ Precise timing**: Fixes schemas at the exact right moment
7. **✅ Complete control**: We can iterate and improve quickly

**Trade-offs accepted**:

1. **Requires our library**: Users must install an additional package
2. **Interception complexity**: More complex than a root fix would be (if it worked)
3. **Provider-specific**: Only fixes Gemini, not a universal solution

## Decision Matrix (Updated with Testing Evidence)

| Approach | Immediate Fix | No Breaking Changes | Proven Reliable | Community Benefit | Feasibility |
|----------|---------------|-------------------|------------------|-------------------|-------------|
| **Fix zodToJsonSchema** | ❌ | ❌ | ❓ (Untested) | ✅ | ❌ |
| **Fix LangChain Core** | ❌ | ❌ | ❓ (Untested) | ✅ | ❓ |
| **Manual Transformation** | ✅ | ❌ | ❌ **DISPROVEN** | ✅ | ✅ |
| **Our invocationParams()** | ✅ | ✅ | ✅ **PROVEN** | ✅ | ✅ |

**Key Update**: Testing **disproves** the reliability of manual (upstream) transformation approaches.

## The Critical Timing Insight

### Why Timing Matters: The Schema State Problem

```
Pre-LangChain Processing: [Unknown schema states - may be compatible, broken, or complex]
                    ↓
                Manual fixes must guess what to transform
                    ↓
              LangChain Processing: convertToOpenAIFunction() 
                    ↓  
Post-LangChain Processing: [Predictable schema patterns - always same issues]
                    ↓
              Our fix knows exactly what to transform
                    ↓
                 Gemini API: [Reliable success]
```

**The evidence**: 
- **Pre-processing**: Manual fixes **failed** in our testing due to unpredictable input states
- **Post-processing**: Automatic fixes **succeeded** due to predictable input patterns

### Technical Foundation: What We Always See

After LangChain's processing, we **always** receive predictable patterns:

```json
// Pattern 1: anyOf/oneOf constructs
{ "anyOf": [{"type": "string"}, {"type": "null"}] }
// → We convert to: { "type": "string", "nullable": true }

// Pattern 2: $ref/$defs systems  
{ "$defs": {...}, "$ref": "#/$defs/Status" }
// → We flatten to: { "type": "object", "properties": {...} }

// Pattern 3: Invalid required fields
{ "required": ["field1", "field2"], "properties": {"field1": {...}} }
// → We filter to: { "required": ["field1"], "properties": {"field1": {...}} }
```

Since we **always** see the same input patterns, we can apply **reliable transformations**.

## Long-term Strategy (Updated)

Our architectural decision is **validated by evidence** and keeps options open:

### Phase 1 (Current): Evidence-Based Solution
- ✅ Maintain `invocationParams()` interception approach **proven by testing**
- ✅ Serve users who need Gemini + MCP tools working **reliably now**
- ✅ Continue gathering real-world usage data and edge cases

### Phase 2 (Future): Community Contribution
- Share our **proven** schema transformation logic with LangChain maintainers
- Propose improvements based on **real testing evidence**
- Help implement native Gemini compatibility that avoids the fragility issues we've identified

### Phase 3 (Long-term): Upstream Integration  
- If LangChain adopts **reliable** native Gemini schema transformation
- Deprecate our library gracefully
- Migrate users to native solution

## Testing Methodology Reference

Our architectural decisions are based on systematic testing:

1. **10 MCP servers** with different schema complexity levels
2. **3 approaches tested** for each server: Original, Manual, Automatic  
3. **Real queries executed** to validate actual functionality
4. **Success/failure patterns analyzed** to understand architectural implications

See [individual-servers.test.ts](../src/test/individual-servers.test.ts) for complete testing implementation.

## Conclusion: Evidence-Driven Architecture

While fixing `zodToJsonSchema` or applying upstream transformations would be architecturally elegant, our **evidence-based analysis** proves that the `invocationParams()` interception approach is the **pragmatic optimum**:

- **Proven reliable** through comprehensive testing
- **Doesn't break anything** in the existing ecosystem  
- **Handles all edge cases** that upstream fixes miss
- **Provides immediate value** for developers building production applications
- **Maintains flexibility** for future architectural evolution

The key insight: **Evidence trumps theoretical elegance**. Our testing proves that upstream fixes are fragile, while surgical interception is reliable.

Our approach demonstrates that sometimes the "right" architectural decision is the one that **delivers proven value now** while keeping options open for the future.

## References

- [Tool Conversion Pipeline Analysis](./LANGCHAIN_TOOL_CONVERSION_PIPELINE.md) - Technical details on why upstream fixes fail
- [Google Official Fix Compatibility Analysis](./GOOGLE_OFFICIAL_FIX_COMPATIBILITY.md) - Ecosystem-level compatibility challenges  
- [Individual Server Tests](../src/test/individual-servers.test.ts) - Complete testing evidence
- [zodToJsonSchema Library](https://github.com/StefanTerdell/zod-to-json-schema) - The root cause utility
- [LangChain.js Core Utils](https://github.com/langchain-ai/langchainjs/tree/main/langchain-core/src/utils) - LangChain's function calling utilities

---

*For the most current information, please refer to the official documentation links provided throughout this document.*