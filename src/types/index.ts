export interface Attachment {
  id: string;
  name: string;
  path: string;
  type: string;
  size: number;
  noteId: string;
  createdAt: number;
}

export interface WikiLink {
  targetId: string;
  targetTitle: string;
  anchor?: string;
  displayText?: string;
  position: {
    start: number;
    end: number;
  };
}

export interface Note {
  id: string;
  title: string;
  content: string;
  summary?: string;
  tags: string[];
  isFavorite: boolean;
  attachments: Attachment[];
  outLinks: WikiLink[];
  createdAt: number;
  updatedAt: number;
  lastVisitedAt?: number;
  metadata: Record<string, unknown>;
}

export interface Tag {
  name: string;
  noteIds: string[];
  count: number;
}

export type ImportConflictStrategy = 'skip' | 'overwrite' | 'rename';

export interface SearchOptions {
  query: string;
  searchInTitle?: boolean;
  searchInContent?: boolean;
  searchInTags?: boolean;
  tagFilters?: string[];
  tagFilterMode?: 'any' | 'all';
  isFavorite?: boolean;
  hasAttachments?: boolean;
  attachmentTypes?: string[];
  dateFrom?: number;
  dateTo?: number;
  dateField?: 'createdAt' | 'updatedAt' | 'lastVisitedAt';
  sortBy?: 'score' | 'createdAt' | 'updatedAt' | 'title';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
  caseSensitive?: boolean;
  enableHighlight?: boolean;
  enableSnippet?: boolean;
  snippetLength?: number;
}

export interface SearchMatch {
  field: 'title' | 'content' | 'tags';
  matchedText: string;
  highlighted?: string;
  snippet?: string;
  position?: number;
}

export interface SearchResult {
  note: Note;
  score: number;
  matches: SearchMatch[];
  bestSnippet?: string;
}

export interface SimilarNote {
  note: Note;
  similarity: number;
  reasons: string[];
}

export interface RelationNode {
  id: string;
  title: string;
  type: 'note' | 'tag';
  data?: Record<string, unknown>;
}

export interface RelationEdge {
  source: string;
  target: string;
  type: 'link' | 'tag';
  weight?: number;
}

export interface RelationGraph {
  nodes: RelationNode[];
  edges: RelationEdge[];
}

export interface ReferenceInfo {
  noteId: string;
  noteTitle: string;
  linkCount: number;
  links: WikiLink[];
}

export interface RecentVisit {
  noteId: string;
  noteTitle: string;
  visitedAt: number;
}

export interface CreateNoteOptions {
  title: string;
  content?: string;
  tags?: string[];
  isFavorite?: boolean;
  summary?: string;
  attachments?: Omit<Attachment, 'id' | 'noteId' | 'createdAt'>[];
  metadata?: Record<string, unknown>;
  createdAt?: number;
  updatedAt?: number;
}

export interface UpdateNoteOptions {
  title?: string;
  content?: string;
  tags?: string[];
  isFavorite?: boolean;
  summary?: string;
  attachments?: Omit<Attachment, 'id' | 'noteId' | 'createdAt'>[];
  metadata?: Record<string, unknown>;
  updatedAt?: number;
}

export interface ExportOptions {
  format: 'json' | 'markdown';
  includeAttachments?: boolean;
  noteIds?: string[];
  tagFilters?: string[];
}

export interface ImportOptions {
  conflictStrategy?: ImportConflictStrategy;
  keepCreationTime?: boolean;
  keepUpdateTime?: boolean;
  keepFavorites?: boolean;
  keepTags?: boolean;
  keepAttachments?: boolean;
  keepSummary?: boolean;
  keepMetadata?: boolean;
}

export interface ImportResult {
  successCount: number;
  failedCount: number;
  skippedCount: number;
  overwrittenCount: number;
  renamedCount: number;
  errors: {
    index: number;
    message: string;
    data?: unknown;
  }[];
  importedNotes: Note[];
  importedNoteIds: string[];
  skippedNotes: { title: string; existingId: string }[];
  overwrittenNotes: { title: string; oldId: string; newId: string }[];
  renamedNotes: { oldTitle: string; newTitle: string; noteId: string }[];
}

export interface VisitStats {
  noteId: string;
  noteTitle: string;
  totalVisits: number;
  uniqueVisits: number;
  firstVisitAt: number;
  lastVisitAt: number;
  averageVisitInterval?: number;
}

export interface KnowledgeLibraryConfig {
  autoParseLinks?: boolean;
  autoGenerateSummary?: boolean;
  summaryMaxLength?: number;
  searchResultLimit?: number;
  maxRecentVisits?: number;
  similarityThreshold?: number;
  enableFuzzySearch?: boolean;
}

export interface BackupPackage {
  version: string;
  exportedAt: number;
  libraryVersion: string;
  notes: Note[];
  attachments: Attachment[];
  history: RecentVisit[];
  stats: {
    noteCount: number;
    attachmentCount: number;
    tagCount: number;
    historyCount: number;
  };
}

export interface ImportPreviewItem {
  title: string;
  action: 'create' | 'skip' | 'overwrite' | 'rename';
  existingId?: string;
  newTitle?: string;
  hasAttachments: boolean;
  isFavorite: boolean;
  tagCount: number;
  createdAt?: number;
  updatedAt?: number;
}

export interface ImportPreview {
  items: ImportPreviewItem[];
  summary: {
    total: number;
    toCreate: number;
    toSkip: number;
    toOverwrite: number;
    toRename: number;
  };
  options: ImportOptions;
}

export interface GraphFilterOptions {
  tagFilters?: string[];
  tagFilterMode?: 'any' | 'all';
  isFavorite?: boolean;
  hasAttachments?: boolean;
  attachmentTypes?: string[];
  noteIds?: string[];
  includeTags?: boolean;
  maxDepth?: number;
}

export interface GraphAnalysis {
  orphanNodes: Note[];
  brokenLinkNodes: { note: Note; brokenLinks: WikiLink[] }[];
  centralNodes: { note: Note; centrality: number; inDegree: number; outDegree: number }[];
  isolatedClusters: { id: string; notes: Note[]; size: number }[];
  stats: {
    totalNodes: number;
    totalEdges: number;
    orphanCount: number;
    brokenLinkCount: number;
    averageDegree: number;
    density: number;
  };
}

export interface SavedSearchFilter {
  id: string;
  name: string;
  options: SearchOptions;
  createdAt: number;
  usedAt: number;
  useCount: number;
}

export interface SearchCursor {
  offset: number;
  total: number;
  hasMore: boolean;
  query: string;
  options: SearchOptions;
  cacheKey: string;
  expiresAt: number;
}

export interface PaginatedSearchResult {
  results: SearchResult[];
  cursor: SearchCursor;
  total: number;
  hasMore: boolean;
}

export interface EnhancedSearchMatch {
  field: 'title' | 'content' | 'tags';
  matchedText: string;
  highlightedText: string;
  snippet: string;
  position: number;
  length: number;
}

export interface EnhancedSearchResult {
  note: Note;
  score: number;
  matches: EnhancedSearchMatch[];
  bestMatch: EnhancedSearchMatch;
  bestSnippet: string;
  highlightedTitle?: string;
}
