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
 * 2. Upstream transformation with transformMcpToolsForGemini() + ChatGoogleGenerativeAI  
 * 3. Downstream transformation with ChatGoogleGenerativeAIEx
 * 
 * Servers tested:
 * 1. us-weather: Weather information for US locations
 * 2. fetch: Web page fetching
 * 3. notion: Notion workspace integration
 * 4. airtable: Airtable operations
 * 5. brave-search: Brave web and local search
 * 6. filesystem: File system operations
 * 7. sqlite: SQLite database operations
 * 8. github: GitHub API integration  
 * 9. slack: Slack operations
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
  // {
  //   name: "us-weather",
  //   displayName: "US Weather Server",
  //   config: {
  //     transport: "stdio",
  //     command: "npx",
  //     args: ["-y", "@h1deya/mcp-server-weather"]
  //   },
  //   testQuery: "Are there any weather alerts in California?",
  //   expectedToolNames: ["get-alerts", "get-forecast"]
  // },
  // {
  //   name: "fetch",
  //   displayName: "Fetch Server",
  //   config: {
  //     transport: "stdio",
  //     command: "uvx",
  //     args: ["mcp-server-fetch"]
  //   },
  //   testQuery: "Summarize the beginning of the news headlines on BBC.com",
  //   expectedToolNames: ["fetch"]
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
  //   // requiresAuth: false,  //  OAuth via "mcp-remote"
  // },
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
  // {
  //   name: "brave-search",
  //   displayName: "Brave Serch Server",
  //   config: {
  //     command: "npx",
  //     args: [ "-y", "@modelcontextprotocol/server-brave-search"],
  //     env: { "BRAVE_API_KEY": `${process.env.BRAVE_API_KEY}` }
  //   },
  //   testQuery: "Use Brace search to find out today's top story in Japan",
  //   expectedToolNames: ["brave_web_search", "brave_local_search"]
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
  //   expectedToolNames: ["read_file", "list_directory"]
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
  //   expectedToolNames: ["execute-query", "list-tables"]
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
  //   name: "slack",
  //   displayName: "Slack Server",
  //   config: {
  //     transport: "stdio",
  //     command: "npx",
  //     args: ["-y", "@teamsparta/mcp-server-slack"],
  //     env: {
  //       "SLACK_BOT_TOKEN": `${process.env.SLACK_BOT_TOKEN}`,
  //       "SLACK_TEAM_ID": `${process.env.SLACK_TEAM_ID}`,
  //       "SLACK_CHANNEL_IDS": `${process.env.SLACK_CHANNEL_IDS}`
  //     },
  //   },
  //   testQuery: "Please list all the users",
  //   expectedToolNames: ["slack_list_channels", "slack_post_message"]
  // },
  // {
  //   name: "playwright",
  //   displayName: "Playwright Server",
  //   config: {
  //     command: "npx",
  //     args: ["-y", "@playwright/mcp@latest"]
  //   },
  //   testQuery: "Open the BBC.com page, then close it",
  //   expectedToolNames: ["playwright_navigate", "playwright_screenshot"],
  // },
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
  upstreamSuccess?: boolean;
  upstreamError?: string;
  downstreamSuccess?: boolean;
  downstreamError?: string;
}

/**
 * Tests a single MCP server for basic connectivity and functionality
 * Compares three approaches:
 * 1. Original ChatGoogleGenerativeAI (baseline)
 * 2. Upstream transformation with transformMcpToolsForGemini() + ChatGoogleGenerativeAI
 * 3. Downstream transformation with ChatGoogleGenerativeAIEx
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
      const originalLlm = new ChatGoogleGenerativeAI({ model: process.env.LLM_MODEL_TO_TEST });
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
      console.log(`  ❌ Original failed: ${String(originalError).substring(0, 500)}...`);
      // console.log(`  ❌ Original failed: ${originalError.message}`);
    }

    // Test with upstream transformation (transformMcpToolsForGemini)
    console.log(`  🔧 Testing upstream transformation (transformMcpToolsForGemini)...`);
    try {
      const transformedTools = transformMcpToolsForGemini(mcpTools);
      const upstreamLlm = new ChatGoogleGenerativeAI({ model: process.env.LLM_MODEL_TO_TEST });
      const upstreamAgent = createReactAgent({ llm: upstreamLlm, tools: transformedTools });
      
      const upstreamResult = await upstreamAgent.invoke({
        messages: [new HumanMessage(serverConfig.testQuery)]
      });
      
      const upstreamResponse = upstreamResult.messages[upstreamResult.messages.length - 1].content;
      result.upstreamSuccess = true;
      console.log(`  ✅ Upstream succeeded: ${String(upstreamResponse).substring(0, 100)}...`);
    } catch (upstreamError: any) {
      result.upstreamSuccess = false;
      result.upstreamError = upstreamError.message;
      console.log(`  ❌ Upstream failed: ${upstreamError.message}`);
    }

    // Test with ChatGoogleGenerativeAIEx (downstream transformation)
    console.log(`  🚀 Testing ChatGoogleGenerativeAIEx (downstream transformation)...`);
    try {
      const downstreamLlm = new ChatGoogleGenerativeAIEx({ model: "gemini-2.5-flash" });
      const downstreamAgent = createReactAgent({ llm: downstreamLlm, tools: mcpTools });
      
      console.log(`  💬 Query: "${serverConfig.testQuery}"`);
      
      const downstreamResult = await downstreamAgent.invoke({
        messages: [new HumanMessage(serverConfig.testQuery)]
      });
      
      const response = downstreamResult.messages[downstreamResult.messages.length - 1].content;
      result.downstreamSuccess = true;
      result.responsePreview = String(response).substring(0, 150) + "...";
      result.success = true; // Overall success if downstream version works
      
      console.log(`  ✅ Downstream succeeded: ${result.responsePreview}`);
    } catch (downstreamError: any) {
      result.downstreamSuccess = false;
      result.downstreamError = downstreamError.message;
      result.success = false;
      console.log(`  ❌ Downstream failed: ${downstreamError.message}`);
    }

    // Show comparison result
    const originalStatus = result.originalSuccess ? "✅" : "❌";
    const upstreamStatus = result.upstreamSuccess ? "✅" : "❌";
    const downstreamStatus = result.downstreamSuccess ? "✅" : "❌";
    console.log(`  🆚 Comparison: Original ${originalStatus} | Upstream ${upstreamStatus} | Downstream ${downstreamStatus}`);
    
    // Analyze the results
    if (!result.originalSuccess && result.upstreamSuccess && result.downstreamSuccess) {
      console.log(`  🎯 Schema fix benefit: Both transformation approaches fixed compatibility issues!`);
    } else if (!result.originalSuccess && result.upstreamSuccess && !result.downstreamSuccess) {
      console.log(`  🤔 Interesting: Upstream works but downstream doesn't - possible regression`);
    } else if (!result.originalSuccess && !result.upstreamSuccess && result.downstreamSuccess) {
      console.log(`  🚀 Downstream approach handles edge cases better than upstream transformation`);
    } else if (result.originalSuccess && result.upstreamSuccess && result.downstreamSuccess) {
      console.log(`  ✨ Schema fix benefit: No issues, all approaches work (simple schema)`);
    } else if (!result.originalSuccess && !result.upstreamSuccess && !result.downstreamSuccess) {
      console.log(`  ⚠️  All approaches failed: Likely server/network issue, not schema-related`);
    } else if (result.originalSuccess && (!result.upstreamSuccess || !result.downstreamSuccess)) {
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
  console.log("Server          | Original | Upstream | Downstream | Tools | Schema Fix Benefit     | Notes");
  console.log("─".repeat(115));

  for (const result of results) {
    if (result.skipped) {
      const serverName = result.displayName.substring(0, 15).padEnd(15);
      const notes = result.skipReason || "Unknown";
      console.log(`${serverName} | SKIPPED  | SKIPPED  | SKIPPED    | N/A   | N/A                    | ${notes}`);
      continue;
    }

    const serverName = result.displayName.substring(0, 15).padEnd(15);
    const originalStatus = result.originalSuccess ? "✅ PASS" : "❌ FAIL";
    const upstreamStatus = result.upstreamSuccess ? "✅ PASS" : "❌ FAIL";
    const downstreamStatus = result.downstreamSuccess ? "✅ PASS" : "❌ FAIL";
    const tools = result.toolsFound.toString().padEnd(5);
    
    let benefit = "Unknown";
    if (!result.originalSuccess && result.upstreamSuccess && result.downstreamSuccess) {
      benefit = "🎯 Both fixes work";
    } else if (!result.originalSuccess && result.upstreamSuccess && !result.downstreamSuccess) {
      benefit = "🔧 Only upstream works";
    } else if (!result.originalSuccess && !result.upstreamSuccess && result.downstreamSuccess) {
      benefit = "🚀 Only downstream works";
    } else if (result.originalSuccess && result.upstreamSuccess && result.downstreamSuccess) {
      benefit = "✨ All work";
    } else if (!result.originalSuccess && !result.upstreamSuccess && !result.downstreamSuccess) {
      benefit = "⚠️  All failed";
    } else if (result.originalSuccess && (!result.upstreamSuccess || !result.downstreamSuccess)) {
      benefit = "🔴 Regressions";
    }
    
    const notes = result.downstreamSuccess ? "Working properly" : 
                  result.downstreamError?.substring(0, 30) + "..." || "Unknown error";
    
    console.log(`${serverName} | ${originalStatus.padEnd(8)} | ${upstreamStatus.padEnd(8)} | ${downstreamStatus.padEnd(10)} | ${tools} | ${benefit.padEnd(22)} | ${notes}`);
  }
  console.log("═".repeat(115));
}

/**
 * Main test runner
 */
async function runIndividualServerTests() {
  console.log("🚀 Individual MCP Server Integration Tests");
  console.log("═".repeat(80));
  console.log("Testing each of the 10 MCP servers individually...\n");

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
  const upstreamPassedTests = results.filter(r => !r.skipped && r.upstreamSuccess).length;
  const downstreamPassedTests = results.filter(r => !r.skipped && r.downstreamSuccess).length;
  const bothFixesWork = results.filter(r => !r.skipped && !r.originalSuccess && r.upstreamSuccess && r.downstreamSuccess).length;
  const onlyUpstreamWorks = results.filter(r => !r.skipped && !r.originalSuccess && r.upstreamSuccess && !r.downstreamSuccess).length;
  const onlyDownstreamWorks = results.filter(r => !r.skipped && !r.originalSuccess && !r.upstreamSuccess && r.downstreamSuccess).length;
  const skippedTests = results.filter(r => r.skipped).length;
  const allFailedTests = results.filter(r => !r.skipped && !r.originalSuccess && !r.upstreamSuccess && !r.downstreamSuccess).length;

  console.log(`\n📈 Statistics:`);
  console.log(`   Total Servers: ${totalTests}`);
  console.log(`   Available for Testing: ${availableTests}`);
  console.log(`   ✅ Original ChatGoogleGenerativeAI: ${originalPassedTests}/${availableTests} (${((originalPassedTests/availableTests)*100).toFixed(1)}%)`);
  console.log(`   ✅ Upstream Transformation: ${upstreamPassedTests}/${availableTests} (${((upstreamPassedTests/availableTests)*100).toFixed(1)}%)`);
  console.log(`   ✅ Downstream Transformation (ChatGoogleGenerativeAIEx): ${downstreamPassedTests}/${availableTests} (${((downstreamPassedTests/availableTests)*100).toFixed(1)}%)`);
  console.log(`   🎯 Both Transformation Approaches Work: ${bothFixesWork} servers`);
  console.log(`   🔧 Only Upstream Transformation Works: ${onlyUpstreamWorks} servers`);
  console.log(`   🚀 Only Downstream Transformation Works: ${onlyDownstreamWorks} servers`);
  console.log(`   ⏸️  Skipped (missing auth): ${skippedTests}`);
  console.log(`   ❌ All Failed: ${allFailedTests}`);

  const totalSchemaFixed = bothFixesWork + onlyUpstreamWorks + onlyDownstreamWorks;
  if (totalSchemaFixed > 0) {
    console.log(`\n🎉 Success! Schema transformations fixed compatibility issues for ${totalSchemaFixed} servers!`);
    
    if (bothFixesWork > 0) {
      const bothFixServers = results
        .filter(r => !r.skipped && !r.originalSuccess && r.upstreamSuccess && r.downstreamSuccess)
        .map(r => r.displayName);
      console.log(`   🎯 Both approaches work: ${bothFixServers.join(", ")}`);
    }
    
    if (onlyUpstreamWorks > 0) {
      const upstreamOnlyServers = results
        .filter(r => !r.skipped && !r.originalSuccess && r.upstreamSuccess && !r.downstreamSuccess)
        .map(r => r.displayName);
      console.log(`   🔧 Only upstream works: ${upstreamOnlyServers.join(", ")}`);
    }
    
    if (onlyDownstreamWorks > 0) {
      const downstreamOnlyServers = results
        .filter(r => !r.skipped && !r.originalSuccess && !r.upstreamSuccess && r.downstreamSuccess)
        .map(r => r.displayName);
      console.log(`   🚀 Only downstream works: ${downstreamOnlyServers.join(", ")}`);
    }
  }

  if (originalPassedTests > 0) {
    console.log(`\n✨ Note: ${originalPassedTests} server(s) work with all implementations`);
    const simpleServers = results
      .filter(r => !r.skipped && r.originalSuccess && r.downstreamSuccess)
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

  console.log(`\n✅ Schema compatibility testing complete!`);
  
  if (totalSchemaFixed > 0) {
    console.log(`🎆 Result: Successfully demonstrated schema transformation benefits with ${totalSchemaFixed} complex MCP servers!`);
    if (bothFixesWork > 0) {
      console.log(`💯 Perfect: Both upstream and downstream approaches work equivalently for ${bothFixesWork} servers`);
    }
    if (onlyUpstreamWorks > 0 || onlyDownstreamWorks > 0) {
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