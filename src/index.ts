/**
 * @hideya/langchain-google-genai-ex
 * 
 * Drop-in replacement for ChatGoogleGenerativeAI that automatically fixes
 * schema compatibility issues with MCP tools and Google Gemini.
 * 
 * Simply replace:
 *   import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
 * With:
 *   import { ChatGoogleGenerativeAIEx } from '@hideya/langchain-google-genai-ex';
 * 
 * All MCP tool schemas are automatically transformed for Gemini compatibility.
 */

// Chat Models - Extended classes with automatic schema transformation
export { ChatGoogleGenerativeAIEx } from "./ChatGoogleGenerativeAIEx.js";

// // Re-export useful types from the base package
// export type { ChatGoogleGenerativeAI } from "@langchain/google-genai";
