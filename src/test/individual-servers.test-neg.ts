import "dotenv/config";
// import { ChatGoogleGenerativeAIEx } from "../ChatGoogleGenerativeAIEx.js";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage } from "@langchain/core/messages";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";

/**
 * Individual MCP Server Integration Test
 * 
 * This test suite tests each of the 6 MCP servers individually:
 * 1. us-weather: Weather information for US locations
 * 2. filesystem: File system operations
 * 3. notion: Notion workspace integration
 * 4. github: GitHub API integration  
 * 5. sqlite: SQLite database operations
 * 6. playwright: Browser automation
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
  // {
  //   name: "us-weather",
  //   displayName: "US Weather Server",
  //   config: {
  //     transport: "stdio",
  //     command: "npx",
  //     args: ["-y", "@h1deya/mcp-server-weather"]
  //   },
  //   testQuery: "Are there any weather alerts in California?",
  //   expectedToolNames: ["get-alerts", "get-forecast"],
  //   requiresAuth: false
  // },
  // {
  //   name: "filesystem",
  //   displayName: "Filesystem Server",
  //   config: {
  //     command: "npx",
  //     args: [
  //       "-y",
  //       "@modelcontextprotocol/server-filesystem",
  //       "."  // path to a directory to allow access to
  //     ]
  //   },
  //   testQuery: "Tell me how many directories are in the current directory",
  //   expectedToolNames: ["read_file", "list_directory"],
  //   requiresAuth: false
  // },
  // {
  //   name: "notion",
  //   displayName: "Notion Server",
  //   config: {
  //     transport: "stdio",
  //     command: "npx",
  //     args: ["-y", "mcp-remote", "https://mcp.notion.com/mcp"]
  //   },
  //   testQuery: "Tell me about my Notion account",
  //   expectedToolNames: ["notion-get-self", "notion-search-pages"],
  //   requiresAuth: true,
  //   authEnvVar: "NOTION_TOKEN"
  // },
  // {
  //   name: "github",
  //   displayName: "GitHub Server",
  //   config: {
  //     transport: "http",
  //     url: "https://api.githubcopilot.com/mcp/",
  //     headers: {
  //       "Authorization": `Bearer ${process.env.GITHUB_PERSONAL_ACCESS_TOKEN}`
  //     }
  //   },
  //   testQuery: "Tell me about my GitHub profile",
  //   expectedToolNames: ["search_repositories", "get_user"],
  //   requiresAuth: true,
  //   authEnvVar: "GITHUB_PERSONAL_ACCESS_TOKEN"
  // },
  // {
  //   name: "sqlite",
  //   displayName: "SQLite Server",
  //   config: {
  //     command: "uvx",
  //     args: [
  //       "mcp-server-sqlite",
  //       "--db-path",
  //       "test-mcp-server-sqlite.sqlite3"
  //     ]
  //   },
  //   testQuery: "Make a new table called 'fruits' with columns 'name' and 'count', insert apple with count 123 and orange with count 345, then show all items",
  //   expectedToolNames: ["execute-query", "list-tables"],
  //   requiresAuth: false
  // },
  {
    name: "playwright",
    displayName: "Playwright Server",
    config: {
      command: "npx",
      args: ["@playwright/mcp@latest"]
    },
    testQuery: "Open the BBC.com page, then close it",
    expectedToolNames: ["playwright_navigate", "playwright_screenshot"],
    requiresAuth: false
  }
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
}

/**
 * Tests a single MCP server for basic connectivity and functionality
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

    // Test with ChatGoogleGenerativeAIEx
    console.log(`  🤖 Testing agent with ${serverConfig.displayName}...`);
    const llm = new ChatGoogleGenerativeAIEx({ model: "google-2.5-flash" });
    const agent = createReactAgent({ llm, tools: mcpTools });

    console.log(`  💬 Query: "${serverConfig.testQuery}"`);
    
    const agentResult = await agent.invoke({
      messages: [new HumanMessage(serverConfig.testQuery)]
    });
    
    const response = agentResult.messages[agentResult.messages.length - 1].content;
    result.responsePreview = String(response).substring(0, 150) + "...";
    result.success = true;
    
    console.log(`  ✅ Response: ${result.responsePreview}`);

  } catch (error: any) {
    result.error = error.message;
    console.log(`  ❌ Failed: ${error.message}`);
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
 * Tests the original ChatGoogleGenerativeAI against a server to compare behavior
 */
async function testOriginalVsExtended(serverConfig: ServerTestConfig): Promise<{original: boolean, extended: boolean}> {
  if (serverConfig.requiresAuth && serverConfig.authEnvVar && !process.env[serverConfig.authEnvVar]) {
    return { original: false, extended: false }; // Skip if no auth
  }

  let client: MultiServerMCPClient | null = null;
  let originalSuccess = false;
  let extendedSuccess = false;

  try {
    client = new MultiServerMCPClient({
      throwOnLoadError: true,
      prefixToolNameWithServerName: false,
      additionalToolNamePrefix: "",
      useStandardContentBlocks: true,
      mcpServers: {
        [serverConfig.name]: serverConfig.config
      }
    });

    const mcpTools = await client.getTools();
    const simpleQuery = "Hello, can you help me?"; // Simple query to avoid complex operations

    // Test original ChatGoogleGenerativeAI
    try {
      const originalLlm = new ChatGoogleGenerativeAI({ model: "gemini-1.5-flash" });
      const originalAgent = createReactAgent({ llm: originalLlm, tools: mcpTools });
      await originalAgent.invoke({ messages: [new HumanMessage(simpleQuery)] });
      originalSuccess = true;
    } catch (error) {
      // Expected to potentially fail with complex schemas
    }

    // Test ChatGoogleGenerativeAIEx
    try {
      const extendedLlm = new ChatGoogleGenerativeAIEx({ model: "google-2.5-flash" });
      const extendedAgent = createReactAgent({ llm: extendedLlm, tools: mcpTools });
      await extendedAgent.invoke({ messages: [new HumanMessage(simpleQuery)] });
      extendedSuccess = true;
    } catch (error) {
      // Should generally succeed
    }

  } catch (error) {
    // Server connection failed
  } finally {
    if (client) {
      try {
        await client.close();
      } catch (closeError) {
        // Ignore close errors
      }
    }
  }

  return { original: originalSuccess, extended: extendedSuccess };
}

/**
 * Prints a summary table of all test results
 */
function printSummaryTable(results: TestResult[]) {
  console.log("\n📊 Test Results Summary");
  console.log("═".repeat(80));
  console.log("Server          | Status    | Tools | Schema Fix Benefit | Notes");
  console.log("─".repeat(80));

  for (const result of results) {
    const status = result.skipped ? "SKIPPED" : (result.success ? "✅ PASS" : "❌ FAIL");
    const tools = result.skipped ? "N/A" : result.toolsFound.toString();
    const benefit = result.skipped ? "N/A" : (result.success ? "Working" : "Needed");
    const notes = result.skipped ? result.skipReason : 
                  result.success ? "All good" : 
                  result.error?.substring(0, 30) + "..." || "Unknown error";
    
    const serverName = result.displayName.substring(0, 15).padEnd(15);
    const statusPadded = status.padEnd(9);
    const toolsPadded = tools.padEnd(5);
    const benefitPadded = benefit.padEnd(18);
    
    console.log(`${serverName} | ${statusPadded} | ${toolsPadded} | ${benefitPadded} | ${notes}`);
  }
  console.log("═".repeat(80));
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
  const passedTests = results.filter(r => r.success).length;
  const skippedTests = results.filter(r => r.skipped).length;
  const failedTests = totalTests - passedTests - skippedTests;

  console.log(`\n📈 Statistics:`);
  console.log(`   Total Servers: ${totalTests}`);
  console.log(`   ✅ Passed: ${passedTests}`);
  console.log(`   ⏸️  Skipped: ${skippedTests} (missing auth)`);
  console.log(`   ❌ Failed: ${failedTests}`);

  if (passedTests > 0) {
    console.log(`\n🎉 Success! ${passedTests} out of ${totalTests - skippedTests} available servers are working!`);
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

  if (failedTests > 0) {
    console.log(`\n🔧 Failed servers may need:`);
    console.log(`   - Network connectivity`);
    console.log(`   - Required dependencies (uvx, npx packages)`);
    console.log(`   - Proper authentication`);
    console.log(`   - MCP server availability`);
  }

  console.log(`\n✅ ChatGoogleGenerativeAIEx compatibility testing complete!`);
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
