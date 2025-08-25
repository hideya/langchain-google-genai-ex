/**
 * Type definitions for JSON Schema transformation utilities
 */

export interface JsonSchemaDraft7 {
  $schema?: string;
  $id?: string;
  $ref?: string;
  $defs?: Record<string, JsonSchemaDraft7>;
  definitions?: Record<string, JsonSchemaDraft7>;
  
  // Type information
  type?: string | string[];
  format?: string;
  
  // Metadata
  title?: string;
  description?: string;
  default?: unknown;
  examples?: unknown[];
  example?: unknown;
  
  // Validation keywords for any type
  const?: unknown;
  enum?: unknown[];
  
  // Validation keywords for numeric types
  multipleOf?: number;
  maximum?: number;
  exclusiveMaximum?: number;
  minimum?: number;
  exclusiveMinimum?: number;
  
  // Validation keywords for strings
  maxLength?: number;
  minLength?: number;
  pattern?: string;
  
  // Validation keywords for arrays
  items?: JsonSchemaDraft7 | JsonSchemaDraft7[];
  additionalItems?: JsonSchemaDraft7 | boolean;
  maxItems?: number;
  minItems?: number;
  uniqueItems?: boolean;
  contains?: JsonSchemaDraft7;
  
  // Validation keywords for objects
  maxProperties?: number;
  minProperties?: number;
  required?: string[];
  properties?: Record<string, JsonSchemaDraft7>;
  patternProperties?: Record<string, JsonSchemaDraft7>;
  additionalProperties?: JsonSchemaDraft7 | boolean;
  dependencies?: Record<string, JsonSchemaDraft7 | string[]>;
  propertyNames?: JsonSchemaDraft7;
  
  // Boolean logic
  allOf?: JsonSchemaDraft7[];
  anyOf?: JsonSchemaDraft7[];
  oneOf?: JsonSchemaDraft7[];
  not?: JsonSchemaDraft7;
  
  // Conditional logic
  if?: JsonSchemaDraft7;
  then?: JsonSchemaDraft7;
  else?: JsonSchemaDraft7;
  
  // Additional properties
  nullable?: boolean;
  readOnly?: boolean;
  writeOnly?: boolean;
  
  // Custom extensions
  [key: string]: unknown;
}

export interface TransformResult {
  schema: JsonSchemaDraft7;
  wasTransformed: boolean;
  changesSummary: string;
}
