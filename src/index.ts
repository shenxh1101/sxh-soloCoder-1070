import type {
  Note,
  Tag,
  Attachment,
  WikiLink,
  SearchOptions,
  SearchResult,
  SimilarNote,
  RelationGraph,
  ReferenceInfo,
  RecentVisit,
  CreateNoteOptions,
  UpdateNoteOptions,
  ExportOptions,
  ImportResult,
  KnowledgeLibraryConfig
} from './types';

import { NoteManager } from './modules/NoteManager';
import { TagManager } from './modules/TagManager';
import { LinkManager } from './modules/LinkManager';
import { SearchEngine } from './modules/SearchEngine';
import { SimilarityEngine } from './modules/SimilarityEngine';
import { RelationGraphBuilder } from './modules/RelationGraphBuilder';
import { SummaryExtractor } from './modules/SummaryExtractor';
import { AttachmentManager } from './modules/AttachmentManager';
import { HistoryManager } from './modules/HistoryManager';
import { ImportExportManager } from './modules/ImportExportManager';

export class KnowledgeLibrary {
  private config: KnowledgeLibraryConfig;
  private noteManager: NoteManager;
  private tagManager: TagManager;
  private linkManager: LinkManager;
  private searchEngine: SearchEngine;
  private similarityEngine: SimilarityEngine;
  private graphBuilder: RelationGraphBuilder;
  private summaryExtractor: SummaryExtractor;
  private attachmentManager: AttachmentManager;
  private historyManager: HistoryManager;
  private importExportManager: ImportExportManager;

  constructor(config: KnowledgeLibraryConfig = {}) {
    this.config = {
      autoParseLinks: true,
      autoGenerateSummary: true,
      summaryMaxLength: 200,
      searchResultLimit: 50,
      maxRecentVisits: 50,
      similarityThreshold: 0.2,
      enableFuzzySearch: true,
      ...config
    };

    this.noteManager = new NoteManager();
    this.tagManager = new TagManager();
    this.linkManager = new LinkManager();
    this.searchEngine = new SearchEngine();
    this.similarityEngine = new SimilarityEngine();
    this.graphBuilder = new RelationGraphBuilder();
    this.summaryExtractor = new SummaryExtractor();
    this.attachmentManager = new AttachmentManager();
    this.historyManager = new HistoryManager();
    this.importExportManager = new ImportExportManager();

    this.configureManagers();
  }

  private configureManagers(): void {
    if (this.config.summaryMaxLength) {
      this.summaryExtractor.setMaxLength(this.config.summaryMaxLength);
    }
    if (this.config.maxRecentVisits) {
      this.historyManager.setMaxRecentVisits(this.config.maxRecentVisits);
    }
    if (this.config.similarityThreshold) {
      this.similarityEngine.setThreshold(this.config.similarityThreshold);
    }
  }

  private rebuildAllIndexes(): void {
    const notes = this.noteManager.getAllNotes();
    this.tagManager.rebuildIndex(notes);
    this.linkManager.rebuildBackLinksIndex(notes);
    this.searchEngine.rebuildIndex(notes);
    this.attachmentManager.rebuildIndex(notes);
  }

  private parseAndUpdateLinks(note: Note): Note {
    if (!this.config.autoParseLinks) return note;

    const allNotes = this.noteManager.getAllNotes();
    const oldLinks = note.outLinks;
    const newLinks = this.linkManager.parseLinks(note.content, allNotes);
    
    const updatedNote = this.noteManager.updateNoteLinks(note.id, newLinks);
    if (updatedNote) {
      this.linkManager.updateNoteBackLinks(note, oldLinks, newLinks, allNotes);
      return updatedNote;
    }
    
    return note;
  }

  private generateAndUpdateSummary(note: Note): Note {
    if (!this.config.autoGenerateSummary) return note;

    const summary = this.summaryExtractor.extractSummary(note.content, {
      maxLength: this.config.summaryMaxLength
    });

    if (summary && summary !== note.summary) {
      const updatedNote = this.noteManager.updateNoteSummary(note.id, summary);
      if (updatedNote) {
        return updatedNote;
      }
    }
    
    return note;
  }

  notes = {
    create: (options: CreateNoteOptions): Note => {
      let note = this.noteManager.createNote(options);
      this.tagManager.rebuildIndex(this.noteManager.getAllNotes());
      note = this.parseAndUpdateLinks(note);
      note = this.generateAndUpdateSummary(note);
      this.attachmentManager.rebuildIndex(this.noteManager.getAllNotes());
      this.searchEngine.rebuildIndex(this.noteManager.getAllNotes());
      return note;
    },

    get: (id: string): Note | undefined => {
      const note = this.noteManager.getNote(id);
      if (note) {
        this.noteManager.updateLastVisited(id);
        this.historyManager.recordVisit(note);
      }
      return note;
    },

    getByTitle: (title: string): Note | undefined => {
      const note = this.noteManager.getNoteByTitle(title);
      if (note) {
        this.noteManager.updateLastVisited(note.id);
        this.historyManager.recordVisit(note);
      }
      return note;
    },

    getAll: (): Note[] => {
      return this.noteManager.getAllNotes();
    },

    update: (id: string, options: UpdateNoteOptions): Note | undefined => {
      const oldNote = this.noteManager.getNote(id);
      if (!oldNote) return undefined;

      const oldTags = oldNote.tags;
      const oldLinks = oldNote.outLinks;

      let updatedNote = this.noteManager.updateNote(id, options);
      if (!updatedNote) return undefined;

      if (options.tags !== undefined) {
        this.tagManager.updateNoteTags(updatedNote, oldTags, options.tags);
      }

      if (options.title !== undefined) {
        this.historyManager.updateNoteTitleInHistory(id, options.title);
        const allNotes = this.noteManager.getAllNotes();
        this.linkManager.rebuildBackLinksIndex(allNotes);
      }

      if (options.content !== undefined) {
        updatedNote = this.parseAndUpdateLinks(updatedNote);
        updatedNote = this.generateAndUpdateSummary(updatedNote);
        this.linkManager.updateNoteBackLinks(updatedNote, oldLinks, updatedNote.outLinks, this.noteManager.getAllNotes());
      }

      this.searchEngine.rebuildIndex(this.noteManager.getAllNotes());
      this.attachmentManager.rebuildIndex(this.noteManager.getAllNotes());

      return updatedNote;
    },

    delete: (id: string): boolean => {
      const note = this.noteManager.getNote(id);
      if (!note) return false;

      this.tagManager.removeNoteFromAllTags(id);
      this.historyManager.removeFromHistory(id);

      const success = this.noteManager.deleteNote(id);
      if (success) {
        this.rebuildAllIndexes();
      }
      return success;
    },

    toggleFavorite: (id: string): Note | undefined => {
      return this.noteManager.toggleFavorite(id);
    },

    getFavorites: (): Note[] => {
      return this.noteManager.getFavoriteNotes();
    },

    getRecentlyUpdated: (limit?: number): Note[] => {
      return this.noteManager.getRecentlyUpdated(limit);
    },

    getRecentlyCreated: (limit?: number): Note[] => {
      return this.noteManager.getRecentlyCreated(limit);
    },

    getByTag: (tag: string): Note[] => {
      return this.noteManager.getNotesByTag(tag);
    },

    getCount: (): number => {
      return this.noteManager.getNoteCount();
    },

    addAttachment: (noteId: string, attachment: Omit<Attachment, 'id' | 'noteId' | 'createdAt'>): Attachment | undefined => {
      const att = this.noteManager.addAttachment(noteId, attachment);
      if (att) {
        this.attachmentManager.addAttachment(att);
      }
      return att;
    },

    removeAttachment: (noteId: string, attachmentId: string): boolean => {
      const success = this.noteManager.removeAttachment(noteId, attachmentId);
      if (success) {
        this.attachmentManager.removeAttachment(attachmentId);
      }
      return success;
    }
  };

  tags = {
    getAll: (): Tag[] => {
      return this.tagManager.getAllTags();
    },

    get: (name: string): Tag | undefined => {
      return this.tagManager.getTag(name);
    },

    getNames: (): string[] => {
      return this.tagManager.getTagNames();
    },

    getPopular: (limit?: number): Tag[] => {
      return this.tagManager.getPopularTags(limit);
    },

    getRelated: (tagName: string): Tag[] => {
      return this.tagManager.getRelatedTags(tagName, this.noteManager.getAllNotes());
    },

    getCloud: (): { name: string; count: number; weight: number }[] => {
      return this.tagManager.getTagCloud();
    },

    search: (query: string): Tag[] => {
      return this.tagManager.searchTags(query);
    },

    getCount: (): number => {
      return this.tagManager.getTagCount();
    }
  };

  search = {
    query: (options: SearchOptions): SearchResult[] => {
      const limit = options.limit ?? this.config.searchResultLimit;
      return this.searchEngine.search(
        { ...options, limit },
        this.noteManager.getAllNotes()
      );
    },

    autocomplete: (query: string, limit?: number): string[] => {
      return this.searchEngine.autocomplete(query, this.noteManager.getAllNotes(), limit);
    },

    getStats: () => {
      return this.searchEngine.getSearchStats();
    }
  };

  relations = {
    getBackLinks: (noteId: string): WikiLink[] => {
      return this.linkManager.getBackLinks(noteId);
    },

    getOutLinks: (noteId: string): WikiLink[] => {
      return this.linkManager.getOutLinks(noteId, this.noteManager.getAllNotes());
    },

    getReferencesTo: (noteId: string): ReferenceInfo[] => {
      return this.linkManager.getReferencesTo(noteId, this.noteManager.getAllNotes());
    },

    getReferencesFrom: (noteId: string): ReferenceInfo[] => {
      return this.linkManager.getReferencesFrom(noteId, this.noteManager.getAllNotes());
    },

    getGraph: (options?: {
      includeTags?: boolean;
      maxNotes?: number;
      minLinkCount?: number;
    }): RelationGraph => {
      return this.graphBuilder.buildGraph(this.noteManager.getAllNotes(), options);
    },

    getSubgraph: (centerNoteId: string, options?: {
      depth?: number;
      includeBackLinks?: boolean;
      includeTags?: boolean;
    }): RelationGraph => {
      return this.graphBuilder.buildSubgraph(centerNoteId, this.noteManager.getAllNotes(), options);
    },

    getReferenceTree: (noteId: string) => {
      const referencesTo = this.linkManager.getReferencesTo(noteId, this.noteManager.getAllNotes());
      const referencesFrom = this.linkManager.getReferencesFrom(noteId, this.noteManager.getAllNotes());
      return this.graphBuilder.getReferenceTree(noteId, this.noteManager.getAllNotes(), referencesTo, referencesFrom);
    },

    findPath: (startId: string, endId: string, maxDepth?: number): string[][] => {
      return this.linkManager.findLinkPath(startId, endId, this.noteManager.getAllNotes(), maxDepth);
    },

    getOrphanNotes: (): Note[] => {
      return this.linkManager.getOrphanNotes(this.noteManager.getAllNotes());
    },

    getLinkedNotes: (): Note[] => {
      return this.linkManager.getLinkedNotes(this.noteManager.getAllNotes());
    },

    getMissingLinks: (): { sourceId: string; targetTitle: string }[] => {
      return this.linkManager.resolveMissingLinks(this.noteManager.getAllNotes());
    },

    getSimilar: (noteId: string, options?: {
      limit?: number;
      includeContentSimilarity?: boolean;
      includeTagSimilarity?: boolean;
      includeLinkSimilarity?: boolean;
      includeTitleSimilarity?: boolean;
    }): SimilarNote[] => {
      const note = this.noteManager.getNote(noteId);
      if (!note) return [];
      return this.similarityEngine.findSimilarNotes(note, this.noteManager.getAllNotes(), options);
    },

    findDuplicates: (threshold?: number) => {
      return this.similarityEngine.findDuplicates(this.noteManager.getAllNotes(), threshold);
    }
  };

  io = {
    export: (options: ExportOptions): string | { filename: string; content: string }[] => {
      if (options.format === 'markdown') {
        return this.importExportManager.exportToMarkdown(this.noteManager.getAllNotes(), options);
      }
      return this.importExportManager.exportToJSON(this.noteManager.getAllNotes(), options);
    },

    importJSON: (jsonString: string): ImportResult => {
      const result = this.importExportManager.importFromJSON(jsonString);
      
      for (const noteId of result.importedNoteIds) {
        const noteData = JSON.parse(jsonString);
        const notesArray = Array.isArray(noteData) ? noteData : (noteData.notes || []);
        const note = notesArray.find((n: any) => n.id === noteId);
        if (note) {
          try {
            this.noteManager.createNote({
              title: note.title,
              content: note.content || '',
              tags: note.tags || [],
              isFavorite: note.isFavorite || false,
              metadata: note.metadata || {}
            });
          } catch (e) {
          }
        }
      }
      
      this.rebuildAllIndexes();
      return result;
    },

    importMarkdown: (files: { filename: string; content: string }[]): ImportResult => {
      const result = this.importExportManager.importFromMarkdown(files);
      
      for (let i = 0; i < result.importedNoteIds.length; i++) {
        try {
          const note = this.importExportManager['parseMarkdownNote'](files[i].filename, files[i].content);
          this.noteManager.createNote({
            title: note.title,
            content: note.content,
            tags: note.tags,
            isFavorite: note.isFavorite,
            metadata: note.metadata
          });
        } catch (e) {
        }
      }
      
      this.rebuildAllIndexes();
      return result;
    }
  };

  history = {
    getRecent: (limit?: number): RecentVisit[] => {
      return this.historyManager.getRecentVisits(limit);
    },

    getRecentNotes: (limit?: number): Note[] => {
      return this.historyManager.getRecentNotes(this.noteManager.getAllNotes(), limit);
    },

    getMostVisited: (options?: {
      limit?: number;
      since?: number;
    }): { note: Note; visitCount: number }[] => {
      return this.historyManager.getMostVisited(this.noteManager.getAllNotes(), options);
    },

    getVisitCount: (noteId: string, since?: number): number => {
      return this.historyManager.getVisitCount(noteId, since);
    },

    getLastVisit: (noteId: string): RecentVisit | undefined => {
      return this.historyManager.getLastVisit(noteId);
    },

    getTimeline: (options?: {
      startDate?: number;
      endDate?: number;
      groupBy?: 'hour' | 'day' | 'week' | 'month';
    }) => {
      return this.historyManager.getVisitTimeline(options);
    },

    clear: (): void => {
      this.historyManager.clearHistory();
    }
  };

  attachments = {
    getAll: (): Attachment[] => {
      return this.attachmentManager.getAllAttachments();
    },

    getByNote: (noteId: string): Attachment[] => {
      return this.attachmentManager.getAttachmentsByNote(noteId);
    },

    getByType: (type: string): Attachment[] => {
      return this.attachmentManager.getAttachmentsByType(type);
    },

    search: (query: string, options?: {
      searchInName?: boolean;
      searchInPath?: boolean;
      typeFilter?: string;
      noteIdFilter?: string;
    }): Attachment[] => {
      return this.attachmentManager.searchAttachments(query, options);
    },

    getTypes: (): { type: string; count: number; totalSize: number }[] => {
      return this.attachmentManager.getAttachmentTypes();
    },

    getTotalCount: (): number => {
      return this.attachmentManager.getTotalAttachmentCount();
    },

    getTotalSize: (): number => {
      return this.attachmentManager.getTotalAttachmentSize();
    },

    getLargest: (limit?: number): Attachment[] => {
      return this.attachmentManager.getLargestAttachments(limit);
    },

    getRecent: (limit?: number): Attachment[] => {
      return this.attachmentManager.getRecentAttachments(limit);
    }
  };

  summary = {
    extract: (markdown: string, options?: {
      maxLength?: number;
      preferFirstParagraph?: boolean;
      includeHeadings?: boolean;
      removeMarkdown?: boolean;
    }): string => {
      return this.summaryExtractor.extractSummary(markdown, options);
    },

    generateTags: (markdown: string, maxTags?: number): string[] => {
      return this.summaryExtractor.generateTagsFromContent(markdown, maxTags);
    },

    getKeywords: (markdown: string, maxKeywords?: number): { keyword: string; frequency: number }[] => {
      return this.summaryExtractor.extractKeywords(markdown, maxKeywords);
    },

    getReadingTime: (markdown: string): { minutes: number; words: number } => {
      return this.summaryExtractor.getReadingTime(markdown);
    }
  };

  toJSON(): { notes: Note[]; history: RecentVisit[]; version: string } {
    return {
      version: '1.0.0',
      notes: this.noteManager.toJSON(),
      history: this.historyManager.toJSON()
    };
  }

  fromJSON(data: { notes: Note[]; history?: RecentVisit[] }): void {
    this.noteManager.fromJSON(data.notes);
    if (data.history) {
      this.historyManager.fromJSON(data.history);
    }
    this.rebuildAllIndexes();
  }

  clear(): void {
    this.noteManager.clear();
    this.tagManager.clear();
    this.linkManager.clear();
    this.searchEngine.clear();
    this.similarityEngine.clear();
    this.graphBuilder.clear();
    this.summaryExtractor.clear();
    this.attachmentManager.clear();
    this.historyManager.clear();
    this.importExportManager.clear();
  }

  getConfig(): KnowledgeLibraryConfig {
    return { ...this.config };
  }
}

export * from './types';

export {
  NoteManager,
  TagManager,
  LinkManager,
  SearchEngine,
  SimilarityEngine,
  RelationGraphBuilder,
  SummaryExtractor,
  AttachmentManager,
  HistoryManager,
  ImportExportManager
};
