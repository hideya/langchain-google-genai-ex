import "dotenv/config";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatGoogleGenerativeAIEx } from "../chat-models/ChatGoogleGenerativeAIEx.js";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage } from "@langchain/core/messages";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";

/**
 * Negative test for ChatGoogleGenerativeAI vs ChatGoogleGenerativeAIEx
 * 
 * This test demonstrates the specific issues that ChatGoogleGenerativeAIEx solves:
 * 1. Complex schema validation errors with original ChatGoogleGenerativeAI
 * 2. Model name issues (google-* vs gemini-*)
 * 3. Tool payload compatibility problems
 * 
 * Expected behavior:
 * - Original ChatGoogleGenerativeAI: ❌ Fails with complex MCP tools (Notion)
 * - ChatGoogleGenerativeAIEx: ✅ Handles complex MCP tools successfully
 */

interface TestResult {
  success: boolean;
  error?: string;
  response?: string;
}

async function testOriginalChatGoogleGenerativeAI(mcpTools: any[]): Promise<TestResult> {
  console.log("🧪 Testing original ChatGoogleGenerativeAI with complex MCP tools...\n");

  try {
    // Test 1: Model name issue
    console.log("\n1. Testing model name handling:");
    console.log("   Creating ChatGoogleGenerativeAI with model: 'google-2.5-flash'");
    
    const originalLlm = new ChatGoogleGenerativeAI({ model: "google-2.5-flash" });
    console.log(`   ✅ Model created. Internal model name: ${originalLlm.model}`);
    
    // Test 2: Complex tool integration
    console.log("\n2. Testing with complex MCP tools:");
    console.log(`   Available tools: ${mcpTools.map(t => t.name).join(', ')}`);
    
    const agent = createReactAgent({ llm: originalLlm, tools: mcpTools });
    
    // Use a query that would trigger tool usage
    const query = "Please use the 'notion-get-self' tool to get information about my Notion account";
    console.log(`   Query: ${query}`);
    console.log("   Attempting to invoke agent with complex schemas...\n");
    
    const result = await agent.invoke({ 
      messages: [new HumanMessage(query)],
    });
    
    const response = result.messages[result.messages.length - 1].content;
    console.log("   🤔 Unexpected: Original ChatGoogleGenerativeAI succeeded!");
    console.log("   This might mean the upstream issue has been fixed.");
    
    return {
      success: true,
      response: String(response)
    };
    
  } catch (error: any) {
    console.log("   ❌ Expected failure occurred!");
    console.log(`   Error type: ${error.constructor.name}`);
    console.log(`   Error message: ${error.message}`);
    
    // Check for specific Gemini schema validation errors
    if (error.message.includes('Invalid JSON payload') || 
        error.message.includes('Proto field is not repeating') ||
        error.message.includes('Unknown name "type"') ||
        error.message.includes('GoogleGenerativeAIFetchError')) {
      console.log("   ✅ This is the expected Gemini schema validation error!");
      return {
        success: false,
        error: error.message
      };
    } else {
      console.log("   ⚠️ Unexpected error type - might be a different issue");
      return {
        success: false,
        error: error.message
      };
    }
  }
}

async function testExtendedChatGoogleGenerativeAIEx(mcpTools: any[]): Promise<TestResult> {
  console.log("🚀 Testing ChatGoogleGenerativeAIEx with the same complex MCP tools...\n");

  try {
    console.log("\n1. Creating ChatGoogleGenerativeAIEx with model: 'google-2.5-flash'");
    const extendedLlm = new ChatGoogleGenerativeAIEx({ model: "google-2.5-flash" });
    console.log(`   ✅ Model created. Remapped model name: ${extendedLlm.model}`);
    console.log(`   ✅ Model name transformation: google-2.5-flash → ${extendedLlm.model}`);
    
    console.log("\n2. Testing with complex MCP tools:");
    const agent = createReactAgent({ llm: extendedLlm, tools: mcpTools });
    
    const query = "Please use the 'notion-get-self' tool to get information about my Notion account";
    console.log(`   Query: ${query}`);
    console.log("   Invoking agent with schema transformation...\n");
    
    const result = await agent.invoke({ 
      messages: [new HumanMessage(query)],
    });
    
    const response = result.messages[result.messages.length - 1].content;
    console.log("   ✅ ChatGoogleGenerativeAIEx succeeded!");
    console.log(`   Response: ${String(response).substring(0, 150)}...`);
    
    return {
      success: true,
      response: String(response)
    };
    
  } catch (error: any) {
    console.log("   ❌ Unexpected: ChatGoogleGenerativeAIEx failed!");
    console.log(`   Error: ${error.message}`);
    console.log("   This suggests there might be an issue with the extended implementation.");
    
    return {
      success: false,
      error: error.message
    };
  }
}

async function runNegativeTests() {
  console.log("🔍 ChatGoogleGenerativeAI vs ChatGoogleGenerativeAIEx Negative Tests\n");
  console.log("=" + "=".repeat(70) + "\n");

  if (!process.env.GOOGLE_API_KEY) {
    console.error("❌ GOOGLE_API_KEY environment variable is required!");
    process.exit(1);
  }

  // Set up MCP client with Notion (complex schemas)
  const client = new MultiServerMCPClient({
    throwOnLoadError: true,
    prefixToolNameWithServerName: false,
    additionalToolNamePrefix: "",
    useStandardContentBlocks: true,
    mcpServers: {
      notionMCP: {
        transport: "stdio",
        command: "npx",
        args: ["-y", "mcp-remote", "https://mcp.notion.com/mcp"],
      }
    }
  });

  try {
    console.log("📡 Setting up MCP client with Notion server...");
    const mcpTools = await client.getTools();
    console.log(`✅ Connected! Found ${mcpTools.length} tools with complex schemas\n`);
    
    // Show tool complexity
    mcpTools.forEach((tool, i) => {
      const toolStr = JSON.stringify(tool);
      const hasComplexSchema = toolStr.includes('anyOf') || 
                              toolStr.includes('allOf') ||
                              toolStr.includes('oneOf') ||
                              toolStr.length > 1000; // Very detailed schema
      console.log(`   ${i + 1}. ${tool.name}: ${hasComplexSchema ? '🔄 Complex schema' : '✅ Simple schema'}`);
    });
    console.log();

    // Run tests
    const originalResult = await testOriginalChatGoogleGenerativeAI(mcpTools);
    console.log("=" + "=".repeat(70) + "\n");
    const extendedResult = await testExtendedChatGoogleGenerativeAIEx(mcpTools);
    
    // Analyze results
    console.log("\n" + "=" + "=".repeat(70));
    console.log("📊 TEST RESULTS SUMMARY\n");
    
    if (!originalResult.success && extendedResult.success) {
      console.log("🎉 PERFECT! This demonstrates the value of ChatGoogleGenerativeAIEx:");
      console.log("   ❌ Original ChatGoogleGenerativeAI: FAILED (expected)");
      console.log(`      Reason: ${originalResult.error?.substring(0, 100)}...`);
      console.log("   ✅ ChatGoogleGenerativeAIEx: SUCCEEDED");
      console.log("   \n🏆 Your package successfully solves the upstream compatibility issue!");
      
    } else if (originalResult.success && extendedResult.success) {
      console.log("🤔 INTERESTING: Both implementations succeeded!");
      console.log("   This might indicate that:");
      console.log("   1. The upstream issue has been fixed in @langchain/google-genai");
      console.log("   2. The current MCP tools have simpler schemas than expected");
      console.log("   3. The test environment is different");
      console.log("   \n💡 Consider updating your package description or testing with more complex schemas.");
      
    } else if (!originalResult.success && !extendedResult.success) {
      console.log("❌ CONCERNING: Both implementations failed!");
      console.log("   This suggests there might be a different underlying issue.");
      console.log("   \n🔧 This needs investigation - the extended class should work!");
      
    } else {
      console.log("🚨 UNEXPECTED: Original succeeded but extended failed!");
      console.log("   This suggests an issue with the ChatGoogleGenerativeAIEx implementation.");
      console.log("   \n🐛 This needs immediate debugging!");
    }
    
  } catch (error: any) {
    console.error(`\n❌ Negative test setup failed: ${error.message}`);
    console.log("   This might be due to:");
    console.log("   - Network issues connecting to MCP servers");
    console.log("   - Missing dependencies");
    console.log("   - Configuration problems");
  } finally {
    await client.close();
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runNegativeTests();
}

export { runNegativeTests };
