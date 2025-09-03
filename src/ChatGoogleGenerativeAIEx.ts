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
 * import { ChatGoogleGenerativeAIEx } from '@hideya/langchain-google-genai-ex';
 * import { createReactAgent } from '@langchain/langgraph/prebuilt';
 * 
 * const llm = new ChatGoogleGenerativeAIEx({ model: "gemini-1.5-flash" });
 * const agent = createReactAgent({ llm, tools: mcpTools }); // Auto-transformed!
 * ```
 * 
 * ## What Gets Fixed:
 * - "anyOf must be the only field set" errors (Gemini 1.5-flash)
 * - "Unknown name 'exclusiveMaximum'" and similar schema validation errors
 * - "Invalid JSON payload" errors from complex MCP schemas
 * - Cascading failures where one complex server breaks entire MCP integration
 * 
 * ## Works With:
 * - All Gemini models (1.5-flash, 2.5-flash, etc.)
 * - All MCP server types (Airtable, Notion, GitHub, etc.)
 * - All LangChain tool patterns (MCP tools, StructuredTools, Runnable tools)
 * - All original ChatGoogleGenerativeAI features (streaming, system instructions, etc.)
 */
export class ChatGoogleGenerativeAIEx extends ChatGoogleGenerativeAI {
  /**
   * Binds configuration options with automatic tool schema transformation.
   * 
   * This method intercepts the bind() call and automatically transforms any tools
   * using transformMcpToolsForGemini() before passing them to the parent class.
   * 
   * @param kwargs - Configuration options to bind, potentially including tools
   * @returns New ChatGoogleGenerativeAIEx instance with transformed tools
   * 
   * @example
   * ```typescript
   * const boundLLM = llm.bind({ 
   *   tools: mcpTools,      // Auto-transformed for Gemini compatibility
   *   temperature: 0.5 
   * });
   * ```
   */
  override bind(kwargs: Partial<GoogleGenerativeAIChatCallOptions>): ChatGoogleGenerativeAIEx {
    if (kwargs.tools) {
      const transformedKwargs = {
        ...kwargs,
        tools: transformMcpToolsForGemini(kwargs.tools as any[])
      };
      return super.bind(transformedKwargs) as ChatGoogleGenerativeAIEx;
    }
    return super.bind(kwargs) as ChatGoogleGenerativeAIEx;
  }

  /**
   * Binds tools with automatic schema transformation.
   * 
   * This convenience method specifically handles tool binding and automatically
   * transforms all tools using transformMcpToolsForGemini() for Gemini compatibility.
   * 
   * @param tools - Array of tools to bind (MCP tools, StructuredTools, etc.)
   * @param kwargs - Additional configuration options
   * @returns New ChatGoogleGenerativeAIEx instance with transformed tools
   * 
   * @example
   * ```typescript
   * const llmWithTools = llm.bindTools(mcpTools, { temperature: 0 });
   * ```
   */
  override bindTools(tools: any[], kwargs?: Partial<GoogleGenerativeAIChatCallOptions>): ChatGoogleGenerativeAIEx {
    const transformedTools = transformMcpToolsForGemini(tools);
    return super.bindTools(transformedTools, kwargs) as ChatGoogleGenerativeAIEx;
  }
}
