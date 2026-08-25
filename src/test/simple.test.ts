import assert from "node:assert/strict";
import { ChatGoogleGenerativeAIEx } from "../index.js";
import {
  makeJsonSchemaGeminiCompatible,
  transformMcpToolsForGemini,
  validateGeminiSchema,
} from "../schema-adapter-gemini.js";
import type { JsonSchemaDraft7 } from "../schema-adapter-types.js";

const incompatibleSchema: JsonSchemaDraft7 = {
  type: "object",
  description: "Fetch a URL",
  properties: {
    url: {
      type: ["string", "null"],
      format: "uri",
      description: "URL to fetch",
    },
    limit: {
      type: "integer",
      exclusiveMinimum: 0,
      exclusiveMaximum: 10,
    },
    output: {
      type: "object",
      description: "Output format",
      properties: {
        mode: {
          anyOf: [
            { type: "string", enum: ["raw", "html"] },
            {
              type: "object",
              required: ["missing"],
              properties: {
                selector: { type: "string" },
              },
            },
          ],
          description: "Output mode",
        },
      },
      required: ["mode", "missing"],
    },
  },
  required: ["url", "missing"],
  additionalProperties: false,
};

const transformResult = makeJsonSchemaGeminiCompatible(incompatibleSchema);
assert.equal(transformResult.wasTransformed, true);
assert.match(transformResult.changesSummary, /type array/);
assert.match(transformResult.changesSummary, /exclusive bound/);
assert.match(transformResult.changesSummary, /unsupported format/);

const validationErrors = validateGeminiSchema(transformResult.schema);
assert.deepEqual(validationErrors, []);

assert.deepEqual(transformResult.schema, {
  type: "object",
  description: "Fetch a URL",
  properties: {
    url: {
      type: "string",
      description: "URL to fetch",
      nullable: true,
    },
    limit: {
      type: "integer",
      minimum: 1,
      maximum: 9,
    },
    output: {
      type: "object",
      description: "Output format",
      properties: {
        mode: {
          anyOf: [
            {
              type: "string",
              enum: ["raw", "html"],
              description: "Output mode",
            },
            {
              type: "object",
              properties: {
                selector: {
                  type: "string",
                },
              },
              description: "Output mode",
            },
          ],
        },
      },
      required: ["mode"],
    },
  },
  required: ["url"],
});

const mcpTools = [
  {
    name: "fetch",
    description: "Fetch a URL",
    schema: incompatibleSchema,
  },
];

const transformedTools = transformMcpToolsForGemini(mcpTools);

assert.equal(transformedTools.length, 1);
assert.equal(transformedTools[0].name, "fetch");
assert.deepEqual(validateGeminiSchema(transformedTools[0].schema), []);
assert.deepEqual(transformedTools[0].schema, transformResult.schema);

const model = new ChatGoogleGenerativeAIEx({
  model: "gemini-2.5-flash",
  apiKey: "test-api-key",
});

const boundModel = model.bindTools(mcpTools);
assert.equal(typeof boundModel.invoke, "function");

console.log("simple smoke test passed");
