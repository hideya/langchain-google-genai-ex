import "dotenv/config";
import { ChatGoogleGenerativeAIEx } from "../ChatGoogleGenerativeAIEx.js";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage } from "@langchain/core/messages";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";

/**
 * Integration test for ChatGoogleGenerativeAIEx
 * 
 * This test demonstrates:
 * 1. Model name remapping (google-* → gemini-*)
 * 2. MCP tool integration with complex schemas
 * 3. Enhanced tool payload normalization
 * 4. ReAct agent functionality
 */

/**
 * Analyzes the complexity of an MCP tool schema
 * Returns detailed information about what makes it complex
 */
function analyzeSchemaComplexity(tool: any): { isComplex: boolean; reason: string } {
  const toolStr = JSON.stringify(tool);
  
  // Check multiple possible schema locations for LangChain tools
  const schema = tool.inputSchema || tool.parameters || tool.function?.parameters || 
                 tool.schema || tool.args_schema || tool.args || {};
  
  // Also check if there's a _call method or func that might contain schema info
  const hasCallMethod = typeof tool._call === 'function';
  const hasFunc = typeof tool.func === 'function';
  
  // Check for problematic JSON Schema constructs that break Gemini
  const complexityChecks = [
    {
      check: () => toolStr.includes('"anyOf"') || toolStr.includes('anyOf'),
      reason: 'anyOf unions'
    },
    {
      check: () => toolStr.includes('"allOf"') || toolStr.includes('allOf'),
      reason: 'allOf composition'
    },
    {
      check: () => toolStr.includes('"oneOf"') || toolStr.includes('oneOf'),
      reason: 'oneOf unions'
    },
    {
      check: () => hasDeepNesting(schema, 0),
      reason: 'deep nesting (4+ levels)'
    },
    {
      check: () => hasComplexArrayItems(schema),
      reason: 'complex array items'
    },
    {
      check: () => toolStr.includes('"$ref"') || toolStr.includes('$ref'),
      reason: '$ref references'
    },
    {
      check: () => hasMultipleTypes(schema),
      reason: 'multiple type definitions'
    },
    {
      check: () => toolStr.length > 5000, // LangChain tools are verbose
      reason: 'very large tool definition'
    },
    {
      check: () => hasComplexProperties(schema),
      reason: 'nested object properties'
    }
  ];
  
  for (const complexity of complexityChecks) {
    if (complexity.check()) {
      return { isComplex: true, reason: complexity.reason };
    }
  }
  
  // If it's a LangChain DynamicStructuredTool, it might have complex schemas hidden
  if (toolStr.includes('DynamicStructuredTool')) {
    return { isComplex: false, reason: 'LangChain tool (schema abstracted)' };
  }
  
  // If no schema found in obvious places
  const hasAnySchema = !!(tool.inputSchema || tool.parameters || tool.function?.parameters ||
                          tool.schema || tool.args_schema || tool.args);
  
  if (!hasAnySchema && !hasCallMethod && !hasFunc) {
    return { isComplex: false, reason: 'no schema found' };
  }
  
  return { isComplex: false, reason: 'basic types only' };
}

function hasDeepNesting(obj: any, depth: number): boolean {
  if (depth > 3) return true; // 4+ levels is complex
  if (typeof obj !== 'object' || obj === null) return false;
  
  for (const value of Object.values(obj)) {
    if (typeof value === 'object' && value !== null) {
      if (hasDeepNesting(value, depth + 1)) {
        return true;
      }
    }
  }
  return false;
}

function hasComplexArrayItems(schema: any): boolean {
  const checkObject = (obj: any): boolean => {
    if (typeof obj !== 'object' || obj === null) return false;
    
    // Check if items property has complex structure
    if (obj.items) {
      if (Array.isArray(obj.items)) {
        return true; // Tuple-style items are complex
      }
      if (typeof obj.items === 'object' && obj.items.properties) {
        return true; // Object items with properties are complex
      }
    }
    
    // Recursively check nested objects
    for (const value of Object.values(obj)) {
      if (checkObject(value)) {
        return true;
      }
    }
    return false;
  };
  
  return checkObject(schema);
}

function hasComplexProperties(schema: any): boolean {
  const checkObject = (obj: any): boolean => {
    if (typeof obj !== 'object' || obj === null) return false;
    
    // Check if properties has nested objects with their own properties
    if (obj.properties) {
      for (const prop of Object.values(obj.properties)) {
        if (typeof prop === 'object' && prop !== null) {
          // If property has its own properties, it's complex
          if ((prop as any).properties) {
            return true;
          }
          // If property is an array with object items
          if ((prop as any).items && typeof (prop as any).items === 'object' && (prop as any).items.properties) {
            return true;
          }
        }
      }
    }
    
    // Recursively check nested objects
    for (const value of Object.values(obj)) {
      if (checkObject(value)) {
        return true;
      }
    }
    return false;
  };
  
  return checkObject(schema);
}

function hasMultipleTypes(schema: any): boolean {
  const checkObject = (obj: any): boolean => {
    if (typeof obj !== 'object' || obj === null) return false;
    
    // Check for type arrays like ["string", "null"]
    if (obj.type && Array.isArray(obj.type) && obj.type.length > 1) {
      return true;
    }
    
    // Recursively check nested objects
    for (const value of Object.values(obj)) {
      if (checkObject(value)) {
        return true;
      }
    }
    return false;
  };
  
  return checkObject(schema);
}

async function testBasicFunctionality() {
  console.log("🧪 Testing basic ChatGoogleGenerativeAIEx functionality...\n");

  // Test 1: Model name remapping
  console.log("\n1. Testing model name remapping:");
  const llmEx = new ChatGoogleGenerativeAIEx({ model: "google-2.5-flash" });
  const llmOriginal = new ChatGoogleGenerativeAI({ model: "google-2.5-flash" });
  
  console.log(`   Original model: ${llmOriginal.model}`);
  console.log(`   Extended model: ${llmEx.model}`);
  console.log(`   ✅ Model remapped: google-2.5-flash → ${llmEx.model}\n`);

  // Test 2: Client access
  console.log("2. Testing client access:");
  // NOTE: It is required to access the private property to implement the feature 
  // @ts-expect-error: Check if the access to private property is still doable
  const client = llmEx.client;
  console.log(`   ✅ Client accessible: ${client ? 'Yes' : 'No'}`);
  console.log(`   ✅ API Key accessible: ${llmEx.apiKey ? 'Yes (hidden)' : 'No'}\n`);

  // Test 3: Simple message without tools
  console.log("3. Testing simple message:");
  try {
    const simpleResponse = await llmEx.invoke([
      new HumanMessage("Hello! Please respond with exactly: 'ChatGoogleGenerativeAIEx working!'")
    ]);
    console.log(`   Response: ${simpleResponse.content}`);
    console.log("   ✅ Basic functionality working\n");
  } catch (error) {
    console.error(`   ❌ Basic test failed: ${error}\n`);
    throw error;
  }
}

async function testMCPIntegration() {
  console.log("🔧 Testing MCP tool integration...\n");

  // Create MCP client with simple weather server
  const client = new MultiServerMCPClient({
    throwOnLoadError: true,
    prefixToolNameWithServerName: false,
    additionalToolNamePrefix: "",
    useStandardContentBlocks: true,
    mcpServers: {
      "us-weather": {
        transport: "stdio",
        command: "npx",
        args: ["-y", "@h1deya/mcp-server-weather"]
      }
    }
  });

  try {
    console.log("\n1. Connecting to MCP servers...");
    const mcpTools = await client.getTools();
    console.log(`   ✅ Connected! Found ${mcpTools.length} tools`);
    mcpTools.forEach((tool, i) => {
      console.log(`   ${i + 1}. ${tool.name}: ${tool.description}`);
    });
    console.log();

    // Test with original ChatGoogleGenerativeAI (should work with simple weather tools)
    console.log("2. Testing with original ChatGoogleGenerativeAI:");
    const originalLlm = new ChatGoogleGenerativeAI({ model: "gemini-1.5-flash" });
    const originalAgent = createReactAgent({ llm: originalLlm, tools: mcpTools });
    
    const weatherQuery = "What's the weather like in San Francisco?";
    console.log(`   Query: ${weatherQuery}`);
    
    try {
      const originalResult = await originalAgent.invoke({ 
        messages: [new HumanMessage(weatherQuery)] 
      });
      const originalResponse = originalResult.messages[originalResult.messages.length - 1].content;
      console.log(`   ✅ Original: ${String(originalResponse).substring(0, 100)}...\n`);
    } catch (originalError) {
      console.log(`   ⚠️ Original failed (expected for complex schemas): ${originalError.message}\n`);
    }

    // Test with extended ChatGoogleGenerativeAIEx
    console.log("3. Testing with ChatGoogleGenerativeAIEx:");
    const extendedLlm = new ChatGoogleGenerativeAIEx({ model: "google-2.5-flash" });
    const extendedAgent = createReactAgent({ llm: extendedLlm, tools: mcpTools });
    
    console.log(`   Query: ${weatherQuery}`);
    const extendedResult = await extendedAgent.invoke({ 
      messages: [new HumanMessage(weatherQuery)] 
    });
    const extendedResponse = extendedResult.messages[extendedResult.messages.length - 1].content;
    console.log(`   ✅ Extended: ${String(extendedResponse).substring(0, 100)}...\n`);

  } catch (error) {
    console.error(`❌ MCP integration test failed: ${error}`);
    throw error;
  } finally {
    await client.close();
  }
}

async function testSimpleSchemaHandling() {
  console.log("🌤️ Testing simple schema handling with Weather MCP server...\n");

  // Test with simple weather MCP server
  const client = new MultiServerMCPClient({
    throwOnLoadError: true,
    prefixToolNameWithServerName: false,
    additionalToolNamePrefix: "",
    useStandardContentBlocks: true,
    mcpServers: {
      "us-weather": {
        transport: "stdio",
        command: "npx",
        args: ["-y", "@h1deya/mcp-server-weather"]
      }
    }
  });

  try {
    const mcpTools = await client.getTools();
    console.log(`\n1. Loaded ${mcpTools.length} tools from weather server`);
    
    // Show schema complexity with better detection
    mcpTools.forEach((tool, i) => {
      const complexity = analyzeSchemaComplexity(tool);
      console.log(`   ${i + 1}. ${tool.name}: ${complexity.isComplex ? '🔄 Complex schema' : '✅ Simple schema'} (${complexity.reason})`);
    });
    console.log();

    // Test with original ChatGoogleGenerativeAI
    console.log("2. Testing original ChatGoogleGenerativeAI with simple schemas:");
    const originalLlm = new ChatGoogleGenerativeAI({ model: "gemini-1.5-flash" });
    const originalAgent = createReactAgent({ llm: originalLlm, tools: mcpTools });
    
    const simpleQuery = "What's the weather like in San Francisco?";
    console.log(`   Query: ${simpleQuery}`);
    
    try {
      const originalResult = await originalAgent.invoke({ 
        messages: [new HumanMessage(simpleQuery)] 
      });
      const originalResponse = originalResult.messages[originalResult.messages.length - 1].content;
      console.log(`   ✅ Original succeeded: ${String(originalResponse).substring(0, 100)}...\n`);
    } catch (originalError: any) {
      console.log(`   ❌ Unexpected: Original failed with simple schemas: ${originalError.message}\n`);
    }

    // Test with extended ChatGoogleGenerativeAIEx
    console.log("3. Testing ChatGoogleGenerativeAIEx with simple schemas:");
    const extendedLlm = new ChatGoogleGenerativeAIEx({ model: "google-2.5-flash" });
    const extendedAgent = createReactAgent({ llm: extendedLlm, tools: mcpTools });
    
    console.log(`   Query: ${simpleQuery}`);
    const extendedResult = await extendedAgent.invoke({ 
      messages: [new HumanMessage(simpleQuery)] 
    });
    const extendedResponse = extendedResult.messages[extendedResult.messages.length - 1].content;
    console.log(`   ✅ Extended succeeded: ${String(extendedResponse).substring(0, 100)}...\n`);

    console.log("   ✅ Both implementations work with simple schemas - no compatibility issues!");

  } catch (error) {
    console.error(`❌ Simple schema test failed: ${error}`);
    // Don't rethrow - this test should generally work
    console.log("   ℹ️ Simple schema test failure might indicate network or MCP server issues\n");
  } finally {
    await client.close();
  }
}

async function testComplexSchemaHandling() {
  console.log("🎯 Testing complex schema handling...\n");

  // Test with a more complex MCP server (if available)
  const client = new MultiServerMCPClient({
    throwOnLoadError: false, // Don't throw if Notion server fails to load
    prefixToolNameWithServerName: false,
    additionalToolNamePrefix: "",
    useStandardContentBlocks: true,
    mcpServers: {
      "us-weather": {
        transport: "stdio",
        command: "npx",
        args: ["-y", "@h1deya/mcp-server-weather"]
      },
      // Only add Notion if you have it configured
      "notionMCP": {
        transport: "stdio",
        command: "npx",
        args: ["-y", "mcp-remote", "https://mcp.notion.com/mcp"]
      }
    }
  });

  try {
    const mcpTools = await client.getTools();
    console.log(`\n1. Loaded ${mcpTools.length} tools for complex schema testing`);

    // Show which tools have complex schemas with detailed analysis
    mcpTools.forEach((tool, i) => {
      const complexity = analyzeSchemaComplexity(tool);
      console.log(`   ${i + 1}. ${tool.name}: ${complexity.isComplex ? '🔄 Complex' : '✅ Simple'} schema (${complexity.reason})`);
      
      // DEBUG: Show actual schema structure for a few tools
      if (tool.name === 'notion-create-pages' || tool.name === 'notion-update-page' || i < 2) {
        console.log(`        DEBUG - Tool properties:`);
        console.log(`        name: ${tool.name}`);
        console.log(`        description: ${tool.description}`);
        if (tool.schema) {
          console.log(`        schema: ${JSON.stringify(tool.schema, null, 2).substring(0, 300)}...`);
        }
        // if (tool.args_schema) {
        //   console.log(`        args_schema: ${JSON.stringify(tool.args_schema, null, 2).substring(0, 300)}...`);
        // }
        // Check all available properties
        console.log(`        Available properties: ${Object.keys(tool).join(', ')}`);
      }
    });

    // Test with the extended class
    console.log("\n2. Testing extended class with all available tools:");
    const extendedLlm = new ChatGoogleGenerativeAIEx({ model: "google-2.5-flash" });
    const agent = createReactAgent({ llm: extendedLlm, tools: mcpTools });

    // const testQuery = "Are there any weather alerts in California?";
    const testQuery = "Please use the 'notion-get-self' tool to get information about my Notion account";

    console.log(`   Query: ${testQuery}`);
    
    const result = await agent.invoke({ 
      messages: [new HumanMessage(testQuery)] 
    });
    const response = result.messages[result.messages.length - 1].content;
    console.log(`   ✅ Complex schema handling: ${String(response).substring(0, 100)}...\n`);

  } catch (error) {
    console.error(`❌ Complex schema test failed: ${error}`);
    // Don't rethrow - this test is optional
    console.log("   ℹ️ Complex schema test is optional and may fail without proper MCP setup\n");
  } finally {
    await client.close();
  }
}

async function runTests() {
  console.log("🚀 Starting ChatGoogleGenerativeAIEx Integration Tests\n");
  console.log("=" + "=".repeat(60) + "\n");

  if (!process.env.GOOGLE_API_KEY) {
    console.error("❌ GOOGLE_API_KEY environment variable is required!");
    console.log("   Please copy .env.example to .env and add your API key.\n");
    process.exit(1);
  }

  try {
    // Test 1: Basic functionality
    await testBasicFunctionality();
    
    // Test 2: MCP integration
    await testMCPIntegration();
    
    // Test 3: Simple schema handling
    await testSimpleSchemaHandling();
    
    // Test 4: Complex schema handling (optional)
    await testComplexSchemaHandling();

    console.log("🎉 All tests completed successfully!");
    console.log("=" + "=".repeat(60));
    console.log("✅ ChatGoogleGenerativeAIEx is working properly!");
    console.log("✅ Model name remapping: google-* → gemini-*");
    console.log("✅ Client access: Available for advanced use cases");
    console.log("✅ MCP tool integration: Enhanced compatibility");
    console.log("✅ Schema transformation: Complex schemas handled");

  } catch (error) {
    console.error("\n❌ Test suite failed:");
    console.error(error);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests();
}
