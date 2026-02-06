import "dotenv/config";
import { ChatGoogleGenerativeAIEx } from "../index.js";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { createAgent, HumanMessage } from "langchain";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";

// Configure which LLM models to test
const LLM_MODELS_TO_TEST = ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-3-flash-preview"];
// const LLM_MODELS_TO_TEST = ["gemini-2.5-flash"]; // Single model for quick testing

// Uncomment the following to enable verbose logging
// process.env.LANGCHAIN_GOOGLE_GENAI_EX_VERBOSE = "true";

/**
 * Individual MCP Server Integration Test
 * 
 * This test suite tests each of the MCP servers individually with two approaches:
 * 1. Original ChatGoogleGenerativeAI (baseline)
 * 2. Automatic transformation with ChatGoogleGenerativeAIEx
 * 
 * Servers tested:
 * 1. us-weather: Weather information for US locations (sanity check)
 * 2. fetch: Web page fetching
 * 3. airtable: Airtable operations
 * 4. github: GitHub API integration (sanity check)
 * 
 * Each server is tested independently to isolate success/failure cases
 * and compare the effectiveness of the ChatGoogleGenerativeAIEx solution.
 */

interface ServerTestConfig {
  name: string;
  displayName: string;
  config: any;
  testQuery: string;
  expectedToolNames?: string[];
  requiresAuth?: boolean;
  authEnvVar?: string;
}

const MCP_SERVERS: ServerTestConfig[] = [
  {
    name: "us-weather", // Yields no issues — just a sanity check
    displayName: "US Weather Server",
    config: {
      transport: "stdio",
      command: "npx",
      args: ["-y", "@h1deya/mcp-server-weather"]
    },
    testQuery: "How many weather alerts in California?",
    expectedToolNames: ["get-alerts", "get-forecast"]
  },

  {
    // Fetcg server (mcp-server-fetch==2025.4.7) fails
    name: "fetch",
    displayName: "Fetch Server",
    config: {
      transport: "stdio",
      command: "uvx",
      args: ["mcp-server-fetch"]
    },
    testQuery: "Fetch the raw HTML content from bbc.com and tell me the titile",
    expectedToolNames: ["fetch"]
  },

  {
    // This Airtable local server (airtable-mcp-server@1.10.0) fails
    name: "airtable",
    displayName: "Airtable Server",
    config: {
      command: "npx",
      args: ["-y", "airtable-mcp-server@1.10.0"],
      env: {
        "AIRTABLE_API_KEY": `${process.env.AIRTABLE_API_KEY}`,
      }
    },
    testQuery: "List all of the bases I have access to",
    expectedToolNames: ["list_records", "list_tables"]
  },

  {
    name: "github", // Yields no issues — just a sanity check
    displayName: "GitHub Server",
    config: {
      transport: "http",
      url: "https://api.githubcopilot.com/mcp/",
      headers: {
        "Authorization": `Bearer ${process.env.GITHUB_PERSONAL_ACCESS_TOKEN}`
      }
    },
    testQuery: "Tell me about my GitHub profile",
    expectedToolNames: ["search_repositories", "get_user"],
    requiresAuth: true,
    authEnvVar: "GITHUB_PERSONAL_ACCESS_TOKEN"
  },
];

interface TestResult {
  serverName: string;
  displayName: string;
  success: boolean;
  error?: string;
  toolsFound: number;
  toolNames: string[];
  responsePreview?: string;
  skipped?: boolean;
  skipReason?: string;
  originalSuccess?: boolean;
  originalError?: string;
  automaticSuccess?: boolean;
  automaticError?: string;
}

/**
 * Tests a single MCP server for basic connectivity and functionality
 * Compares two approaches:
 * 1. Original ChatGoogleGenerativeAI (baseline)
 * 2. Automatic transformation with ChatGoogleGenerativeAIEx
 */
async function testSingleServer(serverConfig: ServerTestConfig, llmModel: string): Promise<TestResult> {
  const result: TestResult = {
    serverName: serverConfig.name,
    displayName: serverConfig.displayName,
    success: false,
    toolsFound: 0,
    toolNames: []
  };

  // Check authentication requirements
  if (serverConfig.requiresAuth && serverConfig.authEnvVar) {
    const authValue = process.env[serverConfig.authEnvVar];
    if (!authValue) {
      result.skipped = true;
      result.skipReason = `Missing required environment variable: ${serverConfig.authEnvVar}`;
      return result;
    }
  }

  let client: MultiServerMCPClient | null = null;

  try {
    console.log(`  📡 Connecting to ${serverConfig.displayName}...`);
    
    // Create client with only this server
    client = new MultiServerMCPClient({
      throwOnLoadError: true,
      prefixToolNameWithServerName: false,
      additionalToolNamePrefix: "",
      useStandardContentBlocks: true,
      mcpServers: {
        [serverConfig.name]: serverConfig.config
      }
    });

    // Get tools from this server
    console.log(`  🔧 Loading tools from ${serverConfig.displayName}...`);
    const mcpTools = await client.getTools();
    
    result.toolsFound = mcpTools.length;
    result.toolNames = mcpTools.map(tool => tool.name);
    
    console.log(`  ✅ Found ${mcpTools.length} tools: ${result.toolNames.join(', ')}`);

    // Check if expected tools are present (if specified)
    if (serverConfig.expectedToolNames) {
      const missingTools = serverConfig.expectedToolNames.filter(
        expectedTool => !result.toolNames.includes(expectedTool)
      );
      if (missingTools.length > 0) {
        console.log(`  ⚠️  Expected tools not found: ${missingTools.join(', ')}`);
      }
    }

    // Test with original ChatGoogleGenerativeAI first
    console.log(`  🔄 Testing original ChatGoogleGenerativeAI (${llmModel})...`);
    try {
      const originalLlm = new ChatGoogleGenerativeAI({ model: llmModel });
      const originalAgent = createAgent({ model: originalLlm, tools: mcpTools });
      
      const originalResult = await originalAgent.invoke({
        messages: [new HumanMessage(serverConfig.testQuery)]
      });
      
      const originalResponse = originalResult.messages[originalResult.messages.length - 1].content;
      result.originalSuccess = true;
      let trimmedOriginalResponce = originalResponse;
      console.log(`  ✅ Original succeeded: \x1b[36m${String(originalResponse).substring(0, 200)}...\x1b[0m`);
    } catch (originalError: any) {
      result.originalSuccess = false;
      result.originalError = originalError.message;
      console.log(`  ❌ Original failed: \x1b[35m${String(originalError).substring(0, 400)}...\x1b[0m`);
    }

    // Test with ChatGoogleGenerativeAIEx (automatic transformation)
    console.log(`  🚀 Testing automatic transformation (ChatGoogleGenerativeAIEx) (${llmModel})...`);
    try {
      const automaticLlm = new ChatGoogleGenerativeAIEx({ model: llmModel });
      const automaticAgent = createAgent({ model: automaticLlm, tools: mcpTools });
      
      console.log(`  💬 Query: "${serverConfig.testQuery}"`);
      
      const automaticResult = await automaticAgent.invoke({
        messages: [new HumanMessage(serverConfig.testQuery)]
      });
      
      const response = automaticResult.messages[automaticResult.messages.length - 1].content;
      result.automaticSuccess = true;
      result.responsePreview = String(response).substring(0, 150) + "...";
      result.success = true; // Overall success if automatic version works
      
      console.log(`  ✅ Automatic succeeded: \x1b[36m${result.responsePreview}\x1b[0m`);
    } catch (automaticError: any) {
      result.automaticSuccess = false;
      result.automaticError = automaticError.message;
      result.success = false;
      console.log(`  ❌ Automatic failed: \x1b[33m${automaticError.message}\x1b[0m`);
    }

    // Show comparison result
    const originalStatus = result.originalSuccess ? "✅" : "❌";
    const automaticStatus = result.automaticSuccess ? "✅" : "❌";
    console.log(`  🆚 Comparison: Original ${originalStatus} | ChatGoogleGenerativeAIEx ${automaticStatus}`);
    
    // Analyze the results
    if (!result.originalSuccess && result.automaticSuccess) {
      console.log(`  🎯 Schema fix benefit: ChatGoogleGenerativeAIEx fixed compatibility issues!`);
    } else if (result.originalSuccess && result.automaticSuccess) {
      console.log(`  ✨ No schema issues: Both approaches work (simple schema)`);
    } else if (!result.originalSuccess && !result.automaticSuccess) {
      console.log(`  ⚠️  Both approaches failed: Likely server/network issue, not schema-related`);
    } else if (result.originalSuccess && !result.automaticSuccess) {
      console.log(`  🔴 Regression: Original works but ChatGoogleGenerativeAIEx broke something`);
    }

  } catch (error: any) {
    result.error = error.message;
    console.log(`  ❌ Server connection failed: \x1b[33m${error.message}\x1b[0m`);
  } finally {
    if (client) {
      try {
        await client.close();
      } catch (closeError) {
        console.log(`  ⚠️  Warning: Error closing client for ${serverConfig.displayName}`);
      }
    }
  }

  return result;
}

/**
 * Prints a summary table of all test results
 */
function printSummaryTable(results: TestResult[], llmModel: string) {
  console.log(`\n📊 Test Results Summary - ${llmModel}`);
  console.log("═".repeat(110));
  console.log("Server          | Original | ChatGoogleGenAIEx | Tools | Schema Fix Benefit     | Notes");
  console.log("─".repeat(110));

  for (const result of results) {
    if (result.skipped) {
      const serverName = result.displayName.substring(0, 15).padEnd(15);
      const notes = result.skipReason || "Unknown";
      console.log(`${serverName} | SKIPPED  | SKIPPED           | N/A   | N/A                    | ${notes}`);
      continue;
    }

    const serverName = result.displayName.substring(0, 15).padEnd(15);
    const originalStatus = result.originalSuccess ? "✅ PASS" : "❌ FAIL";
    const automaticStatus = result.automaticSuccess ? "✅ PASS" : "❌ FAIL";
    const tools = result.toolsFound.toString().padEnd(5);
    
    let benefit = "Unknown";
    if (!result.originalSuccess && result.automaticSuccess) {
      benefit = "🎯 Fixed compatibility";
    } else if (result.originalSuccess && result.automaticSuccess) {
      benefit = "✨ Both work";
    } else if (!result.originalSuccess && !result.automaticSuccess) {
      benefit = "⚠️  Both failed";
    } else if (result.originalSuccess && !result.automaticSuccess) {
      benefit = "🔴 Regression";
    }
    
    const notes = result.automaticSuccess ? "Working properly" : 
                  result.automaticError?.substring(0, 30) + "..." || "Unknown error";
    
    console.log(`${serverName} | ${originalStatus.padEnd(8)} | ${automaticStatus.padEnd(17)} | ${tools} | ${benefit.padEnd(22)} | ${notes}`);
  }
  console.log("═".repeat(110));
}

/**
 * Main test runner for a specific LLM model
 */
async function runIndividualServerTestsForModel(llmModel: string) {
  console.log(`🚀 Individual MCP Server Integration Tests - ${llmModel}`);
  console.log("═".repeat(80));
  console.log(`Testing each MCP server individually with ${llmModel}...\n`);

  const results: TestResult[] = [];

  // Test each server individually
  for (let i = 0; i < MCP_SERVERS.length; i++) {
    const serverConfig = MCP_SERVERS[i];
    
    console.log(`\n🔸 Test ${i + 1}/${MCP_SERVERS.length}: ${serverConfig.displayName}`);
    console.log("─".repeat(50));
    
    const result = await testSingleServer(serverConfig, llmModel);
    results.push(result);
    
    // Add a small delay between tests to avoid overwhelming servers
    if (i < MCP_SERVERS.length - 1) {
      console.log("  ⏸️  Waiting 2 seconds before next test...");
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // Print summary
  printSummaryTable(results, llmModel);

  // Calculate statistics
  const totalTests = results.length;
  const availableTests = results.filter(r => !r.skipped).length;
  const originalPassedTests = results.filter(r => !r.skipped && r.originalSuccess).length;
  const automaticPassedTests = results.filter(r => !r.skipped && r.automaticSuccess).length;
  const schemaFixedTests = results.filter(r => !r.skipped && !r.originalSuccess && r.automaticSuccess).length;
  const skippedTests = results.filter(r => r.skipped).length;
  const allFailedTests = results.filter(r => !r.skipped && !r.originalSuccess && !r.automaticSuccess).length;
  const regressionTests = results.filter(r => !r.skipped && r.originalSuccess && !r.automaticSuccess).length;

  console.log(`\n📈 Statistics:`);
  console.log(`   Total Servers: ${totalTests}`);
  console.log(`   Available for Testing: ${availableTests}`);
  console.log(`   ✅ Original ChatGoogleGenerativeAI: ${originalPassedTests}/${availableTests} (${((originalPassedTests/availableTests)*100).toFixed(1)}%)`);
  console.log(`   ✅ ChatGoogleGenerativeAIEx: ${automaticPassedTests}/${availableTests} (${((automaticPassedTests/availableTests)*100).toFixed(1)}%)`);
  console.log(`   🎯 Schema Issues Fixed: ${schemaFixedTests} servers`);
  console.log(`   ⏸️  Skipped (missing auth): ${skippedTests}`);
  console.log(`   ❌ Both Failed: ${allFailedTests}`);
  console.log(`   🔴 Regressions: ${regressionTests}`);

  if (schemaFixedTests > 0) {
    console.log(`\n🎉 Success! ChatGoogleGenerativeAIEx fixed compatibility issues for ${schemaFixedTests} servers!`);
    
    const schemaFixedServers = results
      .filter(r => !r.skipped && !r.originalSuccess && r.automaticSuccess)
      .map(r => r.displayName);
    console.log(`   🎯 Fixed servers: ${schemaFixedServers.join(", ")}`);
  }

  if (regressionTests > 0) {
    console.log(`\n⚠️  Warning: ${regressionTests} regression(s) detected!`);
    const regressionServers = results
      .filter(r => !r.skipped && r.originalSuccess && !r.automaticSuccess)
      .map(r => r.displayName);
    console.log(`   🔴 Regression servers: ${regressionServers.join(", ")}`);
  }

  if (originalPassedTests > 0) {
    console.log(`\n✨ Note: ${originalPassedTests} server(s) work with both implementations`);
    const simpleServers = results
      .filter(r => !r.skipped && r.originalSuccess && r.automaticSuccess)
      .map(r => r.displayName);
    if (simpleServers.length > 0) {
      console.log(`   Simple schema servers: ${simpleServers.join(", ")}`);
    }
  }

  if (skippedTests > 0) {
    console.log(`\n💡 To test skipped servers, configure these environment variables:`);
    results
      .filter(r => r.skipped && r.skipReason?.includes("environment variable"))
      .forEach(r => {
        const envVar = r.skipReason?.match(/([A-Z_]+)/)?.[1];
        if (envVar) {
          console.log(`   - ${envVar} (for ${r.displayName})`);
        }
      });
  }

  console.log(`\n✅ Schema compatibility testing complete for ${llmModel}!`);
  
  if (schemaFixedTests > 0) {
    console.log(`🎆 Result: Successfully demonstrated ChatGoogleGenerativeAIEx benefits with ${schemaFixedTests} complex MCP servers!`);
  }
  
  if (regressionTests === 0 && automaticPassedTests >= originalPassedTests) {
    console.log(`💯 Perfect: ChatGoogleGenerativeAIEx maintains or improves compatibility without regressions!`);
  }
  
  return results;
}

/**
 * Main test runner that tests all configured LLM models
 */
async function runIndividualServerTests() {
  console.log("🚀 Multi-Model Individual MCP Server Integration Tests");
  console.log("═".repeat(80));
  console.log(`Testing with models: ${LLM_MODELS_TO_TEST.join(", ")}\n`);

  // Check for required environment variables
  if (!process.env.GOOGLE_API_KEY) {
    console.error("❌ GOOGLE_API_KEY environment variable is required!");
    console.log("   Please copy .env.example to .env and add your Google API key.\n");
    process.exit(1);
  }

  const allResults: { model: string; results: TestResult[] }[] = [];

  // Test each LLM model
  for (let modelIndex = 0; modelIndex < LLM_MODELS_TO_TEST.length; modelIndex++) {
    const llmModel = LLM_MODELS_TO_TEST[modelIndex];
    
    console.log(`\n${'='.repeat(100)}`);
    console.log(`🎯 TESTING MODEL ${modelIndex + 1}/${LLM_MODELS_TO_TEST.length}: ${llmModel}`);
    console.log(`${'='.repeat(100)}`);
    
    const results = await runIndividualServerTestsForModel(llmModel);
    allResults.push({ model: llmModel, results });
    
    // Add a longer delay between different models
    if (modelIndex < LLM_MODELS_TO_TEST.length - 1) {
      console.log(`\n⏸️  Waiting 5 seconds before testing next model...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  // Print final summary
  console.log(`\n\n${'='.repeat(100)}`);
  console.log(`🏁 MULTI-MODEL TESTING COMPLETE`);
  console.log(`${'='.repeat(100)}`);
  
  for (const { model, results } of allResults) {
    const availableTests = results.filter(r => !r.skipped).length;
    const originalPassedTests = results.filter(r => !r.skipped && r.originalSuccess).length;
    const automaticPassedTests = results.filter(r => !r.skipped && r.automaticSuccess).length;
    const schemaFixedTests = results.filter(r => !r.skipped && !r.originalSuccess && r.automaticSuccess).length;
    const regressionTests = results.filter(r => !r.skipped && r.originalSuccess && !r.automaticSuccess).length;
    
    const originalSuccessRate = availableTests > 0 ? ((originalPassedTests/availableTests)*100).toFixed(1) : "0.0";
    const automaticSuccessRate = availableTests > 0 ? ((automaticPassedTests/availableTests)*100).toFixed(1) : "0.0";
    
    console.log(`📊 ${model}:`);
    console.log(`   Original: ${originalPassedTests}/${availableTests} (${originalSuccessRate}%)`);
    console.log(`   ChatGoogleGenerativeAIEx: ${automaticPassedTests}/${availableTests} (${automaticSuccessRate}%)`);
    if (schemaFixedTests > 0) {
      console.log(`   🎯 Schema fixes: ${schemaFixedTests} servers`);
    }
    if (regressionTests > 0) {
      console.log(`   🔴 Regressions: ${regressionTests} servers`);
    }
  }
  
  console.log(`\n✨ Testing completed for all ${LLM_MODELS_TO_TEST.length} model(s)!`);
  
  return allResults;
}

// Export for use in other tests
export { runIndividualServerTests, runIndividualServerTestsForModel, testSingleServer, MCP_SERVERS, LLM_MODELS_TO_TEST };

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runIndividualServerTests()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n❌ Test suite failed:", error);
      process.exit(1);
    });
}
