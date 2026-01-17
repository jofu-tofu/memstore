import { describe, test, expect } from 'bun:test';
import { parseFrontmatter, serializeFrontmatter } from './frontmatter';

describe('Frontmatter utilities', () => {
  describe('parseFrontmatter', () => {
    test('extracts YAML and body with snake_case to camelCase conversion', () => {
      const content = `---
session_id: "mem_123"
importance_score: 50
access_count: 3
last_accessed: 1704912345000
---
This is the content`;

      const result = parseFrontmatter(content);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.frontmatter.sessionId).toBe('mem_123');
        expect(result.value.frontmatter.importanceScore).toBe(50);
        expect(result.value.frontmatter.accessCount).toBe(3);
        expect(result.value.frontmatter.lastAccessed).toBe(1704912345000);
        expect(result.value.body).toBe('This is the content');
      }
    });

    test('handles missing frontmatter', () => {
      const content = 'Just content, no frontmatter';
      const result = parseFrontmatter(content);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.frontmatter).toEqual({});
        expect(result.value.body).toBe(content);
      }
    });

    test('handles empty frontmatter', () => {
      const content = `---
---
Body content here`;

      const result = parseFrontmatter(content);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.frontmatter).toEqual({});
        expect(result.value.body).toBe('Body content here');
      }
    });

    test('converts multi-word snake_case keys correctly', () => {
      const content = `---
this_is_a_long_key: "value"
another_snake_case_property: 42
---
Content`;

      const result = parseFrontmatter(content);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.frontmatter.thisIsALongKey).toBe('value');
        expect(result.value.frontmatter.anotherSnakeCaseProperty).toBe(42);
      }
    });

    test('handles nested objects', () => {
      const content = `---
session_id: "mem_123"
metadata:
  created_at: 1704912345000
  user_name: "Josh"
---
Content`;

      const result = parseFrontmatter(content);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.frontmatter.sessionId).toBe('mem_123');
        expect(result.value.frontmatter.metadata).toBeDefined();
        expect(result.value.frontmatter.metadata.createdAt).toBe(1704912345000);
        expect(result.value.frontmatter.metadata.userName).toBe('Josh');
      }
    });
  });

  describe('serializeFrontmatter', () => {
    test('converts to YAML with camelCase to snake_case conversion', () => {
      const segment = {
        sessionId: 'mem_123',
        importanceScore: 50,
        accessCount: 3,
        content: 'Test content'
      };

      const result = serializeFrontmatter(segment);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toContain('session_id: mem_123');
        expect(result.value).toContain('importance_score: 50');
        expect(result.value).toContain('access_count: 3');
        expect(result.value).toContain('---\n');
        expect(result.value).toContain('Test content');
        expect(result.value).not.toContain('content:'); // content field should not be in YAML
      }
    });

    test('handles missing content field', () => {
      const segment = {
        sessionId: 'mem_456',
        importanceScore: 75
      };

      const result = serializeFrontmatter(segment);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toContain('session_id: mem_456');
        expect(result.value).toContain('importance_score: 75');
        expect(result.value).toContain('---\n');
      }
    });

    test('converts multi-word camelCase keys correctly', () => {
      const segment = {
        thisIsALongKey: 'value',
        anotherCamelCaseProperty: 42,
        content: 'Test'
      };

      const result = serializeFrontmatter(segment);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toContain('this_is_a_long_key: value');
        expect(result.value).toContain('another_camel_case_property: 42');
      }
    });

    test('round-trip conversion preserves data', () => {
      const original = {
        sessionId: 'mem_789',
        importanceScore: 90,
        accessCount: 5,
        lastAccessed: 1704912345000,
        content: 'Original content here'
      };

      const serialized = serializeFrontmatter(original);
      expect(serialized.ok).toBe(true);

      if (serialized.ok) {
        const parsed = parseFrontmatter(serialized.value);
        expect(parsed.ok).toBe(true);

        if (parsed.ok) {
          expect(parsed.value.frontmatter.sessionId).toBe(original.sessionId);
          expect(parsed.value.frontmatter.importanceScore).toBe(original.importanceScore);
          expect(parsed.value.frontmatter.accessCount).toBe(original.accessCount);
          expect(parsed.value.frontmatter.lastAccessed).toBe(original.lastAccessed);
          expect(parsed.value.body).toBe(original.content);
        }
      }
    });
  });
});
