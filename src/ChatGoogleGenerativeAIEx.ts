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
    const transformedTools = transformMcpToolsForGemini(tools, { verbose });
    return super.bindTools(transformedTools, kwargs) as ChatGoogleGenerativeAIEx;
  }
}
