import { ChatGoogleGenerativeAI, GoogleGenerativeAIChatCallOptions } from "@langchain/google-genai";
import { transformMcpToolForGemini } from "../schema-adapter/gemini.js";
import { BaseMessage } from "@langchain/core/messages";
import { ChatResult } from "@langchain/core/outputs";
import { StructuredTool } from "@langchain/core/tools";

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
   * Override the _generate method to intercept and transform tools before sending to Gemini
   */
  async _generate(
    messages: BaseMessage[],
    options?: GoogleGenerativeAIChatCallOptions,
    runManager?: any
  ): Promise<ChatResult> {
    // If no tools are provided, use the parent implementation as-is
    if (!options?.tools || !Array.isArray(options.tools) || options.tools.length === 0) {
      return super._generate(messages, options as any, runManager);
    }

    // Transform the tools to be Gemini-compatible
    const transformedOptions = {
      ...options,
      tools: this.transformTools(options.tools)
    };

    // Call the parent implementation with transformed tools
    return super._generate(messages, transformedOptions, runManager);
  }

  /**
   * Transform tools to be compatible with Gemini's schema requirements
   */
  private transformTools(tools: any[]): any[] {
    return tools.map(tool => {
      try {
        // Handle different tool formats
        if (this.isMcpTool(tool)) {
          return this.transformMcpTool(tool);
        } else if (this.isStructuredTool(tool)) {
          return this.transformStructuredTool(tool);
        } else if (this.isRunnableTool(tool)) {
          return this.transformRunnableTool(tool);
        }
        
        // If we can't identify the tool type, return as-is and hope for the best
        console.warn(`ChatGoogleGenerativeAIEx: Unknown tool format, passing through unchanged:`, typeof tool);
        return tool;
      } catch (error) {
        console.error(`ChatGoogleGenerativeAIEx: Error transforming tool, passing through unchanged:`, error);
        return tool;
      }
    });
  }

  /**
   * Check if tool looks like an MCP tool
   */
  private isMcpTool(tool: any): boolean {
    return tool && 
           typeof tool === 'object' && 
           typeof tool.name === 'string' &&
           (tool.inputSchema || tool.input_schema) &&
           typeof tool.invoke === 'function';
  }

  /**
   * Check if tool is a LangChain StructuredTool
   */
  private isStructuredTool(tool: any): boolean {
    return tool instanceof StructuredTool || 
           (tool && typeof tool.schema !== 'undefined' && typeof tool.name === 'string');
  }

  /**
   * Check if tool is a Runnable tool with schema
   */
  private isRunnableTool(tool: any): boolean {
    return tool &&
           typeof tool === 'object' &&
           typeof tool.name === 'string' &&
           (tool.func || tool.schema) &&
           typeof tool.invoke === 'function';
  }

  /**
   * Transform an MCP tool
   */
  private transformMcpTool(tool: any): any {
    const inputSchema = tool.inputSchema || tool.input_schema || {};
    
    const transformResult = transformMcpToolForGemini({
      name: tool.name,
      description: tool.description,
      inputSchema: inputSchema
    });

    if (transformResult.wasTransformed && transformResult.changesSummary) {
      console.log(`ChatGoogleGenerativeAIEx: Transformed MCP tool '${tool.name}': ${transformResult.changesSummary}`);
    }

    // Return the tool with transformed schema
    return {
      ...tool,
      inputSchema: transformResult.functionDeclaration.parameters,
      input_schema: transformResult.functionDeclaration.parameters,
      // Preserve the original schema in case it's needed for debugging
      _originalInputSchema: inputSchema
    };
  }

  /**
   * Transform a LangChain StructuredTool
   */
  private transformStructuredTool(tool: any): any {
    if (!tool.schema) {
      return tool;
    }

    const transformResult = transformMcpToolForGemini({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.schema
    });

    if (transformResult.wasTransformed && transformResult.changesSummary) {
      console.log(`ChatGoogleGenerativeAIEx: Transformed StructuredTool '${tool.name}': ${transformResult.changesSummary}`);
    }

    return {
      ...tool,
      schema: transformResult.functionDeclaration.parameters,
      _originalSchema: tool.schema
    };
  }

  /**
   * Transform a Runnable tool
   */
  private transformRunnableTool(tool: any): any {
    const schema = tool.schema || tool.func?.schema;
    if (!schema) {
      return tool;
    }

    const transformResult = transformMcpToolForGemini({
      name: tool.name,
      description: tool.description,
      inputSchema: schema
    });

    if (transformResult.wasTransformed && transformResult.changesSummary) {
      console.log(`ChatGoogleGenerativeAIEx: Transformed Runnable tool '${tool.name}': ${transformResult.changesSummary}`);
    }

    const result = { ...tool };
    if (result.schema) {
      result.schema = transformResult.functionDeclaration.parameters;
      result._originalSchema = schema;
    }
    if (result.func?.schema) {
      result.func.schema = transformResult.functionDeclaration.parameters;
      if (!result.func._originalSchema) {
        result.func._originalSchema = schema;
      }
    }

    return result;
  }

  /**
   * Also override the bind method to ensure tools are transformed when tools are bound
   */
  bind(kwargs: Partial<CallOptions>): ChatGoogleGenerativeAIEx {
    const boundInstance = super.bind(kwargs) as ChatGoogleGenerativeAIEx;
    
    // If tools were provided in bind, they need transformation too
    if (kwargs.tools) {
      const transformedKwargs = {
        ...kwargs,
        tools: this.transformTools(kwargs.tools as any[])
      };
      return super.bind(transformedKwargs) as ChatGoogleGenerativeAIEx;
    }
    
    return boundInstance;
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
    const transformedTools = this.transformTools(tools);
    return super.bindTools(transformedTools, kwargs) as ChatGoogleGenerativeAIEx;
  }

  /**
   * Static method to transform tools independently (for debugging/testing)
   */
  static transformToolsForGemini(tools: any[]): any[] {
    const instance = new ChatGoogleGenerativeAIEx({});
    return instance.transformTools(tools);
  }

  /**
   * Get transformation statistics for the last set of tools processed
   */
  getLastTransformationStats(): { toolsProcessed: number; toolsTransformed: number } {
    // This could be enhanced to track statistics if needed
    return { toolsProcessed: 0, toolsTransformed: 0 };
  }
}