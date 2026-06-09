import type { Note, SearchOptions, SearchResult } from '../types';
import { escapeRegExp, tokenize, highlightText, calculateSimilarity, levenshteinDistance } from '../utils';

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
      limit = 50,
      offset = 0,
      caseSensitive = false,
      enableHighlight = false
    } = options;

    if (!query.trim()) {
      return [];
    }

    const queryTokens = tokenize(query);
    const results: Map<string, SearchResult> = new Map();

    let filteredNotes = notes;
    if (tagFilters.length > 0) {
      const normalizedFilters = tagFilters.map(t => t.toLowerCase().replace(/^#/, ''));
      filteredNotes = notes.filter(note =>
        normalizedFilters.some(filter =>
          note.tags.some(tag => tag.toLowerCase() === filter)
        )
      );
    }

    for (const note of filteredNotes) {
      const result = this.scoreNote(
        note,
        query,
        queryTokens,
        { searchInTitle, searchInContent, searchInTags, caseSensitive, enableHighlight }
      );

      if (result && result.score > 0) {
        results.set(note.id, result);
      }
    }

    const sortedResults = Array.from(results.values())
      .sort((a, b) => b.score - a.score)
      .slice(offset, offset + limit);

    return sortedResults;
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
    }
  ): SearchResult | null {
    let totalScore = 0;
    const matches: SearchResult['matches'] = [];
    const { searchInTitle, searchInContent, searchInTags, caseSensitive, enableHighlight } = options;

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
        matches.push({
          field: 'title',
          matchedText: titleScore.matchedText,
          highlighted: enableHighlight ? highlightText(note.title, query, caseSensitive) : undefined
        });
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
        matches.push({
          field: 'content',
          matchedText: contentScore.matchedText,
          highlighted: enableHighlight ? highlightText(note.content, query, caseSensitive) : undefined
        });
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
          matches.push({
            field: 'tags',
            matchedText: tag,
            highlighted: enableHighlight ? highlightText(tag, query, caseSensitive) : undefined
          });
        }
      }
    }

    if (totalScore === 0) return null;

    return {
      note,
      score: Math.round(totalScore * 100) / 100,
      matches
    };
  }

  private calculateFieldScore(
    text: string,
    normalizedQuery: string,
    queryTokens: string[],
    weight: number,
    caseSensitive: boolean
  ): { score: number; matchedText: string } {
    const normalizedText = caseSensitive ? text : text.toLowerCase();
    let score = 0;
    let matchedText = '';

    if (normalizedText === normalizedQuery) {
      score = weight * 3;
      matchedText = text;
    } else if (normalizedText.includes(normalizedQuery)) {
      score = weight * 2;
      const regex = new RegExp(escapeRegExp(normalizedQuery), caseSensitive ? 'g' : 'gi');
      const match = text.match(regex);
      matchedText = match ? match[0] : text;
    } else {
      const textTokens = tokenize(text);
      let matchedTokens = 0;

      for (const qt of queryTokens) {
        for (const tt of textTokens) {
          const similarity = calculateSimilarity(qt, tt);
          if (similarity > 0.7) {
            score += weight * similarity * 0.5;
            matchedTokens++;
            if (!matchedText) matchedText = tt;
          } else if (tt.includes(qt) || qt.includes(tt)) {
            score += weight * 0.3;
            matchedTokens++;
            if (!matchedText) matchedText = tt;
          }
        }
      }

      if (matchedTokens > 0) {
        score += (matchedTokens / queryTokens.length) * weight * 0.5;
      }
    }

    return { score, matchedText };
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
