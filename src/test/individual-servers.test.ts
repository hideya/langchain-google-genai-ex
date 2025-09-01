import "dotenv/config";
import { ChatGoogleGenerativeAIEx } from "../ChatGoogleGenerativeAIEx.js";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage } from "@langchain/core/messages";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";

/**
 * Individual MCP Server Integration Test
 * 
 * This test suite tests each of the 6 MCP servers individually:
 * 1. us-weather: Weather information for US locations
 * 2. fetch: Web page fetching
 * 3. filesystem: File system operations
 * 4. notion: Notion workspace integration
 * 5. github: GitHub API integration  
 * 6. slack: Slack operations
 * 7. Airtable: Airtable operations
 * 8. sqlite: SQLite database operations
 * 9. playwright: Browser automation
 * 
 * Each server is tested independently to isolate success/failure cases
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
  extendedSuccess?: boolean;
  extendedError?: string;
}

/**
 * Tests a single MCP server for basic connectivity and functionality
 * Now includes comparison between original ChatGoogleGenerativeAI and ChatGoogleGenerativeAIEx
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
    const extendedStatus = result.extendedSuccess ? "✅" : "❌";
    console.log(`  🆚 Comparison: Original ${originalStatus} vs Extended ${extendedStatus}`);
    
    if (!result.originalSuccess && result.extendedSuccess) {
      console.log(`  🎯 Schema fix benefit: Fixed compatibility issue!`);
    } else if (result.originalSuccess && result.extendedSuccess) {
      console.log(`  ✨ Schema fix benefit: No issues, both work (simple schema)`);
    } else if (!result.originalSuccess && !result.extendedSuccess) {
      console.log(`  ⚠️  Both failed: Likely server/network issue, not schema-related`);
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
  console.log("═".repeat(95));
  console.log("Server          | Original | Extended | Tools | Schema Fix Benefit | Notes");
  console.log("─".repeat(95));

  for (const result of results) {
    if (result.skipped) {
      const serverName = result.displayName.substring(0, 15).padEnd(15);
      const notes = result.skipReason || "Unknown";
      console.log(`${serverName} | SKIPPED  | SKIPPED  | N/A   | N/A                | ${notes}`);
      continue;
    }

    const serverName = result.displayName.substring(0, 15).padEnd(15);
    const originalStatus = result.originalSuccess ? "✅ PASS" : "❌ FAIL";
    const extendedStatus = result.extendedSuccess ? "✅ PASS" : "❌ FAIL";
    const tools = result.toolsFound.toString().padEnd(5);
    
    let benefit = "Unknown";
    if (!result.originalSuccess && result.extendedSuccess) {
      benefit = "🎯 Fixed schema issues";
    } else if (result.originalSuccess && result.extendedSuccess) {
      benefit = "✨ Both work (simple)";
    } else if (!result.originalSuccess && !result.extendedSuccess) {
      benefit = "⚠️  Both failed";
    } else if (result.originalSuccess && !result.extendedSuccess) {
      benefit = "🤔 Regression?";
    }
    
    const notes = result.extendedSuccess ? "Working properly" : 
                  result.extendedError?.substring(0, 30) + "..." || "Unknown error";
    
    console.log(`${serverName} | ${originalStatus.padEnd(8)} | ${extendedStatus.padEnd(8)} | ${tools} | ${benefit.padEnd(18)} | ${notes}`);
  }
  console.log("═".repeat(95));
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
  const extendedPassedTests = results.filter(r => !r.skipped && r.extendedSuccess).length;
  const schemaFixedTests = results.filter(r => !r.skipped && !r.originalSuccess && r.extendedSuccess).length;
  const skippedTests = results.filter(r => r.skipped).length;
  const bothFailedTests = results.filter(r => !r.skipped && !r.originalSuccess && !r.extendedSuccess).length;

  console.log(`\n📈 Statistics:`);
  console.log(`   Total Servers: ${totalTests}`);
  console.log(`   Available for Testing: ${availableTests}`);
  console.log(`   ✅ Original ChatGoogleGenerativeAI: ${originalPassedTests}/${availableTests} (${((originalPassedTests/availableTests)*100).toFixed(1)}%)`);
  console.log(`   ✅ ChatGoogleGenerativeAIEx: ${extendedPassedTests}/${availableTests} (${((extendedPassedTests/availableTests)*100).toFixed(1)}%)`);
  console.log(`   🎯 Schema Issues Fixed: ${schemaFixedTests} servers`);
  console.log(`   ⏸️  Skipped (missing auth): ${skippedTests}`);
  console.log(`   ❌ Both Failed: ${bothFailedTests}`);

  if (schemaFixedTests > 0) {
    console.log(`\n🎉 Success! ChatGoogleGenerativeAIEx fixed schema compatibility issues for ${schemaFixedTests} servers!`);
    const fixedServers = results
      .filter(r => !r.skipped && !r.originalSuccess && r.extendedSuccess)
      .map(r => r.displayName);
    console.log(`   Fixed servers: ${fixedServers.join(", ")}`);
  }

  if (originalPassedTests > 0) {
    console.log(`\n✨ Note: ${originalPassedTests} server(s) work with both implementations (simple schemas)`);
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

  console.log(`\n✅ ChatGoogleGenerativeAIEx schema compatibility testing complete!`);
  
  if (schemaFixedTests > 0) {
    console.log(`🎆 Result: Successfully demonstrated schema fix benefits with ${schemaFixedTests} complex MCP servers!`);
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
