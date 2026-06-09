import type { Note, SearchOptions, SearchResult, SearchMatch } from '../types';
import { escapeRegExp, tokenize, highlightText, calculateSimilarity } from '../utils';

interface SearchIndex {
  invertedIndex: Map<string, Set<string>>;
  documentFrequency: Map<string, number>;
}

export class SearchEngine {
  private index: SearchIndex = {
    invertedIndex: new Map(),
    documentFrequency: new Map()
  };

  rebuildIndex(notes: Note[]): void {
    this.index.invertedIndex.clear();
    this.index.documentFrequency.clear();

    for (const note of notes) {
      this.indexNote(note);
    }
  }

  private indexNote(note: Note): void {
    const tokens = this.extractTokens(note);
    const uniqueTokens = new Set(tokens);

    for (const token of uniqueTokens) {
      if (!this.index.invertedIndex.has(token)) {
        this.index.invertedIndex.set(token, new Set());
      }
      this.index.invertedIndex.get(token)!.add(note.id);

      const df = this.index.documentFrequency.get(token) || 0;
      this.index.documentFrequency.set(token, df + 1);
    }
  }

  private extractTokens(note: Note): string[] {
    const titleTokens = tokenize(note.title);
    const contentTokens = tokenize(note.content);
    const tagTokens = note.tags.flatMap(tag => tokenize(tag));
    return [...titleTokens, ...contentTokens, ...tagTokens];
  }

  search(options: SearchOptions, notes: Note[]): SearchResult[] {
    const {
      query,
      searchInTitle = true,
      searchInContent = true,
      searchInTags = true,
      tagFilters = [],
      tagFilterMode = 'any',
      isFavorite,
      hasAttachments,
      attachmentTypes = [],
      dateFrom,
      dateTo,
      dateField = 'updatedAt',
      sortBy = 'score',
      sortOrder = 'desc',
      limit = 50,
      offset = 0,
      caseSensitive = false,
      enableHighlight = false,
      enableSnippet = true,
      snippetLength = 150
    } = options;

    if (!query.trim() && tagFilters.length === 0 && isFavorite === undefined && 
        hasAttachments === undefined && attachmentTypes.length === 0 && 
        dateFrom === undefined && dateTo === undefined) {
      return [];
    }

    const queryTokens = tokenize(query);
    const results: Map<string, SearchResult> = new Map();

    let filteredNotes = this.applyFilters(notes, {
      tagFilters,
      tagFilterMode,
      isFavorite,
      hasAttachments,
      attachmentTypes,
      dateFrom,
      dateTo,
      dateField
    });

    for (const note of filteredNotes) {
      const result = this.scoreNote(
        note,
        query,
        queryTokens,
        { searchInTitle, searchInContent, searchInTags, caseSensitive, enableHighlight, enableSnippet, snippetLength }
      );

      if (result) {
        if (query.trim() && result.score > 0) {
          results.set(note.id, result);
        } else if (!query.trim()) {
          results.set(note.id, result);
        }
      }
    }

    let sortedResults = Array.from(results.values());
    
    sortedResults = this.applySorting(sortedResults, sortBy, sortOrder);
    sortedResults = sortedResults.slice(offset, offset + limit);

    return sortedResults;
  }

  private applyFilters(
    notes: Note[],
    filters: {
      tagFilters: string[];
      tagFilterMode: 'any' | 'all';
      isFavorite?: boolean;
      hasAttachments?: boolean;
      attachmentTypes: string[];
      dateFrom?: number;
      dateTo?: number;
      dateField: 'createdAt' | 'updatedAt' | 'lastVisitedAt';
    }
  ): Note[] {
    let filtered = [...notes];
    const { tagFilters, tagFilterMode, isFavorite, hasAttachments, attachmentTypes, dateFrom, dateTo, dateField } = filters;

    if (tagFilters.length > 0) {
      const normalizedFilters = tagFilters.map(t => t.toLowerCase().replace(/^#/, ''));
      filtered = filtered.filter(note => {
        const noteTags = note.tags.map(t => t.toLowerCase());
        if (tagFilterMode === 'all') {
          return normalizedFilters.every(filter => noteTags.includes(filter));
        } else {
          return normalizedFilters.some(filter => noteTags.includes(filter));
        }
      });
    }

    if (isFavorite !== undefined) {
      filtered = filtered.filter(note => note.isFavorite === isFavorite);
    }

    if (hasAttachments !== undefined) {
      filtered = filtered.filter(note => hasAttachments ? note.attachments.length > 0 : note.attachments.length === 0);
    }

    if (attachmentTypes.length > 0) {
      const normalizedTypes = attachmentTypes.map(t => t.toLowerCase());
      filtered = filtered.filter(note =>
        note.attachments.some(att =>
          normalizedTypes.includes(att.type.toLowerCase()) ||
          normalizedTypes.includes(att.name.split('.').pop()?.toLowerCase() || '')
        )
      );
    }

    if (dateFrom !== undefined || dateTo !== undefined) {
      filtered = filtered.filter(note => {
        const dateValue = note[dateField];
        if (dateValue === undefined) return false;
        if (dateFrom !== undefined && dateValue < dateFrom) return false;
        if (dateTo !== undefined && dateValue > dateTo) return false;
        return true;
      });
    }

    return filtered;
  }

  private applySorting(
    results: SearchResult[],
    sortBy: 'score' | 'createdAt' | 'updatedAt' | 'title',
    sortOrder: 'asc' | 'desc'
  ): SearchResult[] {
    const multiplier = sortOrder === 'asc' ? 1 : -1;

    return results.sort((a, b) => {
      switch (sortBy) {
        case 'score':
          return (a.score - b.score) * multiplier;
        case 'createdAt':
          return (a.note.createdAt - b.note.createdAt) * multiplier;
        case 'updatedAt':
          return (a.note.updatedAt - b.note.updatedAt) * multiplier;
        case 'title':
          return a.note.title.localeCompare(b.note.title) * multiplier;
        default:
          return (a.score - b.score) * multiplier;
      }
    });
  }

  private scoreNote(
    note: Note,
    query: string,
    queryTokens: string[],
    options: {
      searchInTitle: boolean;
      searchInContent: boolean;
      searchInTags: boolean;
      caseSensitive: boolean;
      enableHighlight: boolean;
      enableSnippet: boolean;
      snippetLength: number;
    }
  ): SearchResult | null {
    let totalScore = 0;
    const matches: SearchMatch[] = [];
    const { searchInTitle, searchInContent, searchInTags, caseSensitive, enableHighlight, enableSnippet, snippetLength } = options;

    const normalizedQuery = caseSensitive ? query : query.toLowerCase();

    if (searchInTitle) {
      const titleScore = this.calculateFieldScore(
        note.title,
        normalizedQuery,
        queryTokens,
        3.0,
        caseSensitive
      );
      if (titleScore.score > 0) {
        totalScore += titleScore.score;
        const match: SearchMatch = {
          field: 'title',
          matchedText: titleScore.matchedText,
          position: titleScore.position
        };
        if (enableHighlight) {
          match.highlighted = highlightText(note.title, query, caseSensitive);
        }
        if (enableSnippet) {
          match.snippet = this.extractSnippet(note.title, titleScore.position, snippetLength);
        }
        matches.push(match);
      }
    }

    if (searchInContent) {
      const contentScore = this.calculateFieldScore(
        note.content,
        normalizedQuery,
        queryTokens,
        1.0,
        caseSensitive
      );
      if (contentScore.score > 0) {
        totalScore += contentScore.score;
        const match: SearchMatch = {
          field: 'content',
          matchedText: contentScore.matchedText,
          position: contentScore.position
        };
        if (enableHighlight) {
          match.highlighted = highlightText(note.content, query, caseSensitive);
        }
        if (enableSnippet) {
          match.snippet = this.extractSnippet(note.content, contentScore.position, snippetLength);
        }
        matches.push(match);
      }
    }

    if (searchInTags) {
      for (const tag of note.tags) {
        const tagScore = this.calculateFieldScore(
          tag,
          normalizedQuery,
          queryTokens,
          2.0,
          caseSensitive
        );
        if (tagScore.score > 0) {
          totalScore += tagScore.score;
          const match: SearchMatch = {
            field: 'tags',
            matchedText: tag,
            position: tagScore.position
          };
          if (enableHighlight) {
            match.highlighted = highlightText(tag, query, caseSensitive);
          }
          matches.push(match);
        }
      }
    }

    if (totalScore === 0 && query.trim()) return null;

    const bestSnippet = this.getBestSnippet(matches, note, snippetLength);

    return {
      note,
      score: Math.round(totalScore * 100) / 100,
      matches,
      bestSnippet
    };
  }

  private calculateFieldScore(
    text: string,
    normalizedQuery: string,
    queryTokens: string[],
    weight: number,
    caseSensitive: boolean
  ): { score: number; matchedText: string; position: number } {
    const normalizedText = caseSensitive ? text : text.toLowerCase();
    let score = 0;
    let matchedText = '';
    let position = -1;

    if (normalizedText === normalizedQuery) {
      score = weight * 3;
      matchedText = text;
      position = 0;
    } else if (normalizedQuery && normalizedText.includes(normalizedQuery)) {
      score = weight * 2;
      position = normalizedText.indexOf(normalizedQuery);
      const regex = new RegExp(escapeRegExp(normalizedQuery), caseSensitive ? 'g' : 'gi');
      const match = text.match(regex);
      matchedText = match ? match[0] : text.substring(position, position + normalizedQuery.length);
    } else if (normalizedQuery) {
      const textTokens = tokenize(text);
      let matchedTokens = 0;

      for (const qt of queryTokens) {
        for (let i = 0; i < textTokens.length; i++) {
          const tt = textTokens[i];
          const similarity = calculateSimilarity(qt, tt);
          if (similarity > 0.7) {
            score += weight * similarity * 0.5;
            matchedTokens++;
            if (!matchedText) {
              matchedText = tt;
              position = normalizedText.indexOf(tt.toLowerCase());
            }
          } else if (tt.includes(qt) || qt.includes(tt)) {
            score += weight * 0.3;
            matchedTokens++;
            if (!matchedText) {
              matchedText = tt;
              position = normalizedText.indexOf(tt.toLowerCase());
            }
          }
        }
      }

      if (matchedTokens > 0) {
        score += (matchedTokens / queryTokens.length) * weight * 0.5;
      }
    }

    return { score, matchedText, position };
  }

  private extractSnippet(text: string, position: number, maxLength: number): string {
    if (position < 0) {
      return text.substring(0, maxLength) + (text.length > maxLength ? '...' : '');
    }

    const halfLength = Math.floor(maxLength / 2);
    let start = Math.max(0, position - halfLength);
    let end = Math.min(text.length, position + halfLength);

    if (end - start < maxLength) {
      if (start === 0) {
        end = Math.min(text.length, maxLength);
      } else if (end === text.length) {
        start = Math.max(0, text.length - maxLength);
      }
    }

    let snippet = text.substring(start, end);
    
    if (start > 0) {
      snippet = '...' + snippet;
    }
    if (end < text.length) {
      snippet = snippet + '...';
    }

    return snippet;
  }

  private getBestSnippet(matches: SearchMatch[], note: Note, maxLength: number): string | undefined {
    const contentMatch = matches.find(m => m.field === 'content' && m.snippet);
    if (contentMatch?.snippet) {
      return contentMatch.snippet;
    }

    const titleMatch = matches.find(m => m.field === 'title' && m.snippet);
    if (titleMatch?.snippet) {
      return titleMatch.snippet;
    }

    if (note.summary) {
      return note.summary.substring(0, maxLength) + (note.summary.length > maxLength ? '...' : '');
    }

    if (matches.length > 0) {
      return matches[0].snippet;
    }

    return undefined;
  }

  autocomplete(query: string, notes: Note[], limit: number = 10): string[] {
    if (!query.trim()) return [];

    const normalizedQuery = query.toLowerCase();
    const suggestions = new Set<string>();

    for (const note of notes) {
      if (note.title.toLowerCase().startsWith(normalizedQuery)) {
        suggestions.add(note.title);
      }

      for (const tag of note.tags) {
        if (tag.toLowerCase().startsWith(normalizedQuery)) {
          suggestions.add('#' + tag);
        }
      }
    }

    for (const token of this.index.invertedIndex.keys()) {
      if (token.startsWith(normalizedQuery)) {
        suggestions.add(token);
      }
    }

    return Array.from(suggestions).slice(0, limit);
  }

  getSearchStats() {
    return {
      indexedTerms: this.index.invertedIndex.size,
      averageDocumentFrequency: this.index.documentFrequency.size > 0
        ? Array.from(this.index.documentFrequency.values()).reduce((a, b) => a + b, 0) / this.index.documentFrequency.size
        : 0
    };
  }

  clear(): void {
    this.index.invertedIndex.clear();
    this.index.documentFrequency.clear();
  }
}
