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
  VisitStats,
  CreateNoteOptions,
  UpdateNoteOptions,
  ExportOptions,
  ImportOptions,
  ImportResult,
  KnowledgeLibraryConfig,
  BackupPackage,
  ImportPreview,
  GraphFilterOptions,
  GraphAnalysis,
  SavedSearchFilter,
  PaginatedSearchResult,
  EnhancedSearchResult
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

    if (note.summary) {
      return note;
    }

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
    create: (options: CreateNoteOptions): { note: Note; fixedLinks: { sourceNoteId: string; sourceNoteTitle: string; fixedLinks: WikiLink[] }[] } => {
      let note = this.noteManager.createNote(options);
      this.tagManager.rebuildIndex(this.noteManager.getAllNotes());
      note = this.parseAndUpdateLinks(note);
      note = this.generateAndUpdateSummary(note);
      this.attachmentManager.rebuildIndex(this.noteManager.getAllNotes());
      this.searchEngine.rebuildIndex(this.noteManager.getAllNotes());
      
      const allNotes = this.noteManager.getAllNotes();
      const fixedLinks = this.linkManager.fixMissingLinksForNewNote(note, allNotes);
      
      this.searchEngine.rebuildIndex(allNotes);
      
      return { note, fixedLinks };
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

    update: (id: string, options: UpdateNoteOptions): { note: Note | undefined; updatedReferences?: { updatedSourceNotes: string[]; updatedContent: { noteId: string; oldContent: string; newContent: string }[] } } => {
      const oldNote = this.noteManager.getNote(id);
      if (!oldNote) return { note: undefined };

      const oldTags = oldNote.tags;
      const oldLinks = oldNote.outLinks;
      const oldTitle = oldNote.title;

      let updatedNote = this.noteManager.updateNote(id, options);
      if (!updatedNote) return { note: undefined };

      if (options.tags !== undefined) {
        this.tagManager.updateNoteTags(updatedNote, oldTags, options.tags);
      }

      let updatedReferences;
      if (options.title !== undefined && options.title !== oldTitle) {
        this.historyManager.updateNoteTitleInHistory(id, options.title);
        const allNotes = this.noteManager.getAllNotes();
        updatedReferences = this.linkManager.updateNoteTitleAndFixReferences(id, oldTitle, options.title, allNotes);
        for (const contentUpdate of updatedReferences.updatedContent) {
          this.noteManager.updateNote(contentUpdate.noteId, { content: contentUpdate.newContent });
        }
      }

      if (options.content !== undefined) {
        updatedNote = this.parseAndUpdateLinks(updatedNote);
        updatedNote = this.generateAndUpdateSummary(updatedNote);
        this.linkManager.updateNoteBackLinks(updatedNote, oldLinks, updatedNote.outLinks, this.noteManager.getAllNotes());
      }

      this.searchEngine.rebuildIndex(this.noteManager.getAllNotes());
      this.attachmentManager.rebuildIndex(this.noteManager.getAllNotes());

      return { note: updatedNote, updatedReferences };
    },

    delete: (id: string): { success: boolean; brokenLinks: { noteId: string; noteTitle: string; brokenLinks: WikiLink[] }[] } => {
      const note = this.noteManager.getNote(id);
      if (!note) return { success: false, brokenLinks: [] };

      const allNotes = this.noteManager.getAllNotes().filter(n => n.id !== id);
      const deletionResult = this.linkManager.handleNoteDeletion(id, note.title, allNotes);

      for (const sourceNote of deletionResult.updatedSourceNotes) {
        const currentNote = this.noteManager.getNote(sourceNote.noteId);
        if (currentNote) {
          this.noteManager.updateNote(sourceNote.noteId, { content: currentNote.content });
        }
      }

      this.tagManager.removeNoteFromAllTags(id);
      this.historyManager.removeFromHistory(id);

      const success = this.noteManager.deleteNote(id);
      if (success) {
        this.rebuildAllIndexes();
      }

      return { success, brokenLinks: deletionResult.updatedSourceNotes };
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

    queryPaginated: (options: SearchOptions): PaginatedSearchResult => {
      const limit = options.limit ?? this.config.searchResultLimit;
      return this.searchEngine.searchWithPagination(
        { ...options, limit },
        this.noteManager.getAllNotes()
      );
    },

    continueSearch: (cursorCacheKey: string): PaginatedSearchResult | null => {
      return this.searchEngine.continueSearch(cursorCacheKey, this.noteManager.getAllNotes());
    },

    queryEnhanced: (options: SearchOptions): EnhancedSearchResult[] => {
      return this.searchEngine.searchEnhanced(options, this.noteManager.getAllNotes());
    },

    saveFilter: (name: string, options: SearchOptions): SavedSearchFilter => {
      return this.searchEngine.saveFilter(name, options);
    },

    getSavedFilters: (): SavedSearchFilter[] => {
      return this.searchEngine.getSavedFilters();
    },

    getSavedFilter: (id: string): SavedSearchFilter | undefined => {
      return this.searchEngine.getSavedFilter(id);
    },

    deleteFilter: (id: string): boolean => {
      return this.searchEngine.deleteFilter(id);
    },

    getPopularFilters: (limit?: number): SavedSearchFilter[] => {
      return this.searchEngine.getPopularFilters(limit);
    },

    queryWithFilter: (filterId: string, overrideOptions?: Partial<SearchOptions>): SearchResult[] | null => {
      return this.searchEngine.searchWithSavedFilter(
        filterId,
        this.noteManager.getAllNotes(),
        overrideOptions
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

    getFilteredGraph: (options: GraphFilterOptions): RelationGraph => {
      return this.graphBuilder.buildFilteredGraph(this.noteManager.getAllNotes(), options);
    },

    analyzeGraph: (graph?: RelationGraph): GraphAnalysis => {
      return this.graphBuilder.analyzeGraph(this.noteManager.getAllNotes(), graph);
    },

    getOrphanNodes: (): Note[] => {
      return this.graphBuilder.getOrphanNodes(this.noteManager.getAllNotes());
    },

    getBrokenLinkNodes: (): { note: Note; brokenLinks: WikiLink[] }[] => {
      return this.graphBuilder.getBrokenLinkNodes(this.noteManager.getAllNotes());
    },

    getCentralNodes: (limit?: number): GraphAnalysis['centralNodes'] => {
      return this.graphBuilder.getCentralNodes(this.noteManager.getAllNotes(), limit);
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

    getMissingLinks: (): { sourceId: string; sourceTitle: string; targetTitle: string }[] => {
      return this.linkManager.resolveMissingLinks(this.noteManager.getAllNotes());
    },

    fixMissingLinks: (noteId: string) => {
      const note = this.noteManager.getNote(noteId);
      if (!note) return [];
      return this.linkManager.fixMissingLinksForNewNote(note, this.noteManager.getAllNotes());
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

    createBackup: (options: { includeAttachments?: boolean; includeHistory?: boolean } = {}): BackupPackage => {
      return this.importExportManager.createBackup(
        this.noteManager.getAllNotes(),
        this.historyManager.toJSON(),
        options
      );
    },

    restoreBackup: (backup: BackupPackage, options: ImportOptions = {}): ImportResult => {
      const existingNotes = this.noteManager.getAllNotes();
      const { result, notesToCreate, notesToUpdate, historyToRestore } = this.importExportManager.restoreBackup(
        backup,
        options,
        existingNotes
      );

      for (const noteOptions of notesToCreate) {
        try {
          const { note } = this.notes.create(noteOptions);
          const idx = result.importedNotes.findIndex(n => n.title === noteOptions.title);
          if (idx >= 0) {
            result.importedNotes[idx] = note;
            result.importedNoteIds[idx] = note.id;
          }
        } catch (e) {
        }
      }

      for (const update of notesToUpdate) {
        try {
          const { note } = this.notes.update(update.id, update.options);
          const idx = result.importedNotes.findIndex(n => n.title === update.options.title);
          if (idx >= 0 && note) {
            result.importedNotes[idx] = note;
            result.importedNoteIds[idx] = note.id;
          }
        } catch (e) {
        }
      }

      if (historyToRestore.length > 0 && options.keepMetadata !== false) {
        this.historyManager.fromJSON(historyToRestore);
      }

      this.rebuildAllIndexes();
      return result;
    },

    previewImportJSON: (jsonString: string, options: ImportOptions = {}): ImportPreview => {
      return this.importExportManager.previewImportJSON(
        jsonString,
        options,
        this.noteManager.getAllNotes()
      );
    },

    previewImportMarkdown: (files: { filename: string; content: string }[], options: ImportOptions = {}): ImportPreview => {
      return this.importExportManager.previewImportMarkdown(
        files,
        options,
        this.noteManager.getAllNotes()
      );
    },

    previewRestoreBackup: (backup: BackupPackage, options: ImportOptions = {}): ImportPreview => {
      return this.importExportManager.previewRestoreBackup(
        backup,
        options,
        this.noteManager.getAllNotes()
      );
    },

    importJSON: (jsonString: string, options: ImportOptions = {}): ImportResult => {
      const existingNotes = this.noteManager.getAllNotes();
      const { result, notesToCreate, notesToUpdate } = this.importExportManager.importFromJSON(
        jsonString,
        options,
        existingNotes
      );

      for (const noteOptions of notesToCreate) {
        try {
          const { note } = this.notes.create(noteOptions);
          const idx = result.importedNotes.findIndex(n => n.title === noteOptions.title);
          if (idx >= 0) {
            result.importedNotes[idx] = note;
            result.importedNoteIds[idx] = note.id;
          }
        } catch (e) {
        }
      }

      for (const update of notesToUpdate) {
        try {
          const { note } = this.notes.update(update.id, update.options);
          const idx = result.importedNotes.findIndex(n => n.title === update.options.title);
          if (idx >= 0 && note) {
            result.importedNotes[idx] = note;
            result.importedNoteIds[idx] = note.id;
          }
        } catch (e) {
        }
      }

      this.rebuildAllIndexes();
      return result;
    },

    importMarkdown: (files: { filename: string; content: string }[], options: ImportOptions = {}): ImportResult => {
      const existingNotes = this.noteManager.getAllNotes();
      const { result, notesToCreate, notesToUpdate } = this.importExportManager.importFromMarkdown(
        files,
        options,
        existingNotes
      );

      for (const noteOptions of notesToCreate) {
        try {
          const { note } = this.notes.create(noteOptions);
          const idx = result.importedNotes.findIndex(n => n.title === noteOptions.title);
          if (idx >= 0) {
            result.importedNotes[idx] = note;
            result.importedNoteIds[idx] = note.id;
          }
        } catch (e) {
        }
      }

      for (const update of notesToUpdate) {
        try {
          const { note } = this.notes.update(update.id, update.options);
          const idx = result.importedNotes.findIndex(n => n.title === update.options.title);
          if (idx >= 0 && note) {
            result.importedNotes[idx] = note;
            result.importedNoteIds[idx] = note.id;
          }
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
      until?: number;
      includeStats?: boolean;
    }): { note: Note; visitCount: number; uniqueVisits?: number; firstVisitAt?: number; lastVisitAt?: number }[] => {
      return this.historyManager.getMostVisited(this.noteManager.getAllNotes(), options);
    },

    getVisitCount: (noteId?: string, since?: number, until?: number): number => {
      return this.historyManager.getVisitCount(noteId, since, until);
    },

    getUniqueVisitCount: (noteId?: string, since?: number, until?: number): number => {
      return this.historyManager.getUniqueVisitCount(noteId, since, until);
    },

    getVisitStats: (noteId: string, options?: { since?: number; until?: number }): VisitStats | null => {
      return this.historyManager.getVisitStats(noteId, this.noteManager.getAllNotes(), options);
    },

    getLastVisit: (noteId: string): RecentVisit | undefined => {
      return this.historyManager.getLastVisit(noteId);
    },

    getFirstVisit: (noteId: string): RecentVisit | undefined => {
      return this.historyManager.getFirstVisit(noteId);
    },

    getAllVisits: (options?: {
      noteId?: string;
      since?: number;
      until?: number;
      limit?: number;
    }): RecentVisit[] => {
      return this.historyManager.getAllVisits(options);
    },

    getTimeline: (options?: {
      startDate?: number;
      endDate?: number;
      groupBy?: 'hour' | 'day' | 'week' | 'month';
      noteId?: string;
    }) => {
      return this.historyManager.getVisitTimeline(options);
    },

    getHeatmap: (options?: {
      startDate?: number;
      endDate?: number;
    }) => {
      return this.historyManager.getVisitHeatmap(options);
    },

    getActiveNotes: (options?: {
      since?: number;
      limit?: number;
    }) => {
      return this.historyManager.getActiveNotes(this.noteManager.getAllNotes(), options);
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
