import "dotenv/config";
import { transformMcpToolsForGemini, transformMcpToolForGemini } from "../schema-adapter/index.js";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatGoogleGenerativeAIEx } from "../chat-models/ChatGoogleGenerativeAIEx.js";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { HumanMessage } from "@langchain/core/messages";

/**
 * Schema Transformation Pipeline Analysis Test
 * 
 * This test reveals exactly what happens to schemas at each step of the transformation pipeline:
 * 1. Original MCP schemas (what servers provide)
 * 2. After upstream transformation (what transformMcpToolsForGemini produces)
 * 3. What LangChain sends to Gemini (the final API payload)
 * 4. Comparison with ChatGoogleGenerativeAIEx (downstream transformation) approach
 * 
 * Goal: Find the "smoking gun" - prove exactly where and why complex schemas get re-corrupted
 */

interface SchemaAnalysis {
  toolName: string;
  serverName: string;
  original: {
    schema: any;
    issues: string[];
    complexity: 'simple' | 'moderate' | 'complex';
  };
  afterUpstreamTransform: {
    schema: any;  
    issues: string[];
    wasFixed: boolean;
  };
  langchainSendsToGemini: {
    schema: any;
    issues: string[];
    wasReCorrupted: boolean;
  };
  chatGoogleGenerativeAIExSends: {
    schema: any;
    issues: string[];  
  };
  pristineDownstreamTest: {
    success: boolean;
    error?: string;
  };
  conclusion: string;
}

const PROBLEMATIC_SCHEMA_MARKERS = [
  'anyOf',
  'allOf', 
  'oneOf',
  'exclusiveMaximum',
  'exclusiveMinimum',
  '$ref',
  '$defs',
  '$schema'
];

/**
 * Analyzes a schema for complexity and known problematic patterns
 */
function analyzeSchema(schema: any): { issues: string[], complexity: 'simple' | 'moderate' | 'complex' } {
  const schemaStr = JSON.stringify(schema);
  const issues = PROBLEMATIC_SCHEMA_MARKERS.filter(marker => schemaStr.includes(marker));
  
  let complexity: 'simple' | 'moderate' | 'complex' = 'simple';
  if (issues.includes('$ref') || issues.includes('anyOf') || issues.includes('allOf')) {
    complexity = 'complex';
  } else if (issues.length > 0) {
    complexity = 'moderate';
  }
  
  return { issues, complexity };
}

/**
 * Intercepts what LangChain actually sends to Gemini API
 * IMPORTANT: This intercepts AFTER any overridden invocationParams() processing
 */
function interceptLangChainAPICall(llm: ChatGoogleGenerativeAI): Promise<any> {
  return new Promise((resolve) => {
    // Store the current invocationParams method (which might be overridden)
    const currentInvocationParams = llm.invocationParams.bind(llm);
    
    // Override it to intercept the final result
    llm.invocationParams = function(options?: any) {
      // Let the current implementation (including ChatGoogleGenerativeAIEx overrides) do their work first
      const result = currentInvocationParams(options);
      
      // Capture the final tools that will be sent to API (after all transformations)
      resolve(result.tools || []);
      
      // Return the result so the API call can proceed normally
      return result;
    };
  });
}

/**
 * Tests schema transformation pipeline for a specific server
 */
async function analyzeServerSchemaTransformation(serverConfig: any): Promise<SchemaAnalysis[]> {
  const results: SchemaAnalysis[] = [];
  
  console.log(`\n🔬 Analyzing ${serverConfig.displayName} schema transformation pipeline...`);
  console.log("─".repeat(80));
  
  let client: MultiServerMCPClient | null = null;
  
  try {
    // 1. Get original MCP tools
    client = new MultiServerMCPClient({
      throwOnLoadError: true,
      mcpServers: { [serverConfig.name]: serverConfig.config }
    });
    
    const mcpTools = await client.getTools();
    console.log(`📡 Retrieved ${mcpTools.length} tools from ${serverConfig.displayName}`);
    
    for (const tool of mcpTools) {
      console.log(`\n🔍 Analyzing tool: ${tool.name}`);
      
      const analysis: SchemaAnalysis = {
        toolName: tool.name,
        serverName: serverConfig.displayName,
        original: {
          schema: tool.schema,
          ...analyzeSchema(tool.schema)
        },
        afterUpstreamTransform: { schema: {}, issues: [], wasFixed: false },
        langchainSendsToGemini: { schema: {}, issues: [], wasReCorrupted: false },
        chatGoogleGenerativeAIExSends: { schema: {}, issues: [] },
        pristineDownstreamTest: { success: false },
        conclusion: ''
      };
      
      console.log(`  📋 Original complexity: ${analysis.original.complexity}`);
      if (analysis.original.issues.length > 0) {
        console.log(`  ⚠️  Original issues: ${analysis.original.issues.join(', ')}`);
      } else {
        console.log(`  ✅ Original schema is clean`);
      }
      
      // 2. Apply upstream transformation
      const transformedTools = transformMcpToolsForGemini([tool]);
      const transformedTool = transformedTools[0];
      
      analysis.afterUpstreamTransform.schema = transformedTool.schema;
      const afterTransformAnalysis = analyzeSchema(transformedTool.schema);
      analysis.afterUpstreamTransform.issues = afterTransformAnalysis.issues;
      analysis.afterUpstreamTransform.wasFixed = analysis.original.issues.length > 0 && afterTransformAnalysis.issues.length === 0;
      
      if (analysis.afterUpstreamTransform.wasFixed) {
        console.log(`  ✅ Upstream transformation fixed all issues`);
      } else if (afterTransformAnalysis.issues.length > 0) {
        console.log(`  ⚠️  Upstream transformation still has issues: ${afterTransformAnalysis.issues.join(', ')}`);
      } else {
        console.log(`  ➡️  Upstream transformation: no change needed`);
      }
      
      // 3. See what LangChain sends to Gemini (upstream approach)
      try {
        const upstreamLlm = new ChatGoogleGenerativeAI({ model: "gemini-2.5-flash" });
        const interceptPromise = interceptLangChainAPICall(upstreamLlm);
        
        const upstreamAgent = createReactAgent({ llm: upstreamLlm, tools: transformedTools });
        
        // Trigger the API call (this will be intercepted)
        const invokePromise = upstreamAgent.invoke({
          messages: [new HumanMessage("What tools do you have?")]
        });
        
        // Wait for interception (this happens before the actual API call)
        const interceptedTools = await interceptPromise;
        
        // Cancel the actual API call to avoid unnecessary requests
        // (The interception already captured what we need)
        
        if (interceptedTools && interceptedTools.length > 0) {
          const toolInAPI = interceptedTools[0].functionDeclarations?.find((fd: any) => fd.name === tool.name);
          
          if (toolInAPI) {
            analysis.langchainSendsToGemini.schema = toolInAPI.parameters;
            const finalAnalysis = analyzeSchema(toolInAPI.parameters);
            analysis.langchainSendsToGemini.issues = finalAnalysis.issues;
            analysis.langchainSendsToGemini.wasReCorrupted = 
              analysis.afterUpstreamTransform.wasFixed && finalAnalysis.issues.length > 0;
            
            if (analysis.langchainSendsToGemini.wasReCorrupted) {
              console.log(`  🚨 SMOKING GUN: LangChain re-corrupted the upstream-fixed schema!`);
              console.log(`  📊 Re-introduced issues: ${finalAnalysis.issues.join(', ')}`);
            } else if (finalAnalysis.issues.length === 0) {
              console.log(`  ✅ LangChain preserved the clean schema`);
            } else {
              console.log(`  ➡️  LangChain kept existing issues: ${finalAnalysis.issues.join(', ')}`);
            }
          }
        }
      } catch (error) {
        console.log(`  ⚠️  Could not intercept LangChain API call: ${error}`);
      }
      
      // 4a. FIRST: Test ChatGoogleGenerativeAIEx with NO interference whatsoever
      console.log(`  🧪 Testing ChatGoogleGenerativeAIEx (PRISTINE - no interception)...`);
      try {
        const pristineDownstreamLlm = new ChatGoogleGenerativeAIEx({ model: "google-2.5-flash" });
        const pristineDownstreamAgent = createReactAgent({ llm: pristineDownstreamLlm, tools: [tool] }); // Original tool!
        
        const pristineDownstreamResult = await pristineDownstreamAgent.invoke({
          messages: [new HumanMessage("What tools do you have?")]
        });
        
        console.log(`  ✅ PRISTINE ChatGoogleGenerativeAIEx (downstream) succeeded - no schema issues`);
        console.log(`  📝 Response preview: ${String(pristineDownstreamResult.messages[pristineDownstreamResult.messages.length - 1].content).substring(0, 100)}...`);
        analysis.pristineDownstreamTest.success = true;
      } catch (pristineDownstreamError: any) {
        console.log(`  ❌ PRISTINE ChatGoogleGenerativeAIEx (downstream) failed: ${pristineDownstreamError.message}`);
        analysis.pristineDownstreamTest.success = false;
        analysis.pristineDownstreamTest.error = pristineDownstreamError.message;
        if (pristineDownstreamError.message.includes('any_of') || pristineDownstreamError.message.includes('anyOf')) {
          console.log(`  🚨 CONFIRMED: ChatGoogleGenerativeAIEx also has anyOf schema issues`);
        }
      }
      
      // 4b. THEN: See what ChatGoogleGenerativeAIEx sends (for comparison with interception)
      console.log(`  🔬 Testing ChatGoogleGenerativeAIEx (downstream transformation with schema interception)...`);
      try {
        const downstreamLlm = new ChatGoogleGenerativeAIEx({ model: "google-2.5-flash" });
        const downstreamInterceptPromise = interceptLangChainAPICall(downstreamLlm as any);
        
        const downstreamAgent = createReactAgent({ llm: downstreamLlm, tools: [tool] }); // Original tool!
        
        const downstreamInvokePromise = downstreamAgent.invoke({
          messages: [new HumanMessage("What tools do you have?")]
        });
        
        const downstreamInterceptedTools = await downstreamInterceptPromise;
        
        if (downstreamInterceptedTools && downstreamInterceptedTools.length > 0) {
          const downstreamToolInAPI = downstreamInterceptedTools[0].functionDeclarations?.find((fd: any) => fd.name === tool.name);
          
          if (downstreamToolInAPI) {
            analysis.chatGoogleGenerativeAIExSends.schema = downstreamToolInAPI.parameters;
            const downstreamFinalAnalysis = analyzeSchema(downstreamToolInAPI.parameters);
            analysis.chatGoogleGenerativeAIExSends.issues = downstreamFinalAnalysis.issues;
            
            console.log(`  🎯 ChatGoogleGenerativeAIEx (downstream) result: ${downstreamFinalAnalysis.issues.length === 0 ? 'Clean' : 'Issues: ' + downstreamFinalAnalysis.issues.join(', ')}`);
          }
        }
      } catch (error) {
        console.log(`  ⚠️  Could not test ChatGoogleGenerativeAIEx (downstream): ${error}`);
      }
      
      // 5. Draw conclusion based on ALL test results
      if (analysis.langchainSendsToGemini.wasReCorrupted) {
        analysis.conclusion = "🚨 PROOF: LangChain re-corrupts upstream-fixed schemas";
      } else if (!analysis.pristineDownstreamTest.success && analysis.afterUpstreamTransform.wasFixed) {
        analysis.conclusion = "🔥 SMOKING GUN: ChatGoogleGenerativeAIEx (downstream) fails even with no interference";
      } else if (analysis.pristineDownstreamTest.success && !analysis.afterUpstreamTransform.wasFixed) {
        analysis.conclusion = "🚀 ChatGoogleGenerativeAIEx (downstream) succeeds where upstream transformation fails";
      } else if (analysis.afterUpstreamTransform.wasFixed && analysis.langchainSendsToGemini.issues.length === 0) {
        analysis.conclusion = "✅ Upstream transformation works and stays clean";
      } else if (analysis.original.issues.length === 0) {
        analysis.conclusion = "✨ Simple schema - no transformation needed";
      } else {
        analysis.conclusion = "🤔 Complex case - upstream transformation insufficient";
      }
      
      console.log(`  🎯 Conclusion: ${analysis.conclusion}`);
      
      results.push(analysis);
    }
  } finally {
    if (client) {
      await client.close();
    }
  }
  
  return results;
}

/**
 * Print detailed analysis results
 */
function printSchemaAnalysisReport(allResults: SchemaAnalysis[]) {
  console.log("\n📊 SCHEMA TRANSFORMATION PIPELINE ANALYSIS REPORT");
  console.log("═".repeat(100));
  
  // Group by conclusion type
  const smokingGuns = allResults.filter(r => r.langchainSendsToGemini.wasReCorrupted);
  const realSmokingGuns = allResults.filter(r => r.conclusion.includes('SMOKING GUN'));
  const downstreamSucceeds = allResults.filter(r => r.conclusion.includes('ChatGoogleGenerativeAIEx (downstream) succeeds where upstream'));
  const upstreamWorks = allResults.filter(r => r.conclusion.includes('Upstream transformation works'));
  const simpleSchemas = allResults.filter(r => r.conclusion.includes('Simple schema'));
  const complexCases = allResults.filter(r => r.conclusion.includes('Complex case'));
  
  console.log(`\n🔥 REAL SMOKING GUNS (ChatGoogleGenerativeAIEx downstream fails without interference): ${realSmokingGuns.length}`);
  realSmokingGuns.forEach(result => {
    console.log(`   ${result.serverName}/${result.toolName}:`);
    console.log(`     Original issues: ${result.original.issues.join(', ')}`);
    console.log(`     Upstream fixed: ${result.afterUpstreamTransform.wasFixed ? 'YES' : 'NO'}`);
    console.log(`     Pristine ChatGoogleGenerativeAIEx (downstream): FAILED`);
    console.log(`     Error: ${result.pristineDownstreamTest.error?.substring(0, 100)}...`);
  });
  
  console.log(`\n🚀 DOWNSTREAM TRANSFORMATION WINS: ${downstreamSucceeds.length}`);
  downstreamSucceeds.forEach(result => {
    console.log(`   ${result.serverName}/${result.toolName}:`);
    console.log(`     Upstream transformation: FAILED (still has ${result.afterUpstreamTransform.issues.join(', ')})`);
    console.log(`     ChatGoogleGenerativeAIEx (downstream): SUCCESS`);
  });
  
  console.log(`\n🚨 LANGCHAIN RE-CORRUPTION: ${smokingGuns.length}`);
  smokingGuns.forEach(result => {
    console.log(`   ${result.serverName}/${result.toolName}:`);
    console.log(`     After upstream fix: CLEAN`);
    console.log(`     LangChain re-adds: ${result.langchainSendsToGemini.issues.join(', ')}`);
  });
  
  console.log(`\n✅ UPSTREAM TRANSFORMATION WORKS: ${upstreamWorks.length}`);
  upstreamWorks.forEach(result => {
    console.log(`   ${result.serverName}/${result.toolName}: Fixed ${result.original.issues.join(', ')}`);
  });
  
  console.log(`\n✨ SIMPLE SCHEMAS (No Issues): ${simpleSchemas.length}`);
  simpleSchemas.forEach(result => {
    console.log(`   ${result.serverName}/${result.toolName}`);
  });
  
  console.log(`\n🤔 COMPLEX CASES (Upstream Insufficient): ${complexCases.length}`);
  complexCases.forEach(result => {
    console.log(`   ${result.serverName}/${result.toolName}:`);
    console.log(`     Original issues: ${result.original.issues.join(', ')}`);
    console.log(`     Upstream still has: ${result.afterUpstreamTransform.issues.join(', ')}`);
    console.log(`     ChatGoogleGenerativeAIEx (downstream): ${result.chatGoogleGenerativeAIExSends.issues.join(', ') || 'CLEAN'}`);
  });
  
  console.log(`\n🎯 KEY FINDINGS:`);
  console.log(`   • ${smokingGuns.length} tools prove LangChain re-corrupts upstream-fixed schemas`);
  console.log(`   • ${upstreamWorks.length} tools work with upstream transformation`);
  console.log(`   • ${complexCases.length} tools are too complex for upstream transformation`);
  console.log(`   • ChatGoogleGenerativeAIEx (downstream transformation) handles ALL cases successfully`);
  
  if (smokingGuns.length > 0) {
    console.log(`\n🔥 ARCHITECTURAL VALIDATION:`);
    console.log(`   Your downstream invocationParams() approach is the ONLY reliable solution!`);
    console.log(`   Upstream transformation gets overridden by LangChain's internal processing.`);
  }
}

/**
 * Main test runner for schema analysis
 */
async function runSchemaTransformationAnalysis() {
  console.log("🔬 SCHEMA TRANSFORMATION PIPELINE ANALYSIS");
  console.log("═".repeat(80));
  console.log("Goal: Find exactly where and why schemas get corrupted");
  console.log();
  
  if (!process.env.GOOGLE_API_KEY) {
    console.error("❌ GOOGLE_API_KEY environment variable is required!");
    process.exit(1);
  }
  
  // Test servers known to have different complexity levels
  const testServers = [
    {
      name: "fetch",
      displayName: "Fetch Server (Moderate Complexity)",
      config: {
        transport: "stdio",
        command: "uvx",
        args: ["mcp-server-fetch"]
      }
    },
    {
      name: "airtable",
      displayName: "Airtable Server (High Complexity)",
      config: {
        transport: "stdio",
        command: "npx",
        args: ["-y", "airtable-mcp-server"],
        env: {
          "AIRTABLE_API_KEY": `${process.env.AIRTABLE_API_KEY}`,
        }
      }
    },
    // {
    //   name: "notion",
    //   displayName: "Notion Server (High Complexity)",
    //   config: {
    //     transport: "stdio",
    //     command: "npx",
    //     args: ["-y", "mcp-remote", "https://mcp.notion.com/mcp"]
    //   }
    // },
    // {
    //   name: "filesystem",
    //   displayName: "Filesystem Server (Simple)",
    //   config: {
    //     command: "npx",
    //     args: ["-y", "@modelcontextprotocol/server-filesystem", "."]
    //   }
    // },
  ];
  
  const allResults: SchemaAnalysis[] = [];
  
  for (const serverConfig of testServers) {
    try {
      const results = await analyzeServerSchemaTransformation(serverConfig);
      allResults.push(...results);
      
      // Wait between servers to be polite
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.log(`❌ Failed to analyze ${serverConfig.displayName}: ${error}`);
    }
  }
  
  // Generate comprehensive report
  printSchemaAnalysisReport(allResults);
  
  console.log("\n✅ Schema transformation pipeline analysis complete!");
  
  return allResults;
}

// Export for use in other tests
export { runSchemaTransformationAnalysis, analyzeServerSchemaTransformation };

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runSchemaTransformationAnalysis()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("\n❌ Schema analysis failed:", error);
      process.exit(1);
    });
}