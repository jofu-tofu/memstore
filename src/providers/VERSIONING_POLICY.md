# Provider Interface Versioning Policy

**Version:** 1.0.0
**Status:** Active
**Last Updated:** 2026-01-12

## Overview

This document defines the semantic versioning policy for MemStore provider interfaces. Our commitment to interface stability ensures that contributors can implement new providers with confidence that their code won't break with minor updates.

## Semantic Versioning for Provider Interfaces

All provider interfaces follow **Semantic Versioning (SemVer)**: `MAJOR.MINOR.PATCH`

### Version Components

#### Major Version (X.0.0) - Breaking Changes

**Triggers a major version bump:**
- Adding required methods to an interface
- Removing methods from an interface
- Changing method signatures (parameters or return types)
- Changing Result type structures
- Removing or renaming interface properties

**Example breaking changes:**
```typescript
// v1.0.0
interface SearchProvider extends Provider {
  search(query: string): Promise<Result<SearchResult[], SearchError>>;
}

// v2.0.0 - BREAKING: added required parameter
interface SearchProvider extends Provider {
  search(query: string, options: SearchOptions): Promise<Result<SearchResult[], SearchError>>;
}
```

#### Minor Version (1.X.0) - Backward-Compatible Additions

**Triggers a minor version bump:**
- Adding new optional methods to an interface
- Adding new optional parameters to existing methods
- Adding new provider types (new interfaces)
- Enhancing documentation without changing behavior
- Adding new optional fields to option/result types

**Example non-breaking additions:**
```typescript
// v1.0.0
interface SearchProvider extends Provider {
  search(query: string): Promise<Result<SearchResult[], SearchError>>;
}

// v1.1.0 - NON-BREAKING: added optional parameter
interface SearchProvider extends Provider {
  search(query: string, options?: SearchOptions): Promise<Result<SearchResult[], SearchError>>;
}

// v1.2.0 - NON-BREAKING: added optional method
interface SearchProvider extends Provider {
  search(query: string, options?: SearchOptions): Promise<Result<SearchResult[], SearchError>>;
  reindex?(): Promise<Result<void, SearchError>>; // Optional method
}
```

#### Patch Version (1.0.X) - Documentation and Clarifications

**Triggers a patch version bump:**
- Clarifying JSDoc comments
- Fixing typos in documentation
- Adding usage examples
- Improving error messages
- Adding missing parameter descriptions
- Clarifying existing behavior

**Example documentation improvements:**
```typescript
// v1.0.0
/**
 * Search for memories
 */
search(query: string): Promise<Result<SearchResult[], SearchError>>;

// v1.0.1 - Documentation improvement only
/**
 * Search for memories matching the given query.
 *
 * @param query - User's search query text
 * @returns Result containing search results or error
 *
 * @example
 * ```typescript
 * const result = await search.search('typescript hooks');
 * ```
 */
search(query: string): Promise<Result<SearchResult[], SearchError>>;
```

## Version Stability Commitment

### Our Promise to Contributors

1. **No Breaking Changes Within a Major Version**
   - Code written for v1.0.0 will work with v1.1.0, v1.2.0, etc.
   - Your provider implementations won't break with minor/patch updates

2. **Deprecation Warnings Before Removal**
   - Features marked for removal get `@deprecated` tags at least 1 minor version early
   - Deprecation notices include:
     - Replacement recommendation
     - Expected removal version
     - Migration guide link

3. **Migration Guides for Breaking Changes**
   - Every major version bump includes a migration guide
   - Step-by-step instructions for updating code
   - Automated migration tools when possible

4. **Backward Compatibility for Minor/Patch Versions**
   - Optional parameters always have sensible defaults
   - New methods are always optional (or have default implementations)
   - Behavior changes never affect existing functionality

## Deprecation Process

### Step 1: Mark as Deprecated (Version N.X.0)

Add `@deprecated` JSDoc tag with replacement guidance:

```typescript
/**
 * Search for memories
 *
 * @deprecated Use search() with SearchOptions instead.
 * Will be removed in v2.0.0.
 * Migration guide: /docs/migrations/search-v2.md
 */
searchWithLimit(query: string, limit: number): Promise<Result<SearchResult[], SearchError>>;
```

### Step 2: Document Alternative (Version N.X.0)

Provide working alternative in the same version:

```typescript
/**
 * Search for memories with configurable options
 *
 * @example
 * ```typescript
 * // Replaces deprecated searchWithLimit()
 * const result = await search.search('query', { maxResults: 10 });
 * ```
 */
search(query: string, options?: SearchOptions): Promise<Result<SearchResult[], SearchError>>;
```

### Step 3: Remove Deprecated Code (Version N+1.0.0)

Remove in next major version with prominent changelog entry:

```markdown
## v2.0.0 - Breaking Changes

### Removed
- `SearchProvider.searchWithLimit()` - Use `search(query, { maxResults })` instead
  - Migration guide: /docs/migrations/search-v2.md
```

## Migration Guide Template

Every breaking change includes a migration guide:

```markdown
# Migration Guide: [Feature] v1 → v2

## Summary
Brief description of what changed and why.

## Breaking Changes
- List of all breaking changes
- Old API → New API mapping

## Migration Steps

### Step 1: [Action]
```typescript
// Before (v1)
const result = await provider.oldMethod(arg);

// After (v2)
const result = await provider.newMethod(arg, options);
```

### Step 2: [Action]
...

## Compatibility Notes
- Mention any edge cases
- Note any behavioral differences

## Need Help?
- Link to documentation
- Link to examples
- Contact information
```

## Version Compatibility Matrix

| Interface Version | Compatible Provider Versions | Notes |
|-------------------|------------------------------|-------|
| 1.0.0 | 1.0.x, 1.1.x, 1.2.x | All v1 minors compatible |
| 2.0.0 | 2.0.x, 2.1.x | Breaking changes from v1 |

## Current Interface Versions

| Interface | Version | Last Updated | Status |
|-----------|---------|--------------|--------|
| Provider (base) | 1.0.0 | 2026-01-12 | Stable |
| StorageProvider | 1.0.0 | 2026-01-12 | Stable |
| SearchProvider | 1.0.0 | 2026-01-12 | Stable |
| SummarizeProvider | 1.0.0 | 2026-01-12 | Stable |
| SegmentProvider | 1.0.0 | 2026-01-12 | Stable |
| ExtractProvider | 1.0.0 | 2026-01-12 | Stable |
| OrganizeProvider | 1.0.0 | 2026-01-12 | Stable |

## Proposing Interface Changes

### For Core Team

1. **Identify Impact Level**
   - Breaking change → Major version
   - New feature → Minor version
   - Documentation → Patch version

2. **Create RFC (Request for Comments)**
   - Describe proposed change
   - Justify the change
   - Document migration path
   - Estimate community impact

3. **Community Review Period**
   - Minimum 2 weeks for breaking changes
   - Gather feedback from implementers
   - Address concerns and alternatives

4. **Implementation**
   - Update interface files
   - Add deprecation warnings (if applicable)
   - Update version numbers
   - Create migration guide
   - Update CHANGELOG.md

### For Contributors

If you need an interface change:

1. **Check Existing Interfaces**
   - Can your use case work with current interface?
   - Can you use optional parameters?

2. **Propose Extension (Non-Breaking)**
   - Open GitHub issue describing need
   - Propose optional method/parameter addition
   - Provide use case and examples

3. **Propose Breaking Change**
   - Open GitHub issue with "BREAKING:" prefix
   - Strong justification required
   - Show migration path
   - Expect thorough review

## Changelog Standards

Every interface change requires a CHANGELOG.md entry:

```markdown
## [2.0.0] - 2026-XX-XX

### Breaking Changes
- **SearchProvider**: Removed `searchWithLimit()` method
  - Use `search(query, { maxResults })` instead
  - Migration guide: /docs/migrations/search-v2.md

### Added
- **SearchProvider**: Added optional `reindex()` method
- **SummarizeProvider**: Added `options` parameter to `summarize()`

### Fixed
- **StorageProvider**: Clarified idempotent delete() behavior in docs

### Deprecated
- **ExtractProvider**: `extractKeywords()` deprecated in favor of `extract()`
  - Will be removed in v3.0.0
```

## FAQ

### Q: I want to add a new optional parameter. Is this breaking?

**A:** No, adding optional parameters is non-breaking (minor version). Ensure it has a sensible default.

### Q: I want to make an optional parameter required. Is this breaking?

**A:** Yes, this is breaking (major version). Follow the deprecation process first.

### Q: Can I change error codes?

**A:** Adding new error codes is non-breaking (minor version). Removing or renaming error codes is breaking (major version).

### Q: I found a bug in the interface documentation. What version bump?

**A:** Documentation fixes are patch version bumps.

### Q: Can I change internal implementation without changing the interface?

**A:** Yes! Implementation changes don't affect interface versioning. Just follow your provider's own versioning.

## References

- [Semantic Versioning 2.0.0](https://semver.org/)
- [Provider Interface Contracts](./IMPLEMENTATION_GUIDE.md)
- [Architecture Documentation](../../../_bmad-output/planning-artifacts/architecture.md)

## Change History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-12 | Initial versioning policy (Story 5.2) |
