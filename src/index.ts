/**
 * @hideya/langchain-google-genai-ex
 * 
 * Extended ChatGoogleGenerativeAI with access to internal client for advanced use cases
 * 
 * This package provides enhanced functionality for Google Generative AI integration with LangChain:
 * - Model name remapping (google-* → gemini-*)
 * - Access to internal Google AI client
 * - Enhanced cached content support
 * - Tool payload normalization for Gemini compatibility
 * - Support for complex MCP tool schemas
 */

// Main export
export { ChatGoogleGenerativeAIEx } from "./ChatGoogleGenerativeAIEx.js";

// Schema transformation utilities
export { 
  makeJsonSchemaGeminiCompatible,
  transformMcpToolForGemini,
  validateGeminiSchema
} from "./schema-adapter-gemini.js";

// Type definitions
export type { 
  JsonSchemaDraft7, 
  TransformResult 
} from "./schema-adapter-types.js";

// Re-export useful types from the base package
export type { ChatGoogleGenerativeAI } from "@langchain/google-genai";
export type { GoogleGenerativeAI } from "@google/generative-ai";
