import type { Note, WikiLink, ReferenceInfo } from '../types';

export class LinkManager {
  private backLinks: Map<string, WikiLink[]> = new Map();
  private forwardLinks: Map<string, WikiLink[]> = new Map();

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
    this.forwardLinks.clear();
    
    for (const sourceNote of notes) {
      this.forwardLinks.set(sourceNote.id, [...sourceNote.outLinks]);
      
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

    this.forwardLinks.set(sourceNote.id, [...newLinks]);

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

  fixMissingLinksForNewNote(newNote: Note, notes: Note[]): { sourceNoteId: string; sourceNoteTitle: string; fixedLinks: WikiLink[] }[] {
    const fixes: { sourceNoteId: string; sourceNoteTitle: string; fixedLinks: WikiLink[] }[] = [];
    const newNoteTitle = newNote.title.toLowerCase();

    for (const sourceNote of notes) {
      if (sourceNote.id === newNote.id) continue;

      const linksToFix: WikiLink[] = [];
      const updatedLinks: WikiLink[] = [];

      for (const link of sourceNote.outLinks) {
        if (!link.targetId && link.targetTitle.toLowerCase() === newNoteTitle) {
          const fixedLink: WikiLink = {
            ...link,
            targetId: newNote.id
          };
          linksToFix.push(fixedLink);
          updatedLinks.push(fixedLink);
        } else {
          updatedLinks.push(link);
        }
      }

      if (linksToFix.length > 0) {
        sourceNote.outLinks = updatedLinks;
        this.forwardLinks.set(sourceNote.id, updatedLinks);

        for (const link of linksToFix) {
          if (!this.backLinks.has(newNote.id)) {
            this.backLinks.set(newNote.id, []);
          }
          this.backLinks.get(newNote.id)!.push({
            ...link,
            targetId: sourceNote.id,
            targetTitle: sourceNote.title
          });
        }

        fixes.push({
          sourceNoteId: sourceNote.id,
          sourceNoteTitle: sourceNote.title,
          fixedLinks: linksToFix
        });
      }
    }

    return fixes;
  }

  updateNoteTitleAndFixReferences(noteId: string, oldTitle: string, newTitle: string, notes: Note[]): {
    updatedSourceNotes: string[];
    updatedContent: { noteId: string; oldContent: string; newContent: string }[];
  } {
    const result = {
      updatedSourceNotes: [] as string[],
      updatedContent: [] as { noteId: string; oldContent: string; newContent: string }[]
    };

    const normalizedOldTitle = oldTitle.toLowerCase();

    for (const sourceNote of notes) {
      if (sourceNote.id === noteId) continue;

      let contentChanged = false;
      const oldContent = sourceNote.content;
      let newContent = oldContent;

      const linkPattern = new RegExp(`\\[\\[${escapeRegExp(oldTitle)}(#[^\\]|]+)?(\\|[^\\]]+)?\\]\\]`, 'gi');
      newContent = newContent.replace(linkPattern, (match, anchor, displayText) => {
        contentChanged = true;
        let replacement = `[[${newTitle}`;
        if (anchor) replacement += anchor;
        if (displayText) replacement += displayText;
        replacement += ']]';
        return replacement;
      });

      if (contentChanged) {
        result.updatedSourceNotes.push(sourceNote.id);
        result.updatedContent.push({
          noteId: sourceNote.id,
          oldContent,
          newContent
        });

        const updatedLinks = this.parseLinks(newContent, notes);
        sourceNote.content = newContent;
        sourceNote.outLinks = updatedLinks;
        this.forwardLinks.set(sourceNote.id, updatedLinks);
      }
    }

    this.rebuildBackLinksIndex(notes);

    return result;
  }

  handleNoteDeletion(deletedNoteId: string, deletedNoteTitle: string, notes: Note[]): {
    updatedSourceNotes: { noteId: string; noteTitle: string; brokenLinks: WikiLink[] }[];
  } {
    const result: {
      updatedSourceNotes: { noteId: string; noteTitle: string; brokenLinks: WikiLink[] }[];
    } = {
      updatedSourceNotes: []
    };

    const backLinks = this.getBackLinks(deletedNoteId);
    
    for (const link of backLinks) {
      const sourceNote = notes.find(n => n.id === link.targetId);
      if (!sourceNote) continue;

      const brokenLinks: WikiLink[] = [];
      const updatedLinks: WikiLink[] = [];

      for (const sl of sourceNote.outLinks) {
        if (sl.targetId === deletedNoteId) {
          brokenLinks.push({ ...sl, targetId: '' });
          updatedLinks.push({ ...sl, targetId: '' });
        } else {
          updatedLinks.push(sl);
        }
      }

      if (brokenLinks.length > 0) {
        sourceNote.outLinks = updatedLinks;
        this.forwardLinks.set(sourceNote.id, updatedLinks);
        
        result.updatedSourceNotes.push({
          noteId: sourceNote.id,
          noteTitle: sourceNote.title,
          brokenLinks
        });
      }
    }

    this.backLinks.delete(deletedNoteId);
    this.forwardLinks.delete(deletedNoteId);

    for (const [targetId, links] of this.backLinks.entries()) {
      this.backLinks.set(targetId, links.filter(l => l.targetId !== deletedNoteId));
    }

    return result;
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

  getForwardLinks(noteId: string): WikiLink[] {
    return this.forwardLinks.get(noteId) || [];
  }

  resolveMissingLinks(notes: Note[]): { sourceId: string; sourceTitle: string; targetTitle: string }[] {
    const missing: { sourceId: string; sourceTitle: string; targetTitle: string }[] = [];
    
    for (const note of notes) {
      for (const link of note.outLinks) {
        if (!link.targetId) {
          missing.push({
            sourceId: note.id,
            sourceTitle: note.title,
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

  getAllLinks(): { sourceId: string; targetId: string; targetTitle: string }[] {
    const links: { sourceId: string; targetId: string; targetTitle: string }[] = [];
    
    for (const [sourceId, outLinks] of this.forwardLinks.entries()) {
      for (const link of outLinks) {
        if (link.targetId) {
          links.push({
            sourceId,
            targetId: link.targetId,
            targetTitle: link.targetTitle
          });
        }
      }
    }
    
    return links;
  }

  clear(): void {
    this.backLinks.clear();
    this.forwardLinks.clear();
  }
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
