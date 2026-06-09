import type { Note, Tag } from '../types';
import { normalizeTag, normalizeTags } from '../utils';

export class TagManager {
  private tags: Map<string, Tag> = new Map();

  rebuildIndex(notes: Note[]): void {
    this.tags.clear();
    
    for (const note of notes) {
      for (const tagName of note.tags) {
        const normalized = normalizeTag(tagName);
        if (!this.tags.has(normalized)) {
          this.tags.set(normalized, {
            name: normalized,
            noteIds: [],
            count: 0
          });
        }
        const tag = this.tags.get(normalized)!;
        if (!tag.noteIds.includes(note.id)) {
          tag.noteIds.push(note.id);
          tag.count++;
        }
      }
    }
  }

  updateNoteTags(note: Note, oldTags: string[], newTags: string[]): void {
    const oldNormalized = normalizeTags(oldTags);
    const newNormalized = normalizeTags(newTags);

    for (const tag of oldNormalized) {
      if (!newNormalized.includes(tag)) {
        this.removeNoteFromTag(note.id, tag);
      }
    }

    for (const tag of newNormalized) {
      if (!oldNormalized.includes(tag)) {
        this.addNoteToTag(note.id, tag);
      }
    }
  }

  addNoteToTag(noteId: string, tagName: string): void {
    const normalized = normalizeTag(tagName);
    if (!this.tags.has(normalized)) {
      this.tags.set(normalized, {
        name: normalized,
        noteIds: [],
        count: 0
      });
    }
    
    const tag = this.tags.get(normalized)!;
    if (!tag.noteIds.includes(noteId)) {
      tag.noteIds.push(noteId);
      tag.count++;
    }
  }

  removeNoteFromTag(noteId: string, tagName: string): void {
    const normalized = normalizeTag(tagName);
    const tag = this.tags.get(normalized);
    if (!tag) return;

    const index = tag.noteIds.indexOf(noteId);
    if (index !== -1) {
      tag.noteIds.splice(index, 1);
      tag.count--;
      
      if (tag.count === 0) {
        this.tags.delete(normalized);
      }
    }
  }

  removeNoteFromAllTags(noteId: string): void {
    for (const tag of this.tags.values()) {
      const index = tag.noteIds.indexOf(noteId);
      if (index !== -1) {
        tag.noteIds.splice(index, 1);
        tag.count--;
      }
    }

    for (const [name, tag] of this.tags.entries()) {
      if (tag.count === 0) {
        this.tags.delete(name);
      }
    }
  }

  getTag(tagName: string): Tag | undefined {
    return this.tags.get(normalizeTag(tagName));
  }

  getAllTags(): Tag[] {
    return Array.from(this.tags.values()).sort((a, b) => b.count - a.count);
  }

  getTagNames(): string[] {
    return Array.from(this.tags.keys()).sort();
  }

  getPopularTags(limit: number = 10): Tag[] {
    return this.getAllTags()
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  getRelatedTags(tagName: string, notes: Note[]): Tag[] {
    const normalized = normalizeTag(tagName);
    const tag = this.tags.get(normalized);
    if (!tag) return [];

    const relatedTagMap = new Map<string, number>();
    
    for (const noteId of tag.noteIds) {
      const note = notes.find(n => n.id === noteId);
      if (!note) continue;
      
      for (const otherTag of note.tags) {
        const otherNormalized = normalizeTag(otherTag);
        if (otherNormalized !== normalized) {
          relatedTagMap.set(
            otherNormalized,
            (relatedTagMap.get(otherNormalized) || 0) + 1
          );
        }
      }
    }

    const relatedTags: Tag[] = [];
    for (const [name, count] of relatedTagMap.entries()) {
      const tagData = this.tags.get(name);
      if (tagData) {
        relatedTags.push({
          ...tagData,
          count
        });
      }
    }

    return relatedTags.sort((a, b) => b.count - a.count);
  }

  getTagCloud(): { name: string; count: number; weight: number }[] {
    const tags = this.getAllTags();
    if (tags.length === 0) return [];

    const maxCount = Math.max(...tags.map(t => t.count));
    const minCount = Math.min(...tags.map(t => t.count));

    return tags.map(tag => ({
      name: tag.name,
      count: tag.count,
      weight: maxCount === minCount ? 1 : (tag.count - minCount) / (maxCount - minCount)
    }));
  }

  searchTags(query: string): Tag[] {
    const normalizedQuery = normalizeTag(query);
    return this.getAllTags().filter(tag =>
      tag.name.includes(normalizedQuery)
    );
  }

  getTagCount(): number {
    return this.tags.size;
  }

  clear(): void {
    this.tags.clear();
  }
}
