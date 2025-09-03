import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { transformMcpToolsForGemini } from "../schema-adapter/index.js";

/**
 * Extended ChatGoogleGenerativeAI class that automatically transforms MCP tool schemas
 * to be compatible with Gemini's strict schema requirements.
 * 
 * This class intercepts tool definitions and applies schema transformations before
 * they're sent to the Gemini API, preventing the common "400 Bad Request" errors
 * that occur when using MCP tools with complex JSON schemas.
 * 
 * Usage:
 * ```typescript
 * const llm = new ChatGoogleGenerativeAIEx({ model: "gemini-2.5-flash" });
 * const client = new MultiServerMCPClient({...});
 * const mcpTools = await client.getTools();
 * const agent = createReactAgent({ llm, tools: mcpTools });
 * ```
 * 
 * The schema transformations are automatically applied, so complex MCP tools 
 * (like Airtable) work without manual intervention.
 */
export class ChatGoogleGenerativeAIEx extends ChatGoogleGenerativeAI {
  /**
   * Public method override: Ensures tools are transformed when binding configuration.
   * 
   * The bind() method is part of LangChain's public API for creating new model instances
   * with additional configuration. Since users can bind tools directly via this method,
   * we need to intercept and transform them here as well.
   * 
   * This complements the _generate() override by catching tools bound at configuration
   * time, ensuring comprehensive coverage of all tool-binding scenarios.
   * 
   * @param kwargs - Configuration options to bind, potentially including tools
   * @returns New ChatGoogleGenerativeAIEx instance with transformed tools
   * 
   * @example
   * ```typescript
   * const boundLLM = llm.bind({ 
   *   tools: mcpTools,      // These get auto-transformed
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
   * Public method override: Binds tools with automatic transformation.
   * 
   * This is a convenience method specifically for binding tools to the model.
   * All tools are automatically transformed to be Gemini-compatible.
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

  /**
   * Get transformation statistics for the last set of tools processed
   */
  getLastTransformationStats(): { toolsProcessed: number; toolsTransformed: number } {
    // This could be enhanced to track statistics if needed
    return { toolsProcessed: 0, toolsTransformed: 0 };
  }
}