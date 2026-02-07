import { ChatGoogleGenerativeAI, GoogleGenerativeAIChatCallOptions } from "@langchain/google-genai";
import { transformMcpToolsForGemini } from "./schema-adapter-gemini.js";

/**
 * Drop-in replacement for ChatGoogleGenerativeAI that automatically transforms MCP tool schemas
 * to be compatible with Gemini's strict schema requirements.
 * 
 * Simply replace your ChatGoogleGenerativeAI import with ChatGoogleGenerativeAIEx and all
 * MCP tool schemas will be automatically transformed for Gemini compatibility.
 * 
 * ## Usage:
 * ```typescript
 * // Before
 * import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
 * ...
 * const model = new ChatGoogleGenerativeAI({...});
 * 
 * // After (drop-in)
 * import { ChatGoogleGenerativeAIEx } from "@h1deya/langchain-google-genai-ex";
 * ...
 * const model = new ChatGoogleGenerativeAIEx({...});
 * ```
 * 
 * ## Verbose Logging:
 * Set environment variable to see transformation details:
 * ```bash
 * LANGCHAIN_GOOGLE_GENAI_EX_VERBOSE=true npm run your-script
 * ```
 * 
 * This will show:
 * ```
 * 🔧 Transforming 3 MCP tool(s) for Gemini compatibility...
 *   ✅ get-alerts: No transformation needed (simple schema)
 *   ✅ get-forecast: No transformation needed (simple schema)
 *   🔄 fetch: 2 exclusive bound(s) converted, 1 unsupported format(s) removed (uri)
 * 📊 Summary: 1/3 tool(s) required schema transformation
 * ```
 * 
 * ## What Gets Fixed:
 * - "anyOf must be the only field set" errors (Gemini 1.5-flash)
 * - "Unknown name 'exclusiveMaximum'" and similar schema validation errors
 * - "Invalid JSON payload" errors from complex MCP schemas
 * - Cascading failures where one complex server breaks entire MCP integration
 * 
 * ## Key Benefits:
 * - Simple to use - Just replace the import and the classname
 * - All original ChatGoogleGenerativeAI features (streaming, system instructions, etc.)
 * - Full LangChain.js integration
 * - Tested with Gemini 1.5 and 2.5 models
 * 
 * ## Known Limitations:
 * - **Unresolved references:** If a schema points to `$ref` definitions that aren't available, they're simplified to a generic object.
 * - **Tuple-style arrays:** For schemas that define arrays with position-specific types, only the first item is used.
 * - **Enums and formats:** Only string enums and a small set of formats are kept; others are dropped.
 * - **Complex combinations:** `oneOf`/`allOf` are simplified, which may loosen or slightly change validation rules.
 * 
 * These adjustments keep most MCP tools working, but rare edge cases could behave differently from the original schema.
 */
export class ChatGoogleGenerativeAIEx extends ChatGoogleGenerativeAI {
  // /**
  //  * Binds configuration options with automatic tool schema transformation.
  //  * 
  //  * This method intercepts the bind() call and automatically transforms any tools
  //  * using transformMcpToolsForGemini() before passing them to the parent class.
  //  * 
  //  * @param kwargs - Configuration options to bind, potentially including tools
  //  * @returns New ChatGoogleGenerativeAIEx instance with transformed tools
  //  * 
  //  * @example
  //  * ```typescript
  //  * const boundLLM = llm.bind({ 
  //  *   tools: mcpTools,      // Auto-transformed for Gemini compatibility
  //  *   temperature: 0.5 
  //  * });
  //  * ```
  //  */
  // override bind(kwargs: Partial<GoogleGenerativeAIChatCallOptions>): ChatGoogleGenerativeAIEx {
  //   if (kwargs.tools) {
  //     const transformedKwargs = {
  //       ...kwargs,
  //       tools: transformMcpToolsForGemini(kwargs.tools as any[])
  //     };
  //     return super.bind(transformedKwargs) as ChatGoogleGenerativeAIEx;
  //   }
  //   return super.bind(kwargs) as ChatGoogleGenerativeAIEx;
  // }

  // Cache for transformed tools
  private static transformCache = new Map<string, any[]>();

  // Simple hash function
  // Avoided using `require('crypto').createHash('sha256')`, which introduces
  // dependency on node.  LangChain can run inside a browser.
  private static simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36); // Base36 for shorter string
  }

  /**
   * Binds tools with automatic schema transformation.
   * 
   * This overridden method specifically handles tool binding after automatically
   * transforming all tools for Gemini compatibility.
   * 
   * @param tools - Array of tools to bind (MCP tools, StructuredTools, etc.)
   * @param kwargs - Additional configuration options
   * @returns New ChatGoogleGenerativeAIEx instance with transformed tools
   * 
   * @example
   * ```typescript
   * const llmWithTools = llm.bindTools(mcpTools, { temperature: 0 });
   * ```
   * 
   * @note Set LANGCHAIN_GOOGLE_GENAI_EX_VERBOSE=true to see transformation details
   */
  override bindTools(tools: any[], kwargs?: Partial<GoogleGenerativeAIChatCallOptions>): ChatGoogleGenerativeAIEx {
    const verbose = process.env.LANGCHAIN_GOOGLE_GENAI_EX_VERBOSE === 'true';

    // // Check the identity of the tools object
    // const objId = (tools as any).__bindToolsCallId || 'new-object';
    // // If it doesn't have an ID, assign one
    // if (!(tools as any).__bindToolsCallId) {
    //   (tools as any).__bindToolsCallId = Math.random().toString(36).substring(7);
    // }
    // console.log(`- Object reference: ${(tools as any).__bindToolsCallId}`);
    // console.log(`- Object size: ${JSON.stringify(tools).length}`);

    // Generate hash for caching
    const toolsHash = ChatGoogleGenerativeAIEx.simpleHash(JSON.stringify(tools));

    // Check cache first
    let transformedTools = ChatGoogleGenerativeAIEx.transformCache.get(toolsHash);
    
    if (transformedTools) {
      if (verbose) {
        console.log(`✅ Using cached transformation (hash: ${toolsHash})`);
      }
    } else {
      if (verbose) {
        console.log(`🔑 New tools detected (hash: ${toolsHash})`);
      }
      transformedTools = transformMcpToolsForGemini(tools, { verbose });
      ChatGoogleGenerativeAIEx.transformCache.set(toolsHash, transformedTools);
    }

    // NOTE: the same transformedTools object is used across invocations.
    // No concerns about mutations found, as far as I checked.
    return super.bindTools(transformedTools, kwargs) as ChatGoogleGenerativeAIEx;
  }
}
