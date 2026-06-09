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

export interface SearchOptions {
  query: string;
  searchInTitle?: boolean;
  searchInContent?: boolean;
  searchInTags?: boolean;
  tagFilters?: string[];
  limit?: number;
  offset?: number;
  caseSensitive?: boolean;
  enableHighlight?: boolean;
}

export interface SearchResult {
  note: Note;
  score: number;
  matches: {
    field: 'title' | 'content' | 'tags';
    matchedText: string;
    highlighted?: string;
  }[];
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

export interface ImportResult {
  successCount: number;
  failedCount: number;
  errors: {
    index: number;
    message: string;
    data?: unknown;
  }[];
  importedNoteIds: string[];
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
