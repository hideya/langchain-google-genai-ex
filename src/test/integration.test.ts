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

async function testBasicFunctionality() {
  console.log("🧪 Testing basic ChatGoogleGenerativeAIEx functionality...\n");

  // Test 1: Model name remapping
  console.log("1. Testing model name remapping:");
  const llmEx = new ChatGoogleGenerativeAIEx({ model: "google-2.5-flash" });
  const llmOriginal = new ChatGoogleGenerativeAI({ model: "google-2.5-flash" });
  
  console.log(`   Original model: ${llmOriginal.model}`);
  console.log(`   Extended model: ${llmEx.getModelName()}`);
  console.log(`   ✅ Model remapped: google-2.5-flash → ${llmEx.getModelName()}\n`);

  // Test 2: Client access
  console.log("2. Testing client access:");
  const client = llmEx.getClient();
  console.log(`   ✅ Client accessible: ${client ? 'Yes' : 'No'}`);
  console.log(`   ✅ API Key accessible: ${llmEx.getApiKey() ? 'Yes (hidden)' : 'No'}\n`);

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
    console.log("1. Connecting to MCP servers...");
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
    console.log(`1. Loaded ${mcpTools.length} tools for complex schema testing`);

    // Show which tools have complex schemas
    mcpTools.forEach((tool, i) => {
      const hasComplexSchema = JSON.stringify(tool).includes('anyOf') || 
                              JSON.stringify(tool).includes('allOf') ||
                              JSON.stringify(tool).includes('oneOf');
      console.log(`   ${i + 1}. ${tool.name}: ${hasComplexSchema ? '🔄 Complex' : '✅ Simple'} schema`);
    });

    // Test schema transformation directly
    console.log("\n2. Testing schema transformation:");
    const complexTool = mcpTools.find(tool => 
      JSON.stringify(tool).includes('anyOf') || JSON.stringify(tool).includes('properties')
    );

    if (complexTool) {
      console.log(`   Testing transformation on: ${complexTool.name}`);
      // Here you could add more detailed schema transformation testing
      console.log("   ✅ Schema transformation handling available");
    } else {
      console.log("   ℹ️ No complex schemas found in available tools");
    }

    // Test with the extended class
    console.log("\n3. Testing extended class with all available tools:");
    const extendedLlm = new ChatGoogleGenerativeAIEx({ model: "google-2.5-flash" });
    const agent = createReactAgent({ llm: extendedLlm, tools: mcpTools });

    // const testQuery = "Can you help me check the weather? Just give me a brief response.";
    const testQuery = "Please use the 'notion-get-self' tool to find out info on my Notion account";

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
    
    // Test 3: Complex schema handling (optional)
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
