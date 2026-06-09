import type { Note, Attachment } from '../types';
import { getFileExtension } from '../utils';

export class AttachmentManager {
  private attachmentsByNote: Map<string, Attachment[]> = new Map();
  private attachmentsByType: Map<string, Attachment[]> = new Map();
  private allAttachments: Map<string, Attachment> = new Map();

  rebuildIndex(notes: Note[]): void {
    this.clear();

    for (const note of notes) {
      for (const attachment of note.attachments) {
        this.indexAttachment(attachment);
      }
    }
  }

  private indexAttachment(attachment: Attachment): void {
    this.allAttachments.set(attachment.id, attachment);

    if (!this.attachmentsByNote.has(attachment.noteId)) {
      this.attachmentsByNote.set(attachment.noteId, []);
    }
    this.attachmentsByNote.get(attachment.noteId)!.push(attachment);

    const ext = getFileExtension(attachment.name);
    const type = attachment.type || ext || 'unknown';
    if (!this.attachmentsByType.has(type)) {
      this.attachmentsByType.set(type, []);
    }
    this.attachmentsByType.get(type)!.push(attachment);
  }

  addAttachment(attachment: Attachment): void {
    this.indexAttachment(attachment);
  }

  removeAttachment(attachmentId: string): boolean {
    const attachment = this.allAttachments.get(attachmentId);
    if (!attachment) return false;

    this.allAttachments.delete(attachmentId);

    const noteAttachments = this.attachmentsByNote.get(attachment.noteId);
    if (noteAttachments) {
      const index = noteAttachments.findIndex(a => a.id === attachmentId);
      if (index !== -1) {
        noteAttachments.splice(index, 1);
        if (noteAttachments.length === 0) {
          this.attachmentsByNote.delete(attachment.noteId);
        }
      }
    }

    const ext = getFileExtension(attachment.name);
    const type = attachment.type || ext || 'unknown';
    const typeAttachments = this.attachmentsByType.get(type);
    if (typeAttachments) {
      const index = typeAttachments.findIndex(a => a.id === attachmentId);
      if (index !== -1) {
        typeAttachments.splice(index, 1);
        if (typeAttachments.length === 0) {
          this.attachmentsByType.delete(type);
        }
      }
    }

    return true;
  }

  getAttachment(attachmentId: string): Attachment | undefined {
    return this.allAttachments.get(attachmentId);
  }

  getAttachmentsByNote(noteId: string): Attachment[] {
    return this.attachmentsByNote.get(noteId) || [];
  }

  getAttachmentsByType(type: string): Attachment[] {
    return this.attachmentsByType.get(type.toLowerCase()) || [];
  }

  getAllAttachments(): Attachment[] {
    return Array.from(this.allAttachments.values());
  }

  searchAttachments(query: string, options: {
    searchInName?: boolean;
    searchInPath?: boolean;
    typeFilter?: string;
    noteIdFilter?: string;
  } = {}): Attachment[] {
    const {
      searchInName = true,
      searchInPath = false,
      typeFilter,
      noteIdFilter
    } = options;

    const normalizedQuery = query.toLowerCase().trim();
    let results: Attachment[] = [];

    if (noteIdFilter) {
      results = this.getAttachmentsByNote(noteIdFilter);
    } else if (typeFilter) {
      results = this.getAttachmentsByType(typeFilter);
    } else {
      results = this.getAllAttachments();
    }

    if (normalizedQuery) {
      results = results.filter(att => {
        if (searchInName && att.name.toLowerCase().includes(normalizedQuery)) {
          return true;
        }
        if (searchInPath && att.path.toLowerCase().includes(normalizedQuery)) {
          return true;
        }
        return false;
      });
    }

    return results;
  }

  getAttachmentTypes(): { type: string; count: number; totalSize: number }[] {
    const types: { type: string; count: number; totalSize: number }[] = [];

    for (const [type, attachments] of this.attachmentsByType.entries()) {
      types.push({
        type,
        count: attachments.length,
        totalSize: attachments.reduce((sum, att) => sum + att.size, 0)
      });
    }

    return types.sort((a, b) => b.count - a.count);
  }

  getTotalAttachmentCount(): number {
    return this.allAttachments.size;
  }

  getTotalAttachmentSize(): number {
    return Array.from(this.allAttachments.values()).reduce((sum, att) => sum + att.size, 0);
  }

  getAttachmentsByExtension(extensions: string[]): Attachment[] {
    const normalizedExtensions = extensions.map(e => e.toLowerCase().replace(/^\./, ''));
    return this.getAllAttachments().filter(att => {
      const ext = getFileExtension(att.name);
      return normalizedExtensions.includes(ext);
    });
  }

  getLargestAttachments(limit: number = 10): Attachment[] {
    return this.getAllAttachments()
      .sort((a, b) => b.size - a.size)
      .slice(0, limit);
  }

  getRecentAttachments(limit: number = 10): Attachment[] {
    return this.getAllAttachments()
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  findDuplicateAttachments(): Map<string, Attachment[]> {
    const sizeMap = new Map<number, Attachment[]>();
    
    for (const attachment of this.allAttachments.values()) {
      if (!sizeMap.has(attachment.size)) {
        sizeMap.set(attachment.size, []);
      }
      sizeMap.get(attachment.size)!.push(attachment);
    }

    const duplicates = new Map<string, Attachment[]>();
    for (const [size, attachments] of sizeMap.entries()) {
      if (attachments.length > 1) {
        duplicates.set(`size_${size}`, attachments);
      }
    }

    return duplicates;
  }

  clear(): void {
    this.attachmentsByNote.clear();
    this.attachmentsByType.clear();
    this.allAttachments.clear();
  }
}
