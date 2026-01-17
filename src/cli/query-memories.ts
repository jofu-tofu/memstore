#!/usr/bin/env bun

/**
 * CLI tool for querying MemStore
 *
 * Usage:
 *   query-memories sessions --date 2026-01
 *   query-memories sessions --tag typescript
 *   query-memories sessions --tags typescript,hooks --match all
 *   query-memories segments --keyword auth
 *   query-memories read --segment seg_abc123
 *   query-memories read --session mem_xyz789
 *   query-memories <command> --format json
 */

import { querySessionsByDate, querySessionsByTag } from '../lib/registry-query';
import { findSegmentsByKeyword, findSegmentsByKeywords } from '../lib/segment-search';
import { readSegment, readSessionSegments } from '../lib/segment-reader';

/**
 * Parse command-line arguments
 */
function parseArgs(): {
  command: string;
  options: Record<string, string | boolean>;
} {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    return { command: 'help', options: {} };
  }

  const command = args[0];
  const options: Record<string, string | boolean> = {};

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const nextArg = args[i + 1];

      if (nextArg && !nextArg.startsWith('--')) {
        // Option with value
        options[key] = nextArg;
        i++;
      } else {
        // Boolean flag
        options[key] = true;
      }
    }
  }

  return { command, options };
}

/**
 * Format date string to timestamp range
 * Supports: YYYY-MM or YYYY-MM-DD
 */
function parseDateRange(dateStr: string): { start: number; end: number } | null {
  try {
    if (/^\d{4}-\d{2}$/.test(dateStr)) {
      // YYYY-MM format
      const start = new Date(`${dateStr}-01T00:00:00Z`).getTime();
      const [year, month] = dateStr.split('-').map(Number);
      const nextMonth = month === 12 ? 1 : month + 1;
      const nextYear = month === 12 ? year + 1 : year;
      const end = new Date(`${nextYear}-${String(nextMonth).padStart(2, '0')}-01T00:00:00Z`).getTime() - 1;
      return { start, end };
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      // YYYY-MM-DD format
      const start = new Date(`${dateStr}T00:00:00Z`).getTime();
      const end = new Date(`${dateStr}T23:59:59.999Z`).getTime();
      return { start, end };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Format output as JSON
 */
function formatJson(data: any): void {
  console.log(JSON.stringify(data, null, 2));
}

/**
 * Format output as table
 */
function formatTable(headers: string[], rows: string[][]): void {
  // Calculate column widths
  const colWidths = headers.map((h, i) => {
    const maxContentWidth = Math.max(...rows.map(row => (row[i] || '').length));
    return Math.max(h.length, maxContentWidth);
  });

  // Print header
  const headerRow = headers.map((h, i) => h.padEnd(colWidths[i])).join(' │ ');
  console.log(headerRow);
  console.log(colWidths.map(w => '─'.repeat(w)).join('─┼─'));

  // Print rows
  for (const row of rows) {
    const formattedRow = row.map((cell, i) => (cell || '').padEnd(colWidths[i])).join(' │ ');
    console.log(formattedRow);
  }
}

/**
 * Execute sessions command
 */
function execSessionsCommand(options: Record<string, string | boolean>): void {
  const format = options.format as string || 'table';
  const limit = options.limit ? parseInt(options.limit as string) : 100;
  const offset = options.offset ? parseInt(options.offset as string) : 0;

  // Query by date
  if (options.date) {
    const dateRange = parseDateRange(options.date as string);

    if (!dateRange) {
      console.error('Error: Invalid date format. Use YYYY-MM or YYYY-MM-DD');
      process.exit(1);
    }

    const result = querySessionsByDate(dateRange.start, dateRange.end, { limit, offset });

    if (!result.ok) {
      console.error(`Error: ${result.error.message}`);
      process.exit(1);
    }

    if (format === 'json') {
      formatJson(result.value);
    } else {
      console.log(`\nFound ${result.value.length} sessions for ${options.date}:\n`);
      const headers = ['Session ID', 'Date', 'Segments', 'Tags'];
      const rows = result.value.map(s => [
        s.sessionId,
        new Date(s.capturedAt).toISOString().split('T')[0],
        String(s.segmentCount),
        s.tags.join(', ')
      ]);
      formatTable(headers, rows);
    }
    return;
  }

  // Query by tag(s)
  if (options.tag || options.tags) {
    const tagStr = (options.tag || options.tags) as string;
    const tags = tagStr.split(',').map(t => t.trim());
    const matchMode = options.match === 'all' ? 'all' : 'any';

    const result = querySessionsByTag(tags, matchMode, { limit, offset });

    if (!result.ok) {
      console.error(`Error: ${result.error.message}`);
      process.exit(1);
    }

    if (format === 'json') {
      formatJson(result.value);
    } else {
      console.log(`\nFound ${result.value.length} sessions matching tag(s) [${tags.join(', ')}] (${matchMode}):\n`);
      const headers = ['Session ID', 'Date', 'Segments', 'Tags'];
      const rows = result.value.map(s => [
        s.sessionId,
        new Date(s.capturedAt).toISOString().split('T')[0],
        String(s.segmentCount),
        s.tags.join(', ')
      ]);
      formatTable(headers, rows);
    }
    return;
  }

  console.error('Error: Must specify --date or --tag/--tags');
  process.exit(1);
}

/**
 * Execute segments command
 */
async function execSegmentsCommand(options: Record<string, string | boolean>): Promise<void> {
  const format = options.format as string || 'table';

  // Multi-keyword search with scoring
  if (options.keywords) {
    const keywordsStr = options.keywords as string;
    const keywords = keywordsStr.split(',').map(k => k.trim());

    const result = await findSegmentsByKeywords(keywords);

    if (!result.ok) {
      console.error(`Error: ${result.error.message}`);
      process.exit(1);
    }

    if (format === 'json') {
      formatJson(result.value);
    } else {
      console.log(`\nFound ${result.value.length} segments matching keywords [${keywords.join(', ')}]:\n`);
      const headers = ['Segment ID', 'Score', 'Matched Keywords'];
      const rows = result.value.map(m => [
        m.segmentId,
        String(m.matchScore),
        m.matchedKeywords.join(', ')
      ]);
      formatTable(headers, rows);
    }
    return;
  }

  // Single keyword search
  if (options.keyword) {
    const keyword = options.keyword as string;
    const result = await findSegmentsByKeyword(keyword);

    if (!result.ok) {
      console.error(`Error: ${result.error.message}`);
      process.exit(1);
    }

    if (format === 'json') {
      formatJson(result.value);
    } else {
      console.log(`\nFound ${result.value.length} segments for keyword "${keyword}":\n`);
      const headers = ['Segment ID'];
      const rows = result.value.map(id => [id]);
      formatTable(headers, rows);
    }
    return;
  }

  console.error('Error: Must specify --keyword or --keywords');
  process.exit(1);
}

/**
 * Execute read command
 */
function execReadCommand(options: Record<string, string | boolean>): void {
  const format = options.format as string || 'text';

  // Read by segment ID
  if (options.segment) {
    const segmentId = options.segment as string;
    const result = readSegment(segmentId);

    if (!result.ok) {
      console.error(`Error: ${result.error.message}`);
      process.exit(1);
    }

    if (format === 'json') {
      formatJson(result.value);
    } else {
      const seg = result.value;
      console.log(`\nSegment: ${seg.id}`);
      console.log(`Session: ${seg.sessionId}`);
      console.log(`Date: ${new Date(seg.timestamp).toISOString()}`);
      console.log(`Tags: ${seg.tags.join(', ')}`);
      console.log(`Access Count: ${seg.accessCount}`);
      console.log(`Last Accessed: ${seg.lastAccessed ? new Date(seg.lastAccessed).toISOString() : 'Never'}`);
      console.log(`\n${'─'.repeat(60)}`);
      console.log(seg.content);
      console.log('─'.repeat(60));
    }
    return;
  }

  // Read by session ID
  if (options.session) {
    const sessionId = options.session as string;
    const result = readSessionSegments(sessionId);

    if (!result.ok) {
      console.error(`Error: ${result.error.message}`);
      process.exit(1);
    }

    if (format === 'json') {
      formatJson(result.value);
    } else {
      console.log(`\nFound ${result.value.length} segments for session ${sessionId}:\n`);
      for (const seg of result.value) {
        console.log(`\n[${ seg.id}]`);
        console.log(`Tags: ${seg.tags.join(', ')}`);
        console.log(`Date: ${new Date(seg.timestamp).toISOString()}`);
        console.log(`─`.repeat(60));
        console.log(seg.content);
        console.log('─'.repeat(60));
      }
    }
    return;
  }

  console.error('Error: Must specify --segment or --session');
  process.exit(1);
}

/**
 * Show help message
 */
function showHelp(): void {
  console.log(`
query-memories - CLI tool for querying MemStore

USAGE:
  query-memories <command> [options]

COMMANDS:
  sessions     Query sessions by date or tags
  segments     Search segments by keyword
  read         Read segment or session content
  help         Show this help message

SESSION QUERIES:
  query-memories sessions --date 2026-01
  query-memories sessions --date 2026-01-15  (dates interpreted as UTC)
  query-memories sessions --tag typescript
  query-memories sessions --tags typescript,hooks --match all
  query-memories sessions --tags typescript,hooks --match any
  query-memories sessions --date 2026-01 --limit 10 --offset 0

SEGMENT QUERIES:
  query-memories segments --keyword auth
  query-memories segments --keywords auth,security,jwt  (multi-keyword with scoring)

READ OPERATIONS:
  query-memories read --segment seg_abc123
  query-memories read --session mem_xyz789

OUTPUT FORMATS:
  --format json    Output as JSON (default: table/text)

PAGINATION OPTIONS:
  --limit N        Max results to return (default: 100)
  --offset N       Skip first N results (default: 0)

EXAMPLES:
  # Find all sessions from January 2026 (UTC timezone)
  query-memories sessions --date 2026-01

  # Find sessions tagged with "typescript"
  query-memories sessions --tag typescript

  # Find sessions with both "typescript" AND "hooks" tags
  query-memories sessions --tags typescript,hooks --match all

  # Paginate results (skip first 10, return next 5)
  query-memories sessions --tag typescript --limit 5 --offset 10

  # Find segments mentioning "auth" (single keyword)
  query-memories segments --keyword auth

  # Find segments matching multiple keywords with scoring
  query-memories segments --keywords auth,security,jwt

  # Read specific segment
  query-memories read --segment seg_1704912345000_a1b2c3d4

  # Read all segments from session
  query-memories read --session mem_1704912345000_e5f6g7h8

  # Get JSON output
  query-memories sessions --tag typescript --format json
`);
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const { command, options } = parseArgs();

  try {
    switch (command) {
      case 'sessions':
        execSessionsCommand(options);
        break;

      case 'segments':
        await execSegmentsCommand(options);
        break;

      case 'read':
        execReadCommand(options);
        break;

      case 'help':
      default:
        showHelp();
        break;
    }
  } catch (error) {
    console.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

main();
