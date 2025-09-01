import "dotenv/config";
import { transformMcpToolForGemini } from "../schema-adapter-gemini.js";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatGoogleGenerativeAIEx } from "../ChatGoogleGenerativeAIEx.js";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { HumanMessage } from "@langchain/core/messages";

/**
 * Demonstrates why upstream schema transformation approaches fail
 * 
 * This focused test shows that pre-transforming MCP tool schemas before passing 
 * them to LangChain.js still results in Gemini validation errors due to 
 * LangChain's internal "double conversion" process.
 * 
 * Focuses specifically on simple schema keyword issues (exclusiveMaximum, etc.)
 * 
 * Run standalone: node --loader ts-node/esm src/test/upstream-approach-failure.test.ts
 */

/**
 * The obvious approach everyone tries first:
 * Transform MCP tools to Gemini-compatible schemas before passing to LangChain
 */
function transformLCMcpToolsForGemini(mcpTools: any[]) {
  console.log(`   📝 Transforming ${mcpTools.length} tools with transformMcpToolForGemini()...`);
  
  return mcpTools.map(tool => {
    const { functionDeclaration } = transformMcpToolForGemini({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema || {}
    });
    
    // Convert back to LangChain tool format  
    return {
      ...tool,
      inputSchema: functionDeclaration.parameters
    };
  });
}

/**
 * Analyzes tool schemas to identify specific complexity issues
 */
function analyzeSchemaIssues(tools: any[]) {
  const issueMarkers = [
    'exclusiveMaximum',
    'exclusiveMinimum', 
    'anyOf',
    'allOf',
    'oneOf',
    '$ref',
    '$defs',
    '$schema'
  ];
  
  const toolsWithIssues: any[] = [];
  const cleanTools: any[] = [];
  
  tools.forEach(tool => {
    const toolStr = JSON.stringify(tool);
    const foundIssues = issueMarkers.filter(marker => toolStr.includes(marker));
    
    if (foundIssues.length > 0) {
      toolsWithIssues.push({ ...tool, issues: foundIssues });
    } else {
      cleanTools.push(tool);
    }
  });
  
  return { toolsWithIssues, cleanTools, total: tools.length };
}

async function testUpstreamApproachFailure() {
  console.log("🔍 Test 1: Pre-transformation with Fetch Server (has exclusiveMaximum issues)");
  console.log("-".repeat(70));
  
  const client = new MultiServerMCPClient({
    throwOnLoadError: true,
    mcpServers: {
      fetch: {
        transport: "stdio", 
        command: "uvx",
        args: ["mcp-server-fetch"]
      }
    }
  });

  try {
    console.log("\n1. Connecting to fetch MCP server...");
    const mcpTools = await client.getTools();
    console.log(`   ✅ Retrieved ${mcpTools.length} tools`);
    
    // Analyze specific schema issues
    const analysis = analyzeSchemaIssues(mcpTools);
    console.log(`   📊 Analysis: ${analysis.toolsWithIssues.length} tools with issues, ${analysis.cleanTools.length} clean tools`);
    
    if (analysis.toolsWithIssues.length > 0) {
      console.log("   🔍 Schema issues found:");
      analysis.toolsWithIssues.forEach(tool => {
        console.log(`     - ${tool.name}: ${tool.issues.join(', ')}`);
      });
    }

    // Apply the "obvious" upstream transformation 
    console.log("\n2. Applying upstream schema transformation...");
    const transformedTools = transformLCMcpToolsForGemini(mcpTools);
    console.log("   ✅ Schema transformation completed using transformMcpToolForGemini()");

    // Test with original ChatGoogleGenerativeAI (should fail due to double conversion)
    console.log("\n3. Testing with original ChatGoogleGenerativeAI...");
    const originalLlm = new ChatGoogleGenerativeAI({ 
      model: "gemini-1.5-flash",
      apiKey: process.env.GOOGLE_API_KEY
    });
    
    const originalAgent = createReactAgent({ 
      llm: originalLlm, 
      tools: transformedTools  // ❌ Pre-transformed tools
    });
    
    console.log("   🚀 Attempting to use pre-transformed tools...");
    
    try {
      const result = await originalAgent.invoke({
        messages: [new HumanMessage("Fetch the content from https://example.com")]
      });
      console.log("   ❌ UNEXPECTED: Original approach succeeded! (This should have failed)");
      return false; // Test expectation failed
    } catch (error: any) {
      if (error.message.includes('Invalid JSON payload received') && 
          (error.message.includes('exclusiveMaximum') || 
           error.message.includes('exclusiveMinimum') ||
           error.message.includes('anyOf'))) {
        console.log("   ✅ EXPECTED: Original approach failed with schema error");
        console.log(`   📝 Error: ${error.message.substring(0, 150)}...`);
        console.log("   💡 This proves LangChain's double conversion re-breaks fixed schemas");
        return true; // Test expectation met
      } else {
        console.log(`   ⚠️ Failed with unexpected error: ${error.message}`);
        return false; // Unexpected error
      }
    }
  } finally {
    await client.close();
  }
}

async function testExtendedClassSuccess() {
  console.log("\n🎯 Test 2: Same tools with ChatGoogleGenerativeAIEx");
  console.log("-".repeat(70));
  
  const client = new MultiServerMCPClient({
    throwOnLoadError: true,
    mcpServers: {
      fetch: {
        transport: "stdio",
        command: "uvx", 
        args: ["mcp-server-fetch"]
      }
    }
  });

  try {
    console.log("\n1. Reconnecting to fetch MCP server...");
    const mcpTools = await client.getTools();
    console.log(`   ✅ Retrieved ${mcpTools.length} tools`);

    // Test with ChatGoogleGenerativeAIEx (no transformation needed)
    console.log("\n2. Testing with ChatGoogleGenerativeAIEx...");
    const extendedLlm = new ChatGoogleGenerativeAIEx({ 
      model: "google-2.5-flash", // Also test model remapping
      apiKey: process.env.GOOGLE_API_KEY
    });
    
    const extendedAgent = createReactAgent({ 
      llm: extendedLlm, 
      tools: mcpTools  // ✅ Original tools, no pre-transformation needed
    });
    
    console.log("   🚀 Using original tools (no pre-transformation)...");
    
    const result = await extendedAgent.invoke({
      messages: [new HumanMessage("What tools are available for web content?")]
    });
    
    console.log("   ✅ SUCCESS: Extended class handled complex schemas automatically");
    console.log("   💡 This proves invocationParams() level fixes work correctly");
    console.log(`   📝 Response: ${String(result.messages[result.messages.length - 1].content).substring(0, 100)}...`);
    return true;
    
  } catch (error: any) {
    console.log(`   ❌ UNEXPECTED: Extended class failed: ${error.message}`);
    return false;
  } finally {
    await client.close();
  }
}

async function runUpstreamFailureTests() {
  console.log("🚨 Why Upstream Schema Transformation Approaches Fail");
  console.log("=".repeat(70));
  console.log("");
  console.log("This test demonstrates the core problem with upstream approaches:");
  console.log("");
  console.log("📝 The 'Obvious' Approach (that fails):");
  console.log("   1. Transform MCP tools with transformMcpToolForGemini()");
  console.log("   2. Pass transformed tools to original ChatGoogleGenerativeAI");  
  console.log("   3. Expect it to work (it doesn't due to double conversion)");
  console.log("");
  console.log("✅ The Working Approach:");
  console.log("   1. Pass original MCP tools to ChatGoogleGenerativeAIEx");
  console.log("   2. Schema fixes happen at invocationParams() level");
  console.log("   3. Works correctly (schemas fixed after LangChain processing)");
  console.log("");
  
  if (!process.env.GOOGLE_API_KEY) {
    console.error("❌ GOOGLE_API_KEY environment variable is required!");
    console.log("   Please copy .env.example to .env and add your API key.");
    process.exit(1);
  }

  const results = {
    upstreamFailure: false,
    extendedSuccess: false
  };

  try {
    // Test 1: Demonstrate upstream approach failure
    console.log("Starting tests with fetch server (known exclusiveMaximum issues)...\n");
    results.upstreamFailure = await testUpstreamApproachFailure();

    // Test 2: Show extended class success with same tools
    results.extendedSuccess = await testExtendedClassSuccess();

    // Summary
    console.log("\n" + "=".repeat(70));
    console.log("📊 TEST RESULTS SUMMARY");
    console.log("=".repeat(70));
    console.log(`✅ Upstream approach fails as expected:     ${results.upstreamFailure ? 'CONFIRMED ✓' : 'UNEXPECTED ✗'}`);
    console.log(`✅ Extended class fixes same tools:        ${results.extendedSuccess ? 'CONFIRMED ✓' : 'FAILED ✗'}`);
    
    const allTestsPassed = results.upstreamFailure && results.extendedSuccess;
    
    if (allTestsPassed) {
      console.log("\n🎉 CONCLUSION: Upstream approaches fail, ChatGoogleGenerativeAIEx succeeds!");
      console.log("");
      console.log("💡 WHY UPSTREAM FIXES FAIL:");
      console.log("   • LangChain.js applies convertToOpenAIFunction() to ALL tools");
      console.log("   • This happens AFTER any pre-transformation you do");
      console.log("   • Re-introduces problematic schema features (anyOf, exclusiveMaximum, etc.)");
      console.log("   • Only invocationParams() level fixes work reliably");
      console.log("");
      console.log("📋 FOR DOCUMENTATION:");
      console.log("   This test provides empirical evidence for LANGCHAIN_TOOL_CONVERSION_PIPELINE.md");
      console.log("   Developers can run this test themselves to see the exact failure pattern");
    } else {
      console.log("\n⚠️ Some tests had unexpected results - check details above");
    }

  } catch (error) {
    console.error("\n❌ Test suite failed:");
    console.error(error);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runUpstreamFailureTests();
}

export {
  transformLCMcpToolsForGemini,
  testUpstreamApproachFailure,
  testExtendedClassSuccess,
  runUpstreamFailureTests
};
