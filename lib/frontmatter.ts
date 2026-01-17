import yaml from 'js-yaml';
import type { Result } from '../types/common';

/**
 * Converts snake_case string to camelCase
 */
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Converts camelCase string to snake_case
 */
function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

/**
 * Recursively converts object keys from snake_case to camelCase
 */
function convertKeysToCamel(obj: any): any {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(convertKeysToCamel);
  }

  const converted: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    converted[snakeToCamel(key)] = convertKeysToCamel(value);
  }
  return converted;
}

/**
 * Recursively converts object keys from camelCase to snake_case
 */
function convertKeysToSnake(obj: any): any {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(convertKeysToSnake);
  }

  const converted: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    converted[camelToSnake(key)] = convertKeysToSnake(value);
  }
  return converted;
}

/**
 * Parses frontmatter from markdown content.
 * Extracts YAML frontmatter and converts snake_case keys to camelCase.
 *
 * @param content - Markdown content with optional YAML frontmatter
 * @returns Result with object containing frontmatter (camelCase keys) and body, or error
 */
export function parseFrontmatter(content: string): Result<{ frontmatter: any; body: string }, Error> {
  try {
    // Match frontmatter pattern: ---\n{yaml}\n---\n{body}
    // Regex explanation: Matches content between --- delimiters with optional newlines
    const match = content.match(/^---\n?([\s\S]*?)\n?---\n([\s\S]*)$/);

    if (!match) {
      return { ok: true, value: { frontmatter: {}, body: content } };
    }

    const yamlText = match[1];
    const body = match[2];

    // Handle empty frontmatter
    if (!yamlText || !yamlText.trim()) {
      return { ok: true, value: { frontmatter: {}, body } };
    }

    const rawFrontmatter = yaml.load(yamlText) as Record<string, any>;

    // Convert snake_case keys to camelCase recursively
    const frontmatter = convertKeysToCamel(rawFrontmatter);

    return { ok: true, value: { frontmatter, body } };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error : new Error(String(error))
    };
  }
}

/**
 * Serializes an object to YAML frontmatter with markdown content.
 * Converts camelCase keys to snake_case for YAML.
 *
 * @param segment - Object with data and optional content field
 * @returns Result with markdown string containing YAML frontmatter and content, or error
 */
export function serializeFrontmatter(segment: any): Result<string, Error> {
  try {
    // Separate content from other fields
    const { content, ...fields } = segment;

    // Convert camelCase keys to snake_case recursively
    const yamlData = convertKeysToSnake(fields);

    const yamlText = yaml.dump(yamlData);
    const contentText = content || '';

    return { ok: true, value: `---\n${yamlText}---\n${contentText}` };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error : new Error(String(error))
    };
  }
}
