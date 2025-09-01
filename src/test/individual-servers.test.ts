import "dotenv/config";
import { ChatGoogleGenerativeAIEx } from "../chat-models/ChatGoogleGenerativeAIEx.js";
import { transformMcpToolsForGemini } from "../schema-adapter/index.js";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage } from "@langchain/core/messages";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";

/**
 * Individual MCP Server Integration Test
 * 
 * This test suite tests each of the 10 MCP servers individually with three approaches:
 * 1. Original ChatGoogleGenerativeAI (baseline)
 * 2. Manual transformation with transformMcpToolsForGemini() + ChatGoogleGenerativeAI  
 * 3. Automatic transformation with ChatGoogleGenerativeAIEx
 * 
 * Servers tested:
 * 1. us-weather: Weather information for US locations
 * 2. fetch: Web page fetching
 * 3. brave-search: Brave web and local search
 * 4. filesystem: File system operations
 * 5. sqlite: SQLite database operations
 * 6. notion: Notion workspace integration
 * 7. github: GitHub API integration  
 * 8. slack: Slack operations
 * 9. Airtable: Airtable operations
 * 10. playwright: Browser automation
 * 
 * Each server is tested independently to isolate success/failure cases
 * and compare the effectiveness of different schema transformation approaches.
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
    name: "us-weather",
    displayName: "US Weather Server",
    config: {
      transport: "stdio",
      command: "npx",
      args: ["-y", "@h1deya/mcp-server-weather"]
    },
    testQuery: "Are there any weather alerts in California?",
    expectedToolNames: ["get-alerts", "get-forecast"]
  },
  {
    name: "fetch",
    displayName: "Fetch Server",
    config: {
      transport: "stdio",
      command: "uvx",
      args: ["mcp-server-fetch"]
    },
    testQuery: "Summarize the beginning of the news headlines on BBC.com",
    expectedToolNames: ["fetch"]
  },
  {
    name: "brave-search",
    displayName: "Brave Serch Server",
    config: {
      command: "npx",
      args: [ "-y", "@modelcontextprotocol/server-brave-search"],
      env: { "BRAVE_API_KEY": `${process.env.BRAVE_API_KEY}` }
    },
    testQuery: "Use Brace search to find out today's top story in Japan",
    expectedToolNames: ["brave_web_search", "brave_local_search"]
  },
  {
    name: "filesystem",
    displayName: "Filesystem Server",
    config: {
      command: "npx",
      args: [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "."  // path to a directory to allow access to
      ]
    },
    testQuery: "Tell me how many directories are in the current directory",
    expectedToolNames: ["read_file", "list_directory"]
  },
  {
    name: "sqlite",
    displayName: "SQLite Server",
    config: {
      command: "uvx",
      args: [
        "mcp-server-sqlite",
        "--db-path",
        "test-mcp-server-sqlite.sqlite3"
      ]
    },
    testQuery: "Make a new table called 'fruits' with columns 'name' and 'count', insert apple with count 123 and orange with count 345, then show all items",
    expectedToolNames: ["execute-query", "list-tables"]
  },
  {
    name: "notion",
    displayName: "Notion Server",
    config: {
      transport: "stdio",
      command: "npx",
      args: ["-y", "mcp-remote", "https://mcp.notion.com/mcp"]
    },
    testQuery: "Tell me about my Notion account",
    expectedToolNames: ["notion-get-self", "notion-search-pages"],
    // requiresAuth: true,  //  OAuth via "mcp-remote"
    // authEnvVar: "NOTION_TOKEN"
  },
  {
    name: "github",
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
  {
    name: "slack",
    displayName: "Slack Server",
    config: {
      transport: "stdio",
      command: "npx",
      args: ["-y", "@teamsparta/mcp-server-slack"],
      env: {
        "SLACK_BOT_TOKEN": `${process.env.SLACK_BOT_TOKEN}`,
        "SLACK_TEAM_ID": `${process.env.SLACK_TEAM_ID}`,
        "SLACK_CHANNEL_IDS": `${process.env.SLACK_CHANNEL_IDS}`
      },
    },
    testQuery: "Please list all the users",
    expectedToolNames: ["slack_list_channels", "slack_post_message"]
  },
  {
    name: "airtable",
    displayName: "Airtable Server",
    config: {
      command: "npx",
      args: ["-y", "airtable-mcp-server"],
      env: {
        "AIRTABLE_API_KEY": `${process.env.AIRTABLE_API_KEY}`,
      }
    },
    testQuery: "Tell me about my Airtable account",
    expectedToolNames: ["list_records", "list_tables"]
  },
  {
    name: "playwright",
    displayName: "Playwright Server",
    config: {
      command: "npx",
      args: ["-y", "@playwright/mcp@latest"]
    },
    testQuery: "Open the BBC.com page, then close it",
    expectedToolNames: ["playwright_navigate", "playwright_screenshot"],
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
  manualSuccess?: boolean;
  manualError?: string;
  extendedSuccess?: boolean;
  extendedError?: string;
}

/**
 * Tests a single MCP server for basic connectivity and functionality
 * Compares three approaches:
 * 1. Original ChatGoogleGenerativeAI (baseline)
 * 2. Manual transformation with transformMcpToolsForGemini() + ChatGoogleGenerativeAI
 * 3. Automatic transformation with ChatGoogleGenerativeAIEx
 */
async function testSingleServer(serverConfig: ServerTestConfig): Promise<TestResult> {
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
    console.log(`  🔄 Testing original ChatGoogleGenerativeAI...`);
    try {
      const originalLlm = new ChatGoogleGenerativeAI({ model: "gemini-1.5-flash" });
      const originalAgent = createReactAgent({ llm: originalLlm, tools: mcpTools });
      
      const originalResult = await originalAgent.invoke({
        messages: [new HumanMessage(serverConfig.testQuery)]
      });
      
      const originalResponse = originalResult.messages[originalResult.messages.length - 1].content;
      result.originalSuccess = true;
      console.log(`  ✅ Original succeeded: ${String(originalResponse).substring(0, 100)}...`);
    } catch (originalError: any) {
      result.originalSuccess = false;
      result.originalError = originalError.message;
      console.log(`  ❌ Original failed: ${originalError.message}`);
    }

    // Test with manual transformation (transformMcpToolsForGemini)
    console.log(`  🔧 Testing manual transformation (transformMcpToolsForGemini)...`);
    try {
      const transformedTools = transformMcpToolsForGemini(mcpTools);
      const manualLlm = new ChatGoogleGenerativeAI({ model: "gemini-1.5-flash" });
      const manualAgent = createReactAgent({ llm: manualLlm, tools: transformedTools });
      
      const manualResult = await manualAgent.invoke({
        messages: [new HumanMessage(serverConfig.testQuery)]
      });
      
      const manualResponse = manualResult.messages[manualResult.messages.length - 1].content;
      result.manualSuccess = true;
      console.log(`  ✅ Manual succeeded: ${String(manualResponse).substring(0, 100)}...`);
    } catch (manualError: any) {
      result.manualSuccess = false;
      result.manualError = manualError.message;
      console.log(`  ❌ Manual failed: ${manualError.message}`);
    }

    // Test with ChatGoogleGenerativeAIEx
    console.log(`  🚀 Testing ChatGoogleGenerativeAIEx...`);
    try {
      const extendedLlm = new ChatGoogleGenerativeAIEx({ model: "google-2.5-flash" });
      const extendedAgent = createReactAgent({ llm: extendedLlm, tools: mcpTools });
      
      console.log(`  💬 Query: "${serverConfig.testQuery}"`);
      
      const extendedResult = await extendedAgent.invoke({
        messages: [new HumanMessage(serverConfig.testQuery)]
      });
      
      const response = extendedResult.messages[extendedResult.messages.length - 1].content;
      result.extendedSuccess = true;
      result.responsePreview = String(response).substring(0, 150) + "...";
      result.success = true; // Overall success if extended version works
      
      console.log(`  ✅ Extended succeeded: ${result.responsePreview}`);
    } catch (extendedError: any) {
      result.extendedSuccess = false;
      result.extendedError = extendedError.message;
      result.success = false;
      console.log(`  ❌ Extended failed: ${extendedError.message}`);
    }

    // Show comparison result
    const originalStatus = result.originalSuccess ? "✅" : "❌";
    const manualStatus = result.manualSuccess ? "✅" : "❌";
    const extendedStatus = result.extendedSuccess ? "✅" : "❌";
    console.log(`  🆚 Comparison: Original ${originalStatus} | Manual ${manualStatus} | Extended ${extendedStatus}`);
    
    // Analyze the results
    if (!result.originalSuccess && result.manualSuccess && result.extendedSuccess) {
      console.log(`  🎯 Schema fix benefit: Both transformation approaches fixed compatibility issues!`);
    } else if (!result.originalSuccess && result.manualSuccess && !result.extendedSuccess) {
      console.log(`  🤔 Interesting: Manual works but extended doesn't - possible regression`);
    } else if (!result.originalSuccess && !result.manualSuccess && result.extendedSuccess) {
      console.log(`  🚀 Extended approach handles edge cases better than manual transformation`);
    } else if (result.originalSuccess && result.manualSuccess && result.extendedSuccess) {
      console.log(`  ✨ Schema fix benefit: No issues, all approaches work (simple schema)`);
    } else if (!result.originalSuccess && !result.manualSuccess && !result.extendedSuccess) {
      console.log(`  ⚠️  All approaches failed: Likely server/network issue, not schema-related`);
    } else if (result.originalSuccess && (!result.manualSuccess || !result.extendedSuccess)) {
      console.log(`  🔴 Regression: Original works but transformations broke something`);
    }

  } catch (error: any) {
    result.error = error.message;
    console.log(`  ❌ Server connection failed: ${error.message}`);
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
function printSummaryTable(results: TestResult[]) {
  console.log("\n📊 Test Results Summary");
  console.log("═".repeat(115));
  console.log("Server          | Original | Manual   | Extended | Tools | Schema Fix Benefit     | Notes");
  console.log("─".repeat(115));

  for (const result of results) {
    if (result.skipped) {
      const serverName = result.displayName.substring(0, 15).padEnd(15);
      const notes = result.skipReason || "Unknown";
      console.log(`${serverName} | SKIPPED  | SKIPPED  | SKIPPED  | N/A   | N/A                    | ${notes}`);
      continue;
    }

    const serverName = result.displayName.substring(0, 15).padEnd(15);
    const originalStatus = result.originalSuccess ? "✅ PASS" : "❌ FAIL";
    const manualStatus = result.manualSuccess ? "✅ PASS" : "❌ FAIL";
    const extendedStatus = result.extendedSuccess ? "✅ PASS" : "❌ FAIL";
    const tools = result.toolsFound.toString().padEnd(5);
    
    let benefit = "Unknown";
    if (!result.originalSuccess && result.manualSuccess && result.extendedSuccess) {
      benefit = "🎯 Both fixes work";
    } else if (!result.originalSuccess && result.manualSuccess && !result.extendedSuccess) {
      benefit = "🔧 Only manual works";
    } else if (!result.originalSuccess && !result.manualSuccess && result.extendedSuccess) {
      benefit = "🚀 Only extended works";
    } else if (result.originalSuccess && result.manualSuccess && result.extendedSuccess) {
      benefit = "✨ All work";
    } else if (!result.originalSuccess && !result.manualSuccess && !result.extendedSuccess) {
      benefit = "⚠️  All failed";
    } else if (result.originalSuccess && (!result.manualSuccess || !result.extendedSuccess)) {
      benefit = "🔴 Regressions";
    }
    
    const notes = result.extendedSuccess ? "Working properly" : 
                  result.extendedError?.substring(0, 30) + "..." || "Unknown error";
    
    console.log(`${serverName} | ${originalStatus.padEnd(8)} | ${manualStatus.padEnd(8)} | ${extendedStatus.padEnd(8)} | ${tools} | ${benefit.padEnd(22)} | ${notes}`);
  }
  console.log("═".repeat(115));
}

/**
 * Main test runner
 */
async function runIndividualServerTests() {
  console.log("🚀 Individual MCP Server Integration Tests");
  console.log("═".repeat(80));
  console.log("Testing each of the 6 MCP servers individually...\n");

  // Check for required environment variables
  if (!process.env.GOOGLE_API_KEY) {
    console.error("❌ GOOGLE_API_KEY environment variable is required!");
    console.log("   Please copy .env.example to .env and add your Google API key.\n");
    process.exit(1);
  }

  const results: TestResult[] = [];

  // Test each server individually
  for (let i = 0; i < MCP_SERVERS.length; i++) {
    const serverConfig = MCP_SERVERS[i];
    
    console.log(`\n🔸 Test ${i + 1}/${MCP_SERVERS.length}: ${serverConfig.displayName}`);
    console.log("─".repeat(50));
    
    const result = await testSingleServer(serverConfig);
    results.push(result);
    
    // Add a small delay between tests to avoid overwhelming servers
    if (i < MCP_SERVERS.length - 1) {
      console.log("  ⏸️  Waiting 2 seconds before next test...");
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // Print summary
  printSummaryTable(results);

  // Calculate statistics
  const totalTests = results.length;
  const availableTests = results.filter(r => !r.skipped).length;
  const originalPassedTests = results.filter(r => !r.skipped && r.originalSuccess).length;
  const manualPassedTests = results.filter(r => !r.skipped && r.manualSuccess).length;
  const extendedPassedTests = results.filter(r => !r.skipped && r.extendedSuccess).length;
  const bothFixesWork = results.filter(r => !r.skipped && !r.originalSuccess && r.manualSuccess && r.extendedSuccess).length;
  const onlyManualWorks = results.filter(r => !r.skipped && !r.originalSuccess && r.manualSuccess && !r.extendedSuccess).length;
  const onlyExtendedWorks = results.filter(r => !r.skipped && !r.originalSuccess && !r.manualSuccess && r.extendedSuccess).length;
  const skippedTests = results.filter(r => r.skipped).length;
  const allFailedTests = results.filter(r => !r.skipped && !r.originalSuccess && !r.manualSuccess && !r.extendedSuccess).length;

  console.log(`\n📈 Statistics:`);
  console.log(`   Total Servers: ${totalTests}`);
  console.log(`   Available for Testing: ${availableTests}`);
  console.log(`   ✅ Original ChatGoogleGenerativeAI: ${originalPassedTests}/${availableTests} (${((originalPassedTests/availableTests)*100).toFixed(1)}%)`);
  console.log(`   ✅ Manual Transformation: ${manualPassedTests}/${availableTests} (${((manualPassedTests/availableTests)*100).toFixed(1)}%)`);
  console.log(`   ✅ ChatGoogleGenerativeAIEx: ${extendedPassedTests}/${availableTests} (${((extendedPassedTests/availableTests)*100).toFixed(1)}%)`);
  console.log(`   🎯 Both Transformation Approaches Work: ${bothFixesWork} servers`);
  console.log(`   🔧 Only Manual Transformation Works: ${onlyManualWorks} servers`);
  console.log(`   🚀 Only Extended Class Works: ${onlyExtendedWorks} servers`);
  console.log(`   ⏸️  Skipped (missing auth): ${skippedTests}`);
  console.log(`   ❌ All Failed: ${allFailedTests}`);

  const totalSchemaFixed = bothFixesWork + onlyManualWorks + onlyExtendedWorks;
  if (totalSchemaFixed > 0) {
    console.log(`\n🎉 Success! Schema transformations fixed compatibility issues for ${totalSchemaFixed} servers!`);
    
    if (bothFixesWork > 0) {
      const bothFixServers = results
        .filter(r => !r.skipped && !r.originalSuccess && r.manualSuccess && r.extendedSuccess)
        .map(r => r.displayName);
      console.log(`   🎯 Both approaches work: ${bothFixServers.join(", ")}`);
    }
    
    if (onlyManualWorks > 0) {
      const manualOnlyServers = results
        .filter(r => !r.skipped && !r.originalSuccess && r.manualSuccess && !r.extendedSuccess)
        .map(r => r.displayName);
      console.log(`   🔧 Only manual works: ${manualOnlyServers.join(", ")}`);
    }
    
    if (onlyExtendedWorks > 0) {
      const extendedOnlyServers = results
        .filter(r => !r.skipped && !r.originalSuccess && !r.manualSuccess && r.extendedSuccess)
        .map(r => r.displayName);
      console.log(`   🚀 Only extended works: ${extendedOnlyServers.join(", ")}`);
    }
  }

  if (originalPassedTests > 0) {
    console.log(`\n✨ Note: ${originalPassedTests} server(s) work with both implementations`);
    const simpleServers = results
      .filter(r => !r.skipped && r.originalSuccess && r.extendedSuccess)
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

  if (bothFailedTests > 0) {
    console.log(`\n🔧 Servers that failed with both implementations may need:`);
    console.log(`   - Network connectivity`);
    console.log(`   - Required dependencies (uvx, npx packages)`);
    console.log(`   - Proper authentication`);
    console.log(`   - MCP server availability`);
    const failedServers = results
      .filter(r => !r.skipped && !r.originalSuccess && !r.extendedSuccess)
      .map(r => r.displayName);
    if (failedServers.length > 0) {
      console.log(`   Failed servers: ${failedServers.join(", ")}`);
    }
  }

  console.log(`\n✅ Schema compatibility testing complete!`);
  
  if (totalSchemaFixed > 0) {
    console.log(`🎆 Result: Successfully demonstrated schema transformation benefits with ${totalSchemaFixed} complex MCP servers!`);
    if (bothFixesWork > 0) {
      console.log(`💯 Perfect: Both manual and extended approaches work equivalently for ${bothFixesWork} servers`);
    }
    if (onlyManualWorks > 0 || onlyExtendedWorks > 0) {
      console.log(`🔍 Interesting: Some edge cases where approaches differ - worth investigating`);
    }
  }
  
  return results;
}

// Export for use in other tests
export { runIndividualServerTests, testSingleServer, MCP_SERVERS };

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
