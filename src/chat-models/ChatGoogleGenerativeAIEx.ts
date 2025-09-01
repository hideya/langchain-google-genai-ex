import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { transformMcpToolForGemini } from "../schema-adapter/gemini.js";

/**
 * Remaps model names from LangChain format to Google's expected format
 * Converts "google-*" to "gemini-*" and handles model prefixes
 * Note: This remapping is supposed to be handled by LangChain at some level,
 * but somehow it needs to be handled explicitly in this case.
 */
function remapModelName(input?: string): string | undefined {
  if (!input) return input;
  const m = input.match(/^(?:(models|tunedModels)\/)?(.+)$/);
  const prefix = m?.[1] ? `${m[1]}/` : "";
  let name = m ? m[2] : input;
  if (/^google-/.test(name)) {
    name = name.replace(/^google-/, "gemini-");
  }
  return prefix + name;
}

/**
 * Normalizes tool payloads to be compatible with Gemini's API requirements
 * Transforms LangChain/JSON Schema tools into Gemini-friendly function declarations
 */
function normalizeGeminiToolsPayload(req: any): any {
  if (!req?.tools) return req;
  
  req.tools = req.tools.map((tool: any) => {
    const fds = tool.function_declarations || tool.functionDeclarations;
    if (!Array.isArray(fds)) return tool;

    const normalized = fds.map((fd: any) => {
      const { functionDeclaration } = transformMcpToolForGemini({
        name: fd.name,
        description: fd.description,
        inputSchema: fd.parameters ?? {},
      });
      
      // Ensure parameters has a type if not set
      functionDeclaration.parameters ||= { type: "object" };
      if (!functionDeclaration.parameters.type) {
        functionDeclaration.parameters.type = "object";
      }
      
      return functionDeclaration;
    });

    return { functionDeclarations: normalized };
  });
  
  return req;
}

/**
 * Extended ChatGoogleGenerativeAI class with enhanced capabilities:
 * 
 * - Model name remapping (google-* → gemini-*)
 * - Enhanced cached content support with proper model name patching
 * - Tool payload normalization for better Gemini compatibility
 *   to support complex MCP tool schemas
 */
export class ChatGoogleGenerativeAIEx extends ChatGoogleGenerativeAI {
  constructor(fields: any) {
    // Remap the model name BEFORE calling super
    const patched = {
      ...fields,
      model: remapModelName(String(fields.model ?? "").replace(/^models\//, "")),
    };
    super(patched);
  }

  /**
   * Enhanced cached content support with proper model name remapping
   * Fixes issues where cached content models revert to unsupported google-* names
   */
  override useCachedContent(
    cachedContent: any, 
    modelParams?: any, 
    requestOptions?: any
  ): void {
    if (!this.apiKey) return;
    
    const patchedCached = {
      ...cachedContent,
      model: remapModelName(String(cachedContent.model ?? "").replace(/^models\//, "")),
    };
    
    const patchedParams = modelParams?.model
      ? { ...modelParams, model: remapModelName(modelParams.model) }
      : modelParams;

    // NOTE: It is required to access the private property to implement this
    // @ts-expect-error: Intentional access to private property for cached content functionality
    this.client = new GoogleGenerativeAI(this.apiKey)
      .getGenerativeModelFromCachedContent(patchedCached, patchedParams, requestOptions);
  }

  /**
   * Enhanced invocation parameters with Gemini-compatible tool normalization
   * Automatically transforms complex tool schemas to work with Gemini's API
   */
  override invocationParams(options?: any): any {
    const req = super.invocationParams(options);
    return normalizeGeminiToolsPayload({ ...req });
  }
}
