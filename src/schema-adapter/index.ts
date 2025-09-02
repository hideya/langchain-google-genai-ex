import { transformMcpToolForGemini } from "./gemini.js";

/**
 * Transforms MCP tools to be compatible with Gemini's schema requirements
 * when used with LangChain.js
 * 
 * @param mcpTools - Array of MCP tools from MultiServerMCPClient.getTools()
 * @returns Array of tools with Gemini-compatible schemas
 * 
 * @example
 * ```typescript
 * import { transformMcpToolsForGemini } from '@hideya/langchain-google-genai-ex/schema-adapter';
 * import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
 * import { createReactAgent } from '@langchain/langgraph/prebuilt';
 * 
 * const mcpTools = await client.getTools();
 * const geminiTools = transformMcpToolsForGemini(mcpTools);
 * 
 * const llm = new ChatGoogleGenerativeAI({ model: "gemini-2.5-flash" });
 * const agent = createReactAgent({ llm, tools: geminiTools });
 * ```
 */
export function transformMcpToolsForGemini(mcpTools: any[]): any[] {
  return mcpTools.map(tool => {
    const { functionDeclaration } = transformMcpToolForGemini({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.schema || {}
    });
    
    return {
      ...tool,
      schema: functionDeclaration.parameters
    };
  });
}

// Re-export all transformation functions for advanced use cases
export { 
  transformMcpToolForGemini,
  makeJsonSchemaGeminiCompatible,
  validateGeminiSchema
} from "./gemini.js";
export * from "./types.js";
