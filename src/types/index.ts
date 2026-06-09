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
  attachments?: Omit<Attachment, 'id' | 'noteId' | 'createdAt'>[];
  metadata?: Record<string, unknown>;
}

export interface UpdateNoteOptions {
  title?: string;
  content?: string;
  tags?: string[];
  isFavorite?: boolean;
  metadata?: Record<string, unknown>;
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
