import type { Note, SimilarNote } from '../types';
import { tokenize, calculateJaccardSimilarity, calculateSimilarity } from '../utils';

export class SimilarityEngine {
  private threshold: number = 0.2;

  setThreshold(threshold: number): void {
    this.threshold = Math.max(0, Math.min(1, threshold));
  }

  findSimilarNotes(
    targetNote: Note,
    allNotes: Note[],
    options: {
      limit?: number;
      includeContentSimilarity?: boolean;
      includeTagSimilarity?: boolean;
      includeLinkSimilarity?: boolean;
      includeTitleSimilarity?: boolean;
    } = {}
  ): SimilarNote[] {
    const {
      limit = 10,
      includeContentSimilarity = true,
      includeTagSimilarity = true,
      includeLinkSimilarity = true,
      includeTitleSimilarity = true
    } = options;

    const similarNotes: SimilarNote[] = [];

    for (const note of allNotes) {
      if (note.id === targetNote.id) continue;

      const { similarity, reasons } = this.calculateSimilarity(
        targetNote,
        note,
        { includeContentSimilarity, includeTagSimilarity, includeLinkSimilarity, includeTitleSimilarity }
      );

      if (similarity >= this.threshold) {
        similarNotes.push({
          note,
          similarity: Math.round(similarity * 100) / 100,
          reasons
        });
      }
    }

    return similarNotes
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  private calculateSimilarity(
    note1: Note,
    note2: Note,
    options: {
      includeContentSimilarity: boolean;
      includeTagSimilarity: boolean;
      includeLinkSimilarity: boolean;
      includeTitleSimilarity: boolean;
    }
  ): { similarity: number; reasons: string[] } {
    let totalWeight = 0;
    let weightedSimilarity = 0;
    const reasons: string[] = [];

    if (options.includeTitleSimilarity) {
      const titleSim = calculateSimilarity(note1.title, note2.title);
      if (titleSim > 0.3) {
        weightedSimilarity += titleSim * 0.3;
        totalWeight += 0.3;
        reasons.push(`标题相似度: ${Math.round(titleSim * 100)}%`);
      }
    }

    if (options.includeContentSimilarity) {
      const contentSim = this.calculateContentSimilarity(note1.content, note2.content);
      if (contentSim > 0.1) {
        weightedSimilarity += contentSim * 0.4;
        totalWeight += 0.4;
        reasons.push(`内容相似度: ${Math.round(contentSim * 100)}%`);
      }
    }

    if (options.includeTagSimilarity) {
      const tagSim = this.calculateTagSimilarity(note1.tags, note2.tags);
      if (tagSim > 0) {
        weightedSimilarity += tagSim * 0.2;
        totalWeight += 0.2;
        const commonTags = note1.tags.filter(t => note2.tags.includes(t));
        reasons.push(`共享标签 (${commonTags.length}个): ${commonTags.join(', ')}`);
      }
    }

    if (options.includeLinkSimilarity) {
      const linkSim = this.calculateLinkSimilarity(note1, note2);
      if (linkSim > 0) {
        weightedSimilarity += linkSim * 0.1;
        totalWeight += 0.1;
        if (note1.outLinks.some(l => l.targetId === note2.id)) {
          reasons.push('存在直接引用关系');
        }
        if (note2.outLinks.some(l => l.targetId === note1.id)) {
          reasons.push('被目标笔记引用');
        }
      }
    }

    const finalSimilarity = totalWeight > 0 ? weightedSimilarity / totalWeight : 0;
    return { similarity: finalSimilarity, reasons };
  }

  private calculateContentSimilarity(content1: string, content2: string): number {
    if (!content1 || !content2) return 0;

    const tokens1 = new Set(tokenize(content1));
    const tokens2 = new Set(tokenize(content2));

    return calculateJaccardSimilarity(tokens1, tokens2);
  }

  private calculateTagSimilarity(tags1: string[], tags2: string[]): number {
    if (tags1.length === 0 && tags2.length === 0) return 1;
    if (tags1.length === 0 || tags2.length === 0) return 0;

    const set1 = new Set(tags1.map(t => t.toLowerCase()));
    const set2 = new Set(tags2.map(t => t.toLowerCase()));

    return calculateJaccardSimilarity(set1, set2);
  }

  private calculateLinkSimilarity(note1: Note, note2: Note): number {
    let score = 0;

    if (note1.outLinks.some(l => l.targetId === note2.id)) {
      score += 0.5;
    }
    if (note2.outLinks.some(l => l.targetId === note1.id)) {
      score += 0.5;
    }

    const note1Targets = new Set(note1.outLinks.map(l => l.targetId).filter(Boolean));
    const note2Targets = new Set(note2.outLinks.map(l => l.targetId).filter(Boolean));
    const commonTargets = [...note1Targets].filter(t => note2Targets.has(t));
    
    if (commonTargets.length > 0) {
      score += Math.min(commonTargets.length * 0.1, 0.3);
    }

    return Math.min(score, 1);
  }

  findDuplicates(allNotes: Note[], threshold: number = 0.8): { note1: Note; note2: Note; similarity: number }[] {
    const duplicates: { note1: Note; note2: Note; similarity: number }[] = [];
    const notes = allNotes.sort((a, b) => a.createdAt - b.createdAt);

    for (let i = 0; i < notes.length; i++) {
      for (let j = i + 1; j < notes.length; j++) {
        const { similarity } = this.calculateSimilarity(notes[i], notes[j], {
          includeContentSimilarity: true,
          includeTagSimilarity: true,
          includeLinkSimilarity: false,
          includeTitleSimilarity: true
        });

        if (similarity >= threshold) {
          duplicates.push({
            note1: notes[i],
            note2: notes[j],
            similarity: Math.round(similarity * 100) / 100
          });
        }
      }
    }

    return duplicates.sort((a, b) => b.similarity - a.similarity);
  }

  getRelatedTags(tags: string[], allNotes: Note[], limit: number = 10): { tag: string; relevance: number }[] {
    if (tags.length === 0) return [];

    const targetTags = new Set(tags.map(t => t.toLowerCase()));
    const relatedTagMap = new Map<string, { count: number; totalNotes: number }>();

    for (const note of allNotes) {
      const noteTags = new Set(note.tags.map(t => t.toLowerCase()));
      const hasTargetTag = [...targetTags].some(t => noteTags.has(t));
      
      if (hasTargetTag) {
        for (const tag of note.tags) {
          const normalized = tag.toLowerCase();
          if (!targetTags.has(normalized)) {
            if (!relatedTagMap.has(normalized)) {
              relatedTagMap.set(normalized, { count: 0, totalNotes: 0 });
            }
            const data = relatedTagMap.get(normalized)!;
            data.count++;
            data.totalNotes += note.tags.length;
          }
        }
      }
    }

    const results: { tag: string; relevance: number }[] = [];
    for (const [tag, data] of relatedTagMap.entries()) {
      results.push({
        tag,
        relevance: data.count / allNotes.filter(n => 
          n.tags.some(t => targetTags.has(t.toLowerCase()))
        ).length
      });
    }

    return results
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit);
  }

  clear(): void {
  }
}
