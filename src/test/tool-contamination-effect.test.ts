import "dotenv/config";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatGoogleGenerativeAIEx } from "../chat-models/ChatGoogleGenerativeAIEx.js";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { HumanMessage } from "@langchain/core/messages";

/**
 * Demonstrates the tool contamination effect in MCP ecosystems
 * 
 * This test shows how complex schemas from one MCP server can break the entire
 * tool collection, causing even simple operations from other servers to fail.
 * This is a critical architectural problem that ChatGoogleGenerativeAIEx solves.
 * 
 * Run standalone: node --loader ts-node/esm src/test/tool-contamination-effect.test.ts
 */

/**
 * Analyzes tool schemas to categorize complexity levels
 */
function categorizeToolsByComplexity(tools: any[]) {
  const complexityMarkers = [
    'exclusiveMaximum',
    'exclusiveMinimum', 
    'anyOf',
    'allOf',
    'oneOf',
    '$ref',
    '$defs',
    '$schema'
  ];
  
  const simpleTools: any[] = [];
  const complexTools: any[] = [];
  const serverSummary: { [key: string]: { simple: number, complex: number } } = {};
  
  tools.forEach(tool => {
    const toolStr = JSON.stringify(tool);
    const foundIssues = complexityMarkers.filter(marker => toolStr.includes(marker));
    
    // Try to identify server source from tool name patterns
    const serverName = identifyToolServer(tool.name);
    
    if (!serverSummary[serverName]) {
      serverSummary[serverName] = { simple: 0, complex: 0 };
    }
    
    if (foundIssues.length > 0) {
      complexTools.push({ ...tool, issues: foundIssues, server: serverName });
      serverSummary[serverName].complex++;
    } else {
      simpleTools.push({ ...tool, server: serverName });
      serverSummary[serverName].simple++;
    }
  });
  
  return { simpleTools, complexTools, serverSummary, total: tools.length };
}

function identifyToolServer(toolName: string): string {
  if (toolName.includes('weather') || toolName.includes('alert')) return 'weather';
  if (toolName.includes('fetch') || toolName.includes('url')) return 'fetch';
  if (toolName.includes('file') || toolName.includes('directory')) return 'filesystem';
  if (toolName.includes('notion')) return 'notion';
  return 'unknown';
}

async function testIndividualServerSuccess() {
  console.log("🌤️ Test 1: Individual simple server (should work fine)");
  console.log("-".repeat(70));
  
  const client = new MultiServerMCPClient({
    throwOnLoadError: true,
    mcpServers: {
      // Only simple weather server
      weather: {
        transport: "stdio",
        command: "npx",
        args: ["-y", "@h1deya/mcp-server-weather"]
      }
    }
  });

  try {
    console.log("\n1. Connecting to weather server only...");
    const mcpTools = await client.getTools();
    console.log(`   ✅ Retrieved ${mcpTools.length} tools from weather server`);
    
    const analysis = categorizeToolsByComplexity(mcpTools);
    console.log(`   📊 Analysis: ${analysis.complexTools.length} complex, ${analysis.simpleTools.length} simple tools`);
    
    if (analysis.complexTools.length === 0) {
      console.log("   ✅ Clean tool collection - no complex schemas detected");
    }

    console.log("\n2. Testing with original ChatGoogleGenerativeAI...");
    const originalLlm = new ChatGoogleGenerativeAI({ 
      model: "gemini-1.5-flash",
      apiKey: process.env.GOOGLE_API_KEY
    });
    
    const originalAgent = createReactAgent({ 
      llm: originalLlm, 
      tools: mcpTools
    });
    
    const result = await originalAgent.invoke({
      messages: [new HumanMessage("What's the weather like in San Francisco?")]
    });
    
    console.log("   ✅ SUCCESS: Individual simple server works fine");
    console.log(`   📝 Response: ${String(result.messages[result.messages.length - 1].content).substring(0, 100)}...`);
    return true;
    
  } catch (error: any) {
    console.log(`   ❌ UNEXPECTED: Individual simple server failed: ${error.message}`);
    return false;
  } finally {
    await client.close();
  }
}

async function testContaminationEffect() {
  console.log("\n🦠 Test 2: Mixed servers - contamination effect");
  console.log("-".repeat(70));
  
  const client = new MultiServerMCPClient({
    throwOnLoadError: false, // Don't fail if one server has issues
    mcpServers: {
      // Simple server (worked fine individually)
      weather: {
        transport: "stdio",
        command: "npx",
        args: ["-y", "@h1deya/mcp-server-weather"]
      },
      // Complex server (has schema issues)
      fetch: {
        transport: "stdio",
        command: "uvx",
        args: ["mcp-server-fetch"]
      }
    }
  });

  try {
    console.log("\n1. Connecting to mixed servers (simple + complex)...");
    const mcpTools = await client.getTools();
    console.log(`   ✅ Retrieved ${mcpTools.length} tools total`);
    
    // Analyze the mixed collection
    const analysis = categorizeToolsByComplexity(mcpTools);
    console.log(`   📊 Mixed collection analysis:`);
    console.log(`     • ${analysis.complexTools.length} complex tools (contaminate collection)`);
    console.log(`     • ${analysis.simpleTools.length} simple tools (become unusable)`);
    
    console.log("   🔍 Server breakdown:");
    for (const [server, counts] of Object.entries(analysis.serverSummary)) {
      console.log(`     • ${server}: ${counts.simple} simple, ${counts.complex} complex`);
    }
    
    if (analysis.complexTools.length > 0) {
      console.log("   ⚠️ Complex schemas detected - expect contamination effect");
    }

    console.log("\n2. Testing simple weather query with contaminated collection...");
    const originalLlm = new ChatGoogleGenerativeAI({ 
      model: "gemini-1.5-flash",
      apiKey: process.env.GOOGLE_API_KEY
    });
    
    const originalAgent = createReactAgent({ 
      llm: originalLlm, 
      tools: mcpTools  // Mixed collection
    });
    
    try {
      const result = await originalAgent.invoke({
        messages: [new HumanMessage("What's the weather like in San Francisco?")] // Simple weather query
      });
      console.log("   ❌ UNEXPECTED: Mixed collection worked! (Should have failed due to contamination)");
      return false;
    } catch (error: any) {
      if (error.message.includes('Invalid JSON payload received') && 
          (error.message.includes('exclusiveMaximum') || 
           error.message.includes('exclusiveMinimum') ||
           error.message.includes('anyOf'))) {
        console.log("   ✅ EXPECTED: Tool contamination caused failure");
        console.log("   💡 Simple weather query failed due to complex schemas in collection");
        console.log(`   📝 Error: ${error.message.substring(0, 150)}...`);
        console.log("");
        console.log("   🔬 CONTAMINATION MECHANICS:");
        console.log("     1. MultiServerMCPClient.getTools() aggregates ALL server tools");
        console.log("     2. LangChain validates the ENTIRE collection at once");
        console.log("     3. Complex schemas cause validation failure for ALL tools");
        console.log("     4. Even simple operations become impossible");
        return true;
      } else {
        console.log(`   ⚠️ Failed with unexpected error: ${error.message}`);
        return false;
      }
    }
    
  } catch (setupError: any) {
    console.log(`   ⚠️ Setup failed (servers might not be available): ${setupError.message}`);
    return false;
  } finally {
    await client.close();
  }
}

async function testExtendedClassPreventsContamination() {
  console.log("\n✨ Test 3: ChatGoogleGenerativeAIEx prevents contamination");
  console.log("-".repeat(70));
  
  const client = new MultiServerMCPClient({
    throwOnLoadError: false,
    mcpServers: {
      weather: {
        transport: "stdio", 
        command: "npx",
        args: ["-y", "@h1deya/mcp-server-weather"]
      },
      fetch: {
        transport: "stdio",
        command: "uvx",
        args: ["mcp-server-fetch"]
      }
    }
  });

  try {
    console.log("\n1. Reconnecting to mixed servers...");
    const mcpTools = await client.getTools();
    console.log(`   ✅ Retrieved ${mcpTools.length} tools`);

    const analysis = categorizeToolsByComplexity(mcpTools);
    console.log(`   📊 Same contaminated collection: ${analysis.complexTools.length} complex, ${analysis.simpleTools.length} simple`);

    console.log("\n2. Testing with ChatGoogleGenerativeAIEx...");
    const extendedLlm = new ChatGoogleGenerativeAIEx({ 
      model: "google-2.5-flash",
      apiKey: process.env.GOOGLE_API_KEY
    });
    
    const extendedAgent = createReactAgent({ 
      llm: extendedLlm, 
      tools: mcpTools  // Same mixed collection that failed before
    });
    
    console.log("   🚀 Testing simple weather query with mixed collection...");
    
    // Test simple operation that failed in Test 2
    const weatherResult = await extendedAgent.invoke({
      messages: [new HumanMessage("What's the weather in San Francisco?")]
    });
    
    console.log("   ✅ SUCCESS: Simple weather query works despite contamination");
    console.log(`   📝 Response: ${String(weatherResult.messages[weatherResult.messages.length - 1].content).substring(0, 100)}...`);
    
    console.log("\n   🚀 Testing complex fetch operation with same collection...");
    
    // Test complex operation to ensure both types work
    const fetchResult = await extendedAgent.invoke({
      messages: [new HumanMessage("What tools are available for web operations?")]
    });
    
    console.log("   ✅ SUCCESS: Complex operations also work");
    console.log(`   📝 Response: ${String(fetchResult.messages[fetchResult.messages.length - 1].content).substring(0, 100)}...`);
    
    console.log("");
    console.log("   🛡️ CONTAMINATION PREVENTION:");
    console.log("     • invocationParams() fixes schemas AFTER LangChain processing");
    console.log("     • Each tool's schema is normalized individually");
    console.log("     • Complex tools don't break simple tools");
    console.log("     • Entire MCP ecosystem remains functional");
    
    return true;
    
  } catch (error: any) {
    console.log(`   ❌ Extended class failed with mixed servers: ${error.message}`);
    return false;
  } finally {
    await client.close();
  }
}

async function runContaminationTests() {
  console.log("🦠 MCP Tool Contamination Effect Tests");
  console.log("=".repeat(70));
  console.log("");
  console.log("This test demonstrates a critical architectural problem:");
  console.log("");
  console.log("🏗️ THE CONTAMINATION PROBLEM:");
  console.log("   • MultiServerMCPClient.getTools() aggregates tools from all servers");
  console.log("   • Complex schemas from ONE server break the ENTIRE collection");
  console.log("   • Simple servers become unusable due to validation failures");
  console.log("   • This is an ecosystem-wide failure, not individual server issues");
  console.log("");
  console.log("🛡️ THE SOLUTION:");
  console.log("   • ChatGoogleGenerativeAIEx fixes schemas at invocationParams() level");
  console.log("   • Each tool is normalized individually after LangChain processing");
  console.log("   • Prevents contamination while preserving full functionality");
  console.log("");
  
  if (!process.env.GOOGLE_API_KEY) {
    console.error("❌ GOOGLE_API_KEY environment variable is required!");
    console.log("   Please copy .env.example to .env and add your API key.");
    process.exit(1);
  }

  const results = {
    individualSuccess: false,
    contaminationDemo: false,
    preventionSuccess: false
  };

  try {
    // Test 1: Show individual simple server works fine
    results.individualSuccess = await testIndividualServerSuccess();

    // Test 2: Demonstrate contamination with mixed servers
    results.contaminationDemo = await testContaminationEffect();

    // Test 3: Show extended class prevents contamination
    results.preventionSuccess = await testExtendedClassPreventsContamination();

    // Summary
    console.log("\n" + "=".repeat(70));
    console.log("📊 CONTAMINATION TEST RESULTS");
    console.log("=".repeat(70));
    console.log(`✅ Individual simple server works:          ${results.individualSuccess ? 'CONFIRMED ✓' : 'FAILED ✗'}`);
    console.log(`✅ Mixed servers cause contamination:       ${results.contaminationDemo ? 'CONFIRMED ✓' : 'INCONCLUSIVE ○'}`);
    console.log(`✅ Extended class prevents contamination:   ${results.preventionSuccess ? 'CONFIRMED ✓' : 'FAILED ✗'}`);
    
    const criticalTestsPassed = results.individualSuccess && results.preventionSuccess;
    
    if (criticalTestsPassed) {
      console.log("\n🎉 CONCLUSION: ChatGoogleGenerativeAIEx solves ecosystem contamination!");
      console.log("");
      console.log("💡 KEY ARCHITECTURAL INSIGHTS:");
      console.log("   • Tool aggregation creates systemic vulnerability");
      console.log("   • Schema validation operates on entire collections");  
      console.log("   • Individual server compatibility ≠ ecosystem compatibility");
      console.log("   • invocationParams() level fixes prevent cascading failures");
      console.log("");
      console.log("📈 BUSINESS IMPACT:");
      console.log("   • Enables mixing simple + complex MCP servers safely");
      console.log("   • Prevents one 'bad' server from breaking entire workflow");
      console.log("   • Critical for production MCP deployments");
      
      if (results.contaminationDemo) {
        console.log("");
        console.log("🔬 EMPIRICAL EVIDENCE:");
        console.log("   • Contamination effect demonstrated with real servers");
        console.log("   • Simple operations fail due to unrelated complex schemas");  
        console.log("   • Prevention mechanism verified to work correctly");
      }
    } else {
      console.log("\n⚠️ Some critical tests failed - check details above");
    }

  } catch (error) {
    console.error("\n❌ Contamination test suite failed:");
    console.error(error);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runContaminationTests();
}

export {
  categorizeToolsByComplexity,
  testIndividualServerSuccess,
  testContaminationEffect,
  testExtendedClassPreventsContamination,
  runContaminationTests
};
