import type { Note, WikiLink, ReferenceInfo } from '../types';

export class LinkManager {
  private backLinks: Map<string, WikiLink[]> = new Map();

  parseLinks(content: string, notes: Note[]): WikiLink[] {
    const links: WikiLink[] = [];
    const linkPattern = /\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g;
    
    let match: RegExpExecArray | null;
    while ((match = linkPattern.exec(content)) !== null) {
      const targetTitle = match[1].trim();
      const anchor = match[2]?.trim();
      const displayText = match[3]?.trim();
      
      const targetNote = notes.find(n => 
        n.title.toLowerCase() === targetTitle.toLowerCase()
      );
      
      links.push({
        targetId: targetNote?.id || '',
        targetTitle,
        anchor,
        displayText,
        position: {
          start: match.index,
          end: match.index + match[0].length
        }
      });
    }
    
    return links;
  }

  rebuildBackLinksIndex(notes: Note[]): void {
    this.backLinks.clear();
    
    for (const sourceNote of notes) {
      for (const link of sourceNote.outLinks) {
        if (link.targetId) {
          if (!this.backLinks.has(link.targetId)) {
            this.backLinks.set(link.targetId, []);
          }
          this.backLinks.get(link.targetId)!.push({
            ...link,
            targetId: sourceNote.id,
            targetTitle: sourceNote.title
          });
        }
      }
    }
  }

  updateNoteBackLinks(sourceNote: Note, oldLinks: WikiLink[], newLinks: WikiLink[], notes: Note[]): void {
    for (const link of oldLinks) {
      if (link.targetId) {
        const backLinks = this.backLinks.get(link.targetId);
        if (backLinks) {
          const filtered = backLinks.filter(bl => bl.targetId !== sourceNote.id);
          if (filtered.length === 0) {
            this.backLinks.delete(link.targetId);
          } else {
            this.backLinks.set(link.targetId, filtered);
          }
        }
      }
    }

    for (const link of newLinks) {
      if (link.targetId) {
        if (!this.backLinks.has(link.targetId)) {
          this.backLinks.set(link.targetId, []);
        }
        this.backLinks.get(link.targetId)!.push({
          ...link,
          targetId: sourceNote.id,
          targetTitle: sourceNote.title
        });
      }
    }
  }

  getBackLinks(noteId: string): WikiLink[] {
    return this.backLinks.get(noteId) || [];
  }

  getBackLinksCount(noteId: string): number {
    return this.getBackLinks(noteId).length;
  }

  getOutLinks(noteId: string, notes: Note[]): WikiLink[] {
    const note = notes.find(n => n.id === noteId);
    return note?.outLinks || [];
  }

  getOutLinksCount(noteId: string, notes: Note[]): number {
    return this.getOutLinks(noteId, notes).length;
  }

  resolveMissingLinks(notes: Note[]): { sourceId: string; targetTitle: string }[] {
    const missing: { sourceId: string; targetTitle: string }[] = [];
    
    for (const note of notes) {
      for (const link of note.outLinks) {
        if (!link.targetId) {
          missing.push({
            sourceId: note.id,
            targetTitle: link.targetTitle
          });
        }
      }
    }
    
    return missing;
  }

  getReferencesTo(noteId: string, notes: Note[]): ReferenceInfo[] {
    const backLinks = this.getBackLinks(noteId);
    const referenceMap = new Map<string, ReferenceInfo>();

    for (const link of backLinks) {
      const sourceNote = notes.find(n => n.id === link.targetId);
      if (!sourceNote) continue;

      if (!referenceMap.has(sourceNote.id)) {
        referenceMap.set(sourceNote.id, {
          noteId: sourceNote.id,
          noteTitle: sourceNote.title,
          linkCount: 0,
          links: []
        });
      }

      const info = referenceMap.get(sourceNote.id)!;
      info.linkCount++;
      info.links.push(link);
    }

    return Array.from(referenceMap.values()).sort((a, b) => b.linkCount - a.linkCount);
  }

  getReferencesFrom(noteId: string, notes: Note[]): ReferenceInfo[] {
    const note = notes.find(n => n.id === noteId);
    if (!note) return [];

    const referenceMap = new Map<string, ReferenceInfo>();

    for (const link of note.outLinks) {
      if (!link.targetId) continue;

      const targetNote = notes.find(n => n.id === link.targetId);
      if (!targetNote) continue;

      if (!referenceMap.has(targetNote.id)) {
        referenceMap.set(targetNote.id, {
          noteId: targetNote.id,
          noteTitle: targetNote.title,
          linkCount: 0,
          links: []
        });
      }

      const info = referenceMap.get(targetNote.id)!;
      info.linkCount++;
      info.links.push(link);
    }

    return Array.from(referenceMap.values()).sort((a, b) => b.linkCount - a.linkCount);
  }

  getOrphanNotes(notes: Note[]): Note[] {
    return notes.filter(note => 
      this.getOutLinksCount(note.id, notes) === 0 && 
      this.getBackLinksCount(note.id) === 0
    );
  }

  getLinkedNotes(notes: Note[]): Note[] {
    return notes.filter(note => 
      this.getOutLinksCount(note.id, notes) > 0 || 
      this.getBackLinksCount(note.id) > 0
    );
  }

  findLinkPath(startId: string, endId: string, notes: Note[], maxDepth: number = 3): string[][] {
    const paths: string[][] = [];
    const visited = new Set<string>();
    const self = this;

    function dfs(currentId: string, path: string[], depth: number): void {
      if (currentId === endId) {
        paths.push([...path]);
        return;
      }

      if (depth >= maxDepth) return;

      visited.add(currentId);
      
      const note = notes.find(n => n.id === currentId);
      if (!note) return;

      for (const link of note.outLinks) {
        if (link.targetId && !visited.has(link.targetId)) {
          dfs(link.targetId, [...path, link.targetId], depth + 1);
        }
      }

      const backLinks = self.getBackLinks(currentId);
      for (const link of backLinks) {
        if (link.targetId && !visited.has(link.targetId)) {
          dfs(link.targetId, [...path, link.targetId], depth + 1);
        }
      }

      visited.delete(currentId);
    }

    dfs(startId, [startId], 0);
    return paths;
  }

  clear(): void {
    this.backLinks.clear();
  }
}
