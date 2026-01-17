// Filter types and interfaces for search filtering

export interface FilterOptions {
  tags?: string[];           // Filter by tags (OR within tags, AND with other filters)
  recency?: string;          // e.g., "7d", "30d", "90d"
  minImportance?: number;    // Minimum importance score (0-100)
  minAccessCount?: number;   // Minimum access count
}

export interface SegmentMetadata {
  id: string;
  sessionId: string;
  timestamp: number;
  importanceScore: number;
  accessCount: number;
  lastAccessed: number | null;
  tags: string[];
  memoryType: 'episodic' | 'semantic' | 'procedural';
  title?: string;
}

export interface FilterResult {
  segmentId: string;
  matchCount: number;        // From keyword search
  matchedTerms: string[];    // From keyword search
  totalQueryTerms: number;   // From keyword search (total terms in query)
  metadata: SegmentMetadata; // Loaded from registry
}

export interface FilterError {
  code: string;
  message: string;
  cause?: Error;
}
