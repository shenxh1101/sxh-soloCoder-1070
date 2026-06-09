import type { Note, CreateNoteOptions, UpdateNoteOptions, Attachment, WikiLink } from '../types';
import { generateId, generateAttachmentId, normalizeTags, getCurrentTimestamp } from '../utils';

export class NoteManager {
  private notes: Map<string, Note> = new Map();

  createNote(options: CreateNoteOptions): Note {
    const now = getCurrentTimestamp();
    const id = generateId();
    
    const attachments: Attachment[] = (options.attachments || []).map(att => ({
      ...att,
      id: generateAttachmentId(),
      noteId: id,
      createdAt: now
    }));

    const note: Note = {
      id,
      title: options.title.trim(),
      content: options.content || '',
      summary: options.summary,
      tags: normalizeTags(options.tags || []),
      isFavorite: options.isFavorite || false,
      attachments,
      outLinks: [],
      createdAt: options.createdAt || now,
      updatedAt: options.updatedAt || now,
      metadata: options.metadata || {}
    };

    this.notes.set(id, note);
    return note;
  }

  getNote(id: string): Note | undefined {
    return this.notes.get(id);
  }

  getNoteByTitle(title: string): Note | undefined {
    const normalizedTitle = title.trim().toLowerCase();
    for (const note of this.notes.values()) {
      if (note.title.toLowerCase() === normalizedTitle) {
        return note;
      }
    }
    return undefined;
  }

  getAllNotes(): Note[] {
    return Array.from(this.notes.values());
  }

  updateNote(id: string, options: UpdateNoteOptions): Note | undefined {
    const note = this.notes.get(id);
    if (!note) return undefined;

    let attachments = note.attachments;
    if (options.attachments !== undefined) {
      const now = getCurrentTimestamp();
      attachments = options.attachments.map(att => ({
        ...att,
        id: generateAttachmentId(),
        noteId: id,
        createdAt: now
      }));
    }

    const updatedNote: Note = {
      ...note,
      title: options.title !== undefined ? options.title.trim() : note.title,
      content: options.content !== undefined ? options.content : note.content,
      summary: options.summary !== undefined ? options.summary : note.summary,
      tags: options.tags !== undefined ? normalizeTags(options.tags) : note.tags,
      isFavorite: options.isFavorite !== undefined ? options.isFavorite : note.isFavorite,
      attachments,
      metadata: options.metadata !== undefined ? { ...note.metadata, ...options.metadata } : note.metadata,
      updatedAt: options.updatedAt || getCurrentTimestamp()
    };

    this.notes.set(id, updatedNote);
    return updatedNote;
  }

  updateNoteLinks(id: string, links: WikiLink[]): Note | undefined {
    const note = this.notes.get(id);
    if (!note) return undefined;

    const updatedNote: Note = {
      ...note,
      outLinks: links
    };

    this.notes.set(id, updatedNote);
    return updatedNote;
  }

  updateNoteSummary(id: string, summary: string): Note | undefined {
    const note = this.notes.get(id);
    if (!note) return undefined;

    const updatedNote: Note = {
      ...note,
      summary
    };

    this.notes.set(id, updatedNote);
    return updatedNote;
  }

  updateLastVisited(id: string): Note | undefined {
    const note = this.notes.get(id);
    if (!note) return undefined;

    const updatedNote: Note = {
      ...note,
      lastVisitedAt: getCurrentTimestamp(),
      updatedAt: note.updatedAt
    };

    this.notes.set(id, updatedNote);
    return updatedNote;
  }

  toggleFavorite(id: string): Note | undefined {
    const note = this.notes.get(id);
    if (!note) return undefined;

    const updatedNote: Note = {
      ...note,
      isFavorite: !note.isFavorite,
      updatedAt: getCurrentTimestamp()
    };

    this.notes.set(id, updatedNote);
    return updatedNote;
  }

  deleteNote(id: string): boolean {
    return this.notes.delete(id);
  }

  noteExists(id: string): boolean {
    return this.notes.has(id);
  }

  getNotesByTag(tag: string): Note[] {
    const normalizedTag = tag.trim().toLowerCase().replace(/^#/, '');
    return this.getAllNotes().filter(note => 
      note.tags.some(t => t.toLowerCase() === normalizedTag)
    );
  }

  getFavoriteNotes(): Note[] {
    return this.getAllNotes().filter(note => note.isFavorite);
  }

  getRecentlyUpdated(limit: number = 10): Note[] {
    return this.getAllNotes()
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit);
  }

  getRecentlyCreated(limit: number = 10): Note[] {
    return this.getAllNotes()
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  addAttachment(noteId: string, attachment: Omit<Attachment, 'id' | 'noteId' | 'createdAt'>): Attachment | undefined {
    const note = this.notes.get(noteId);
    if (!note) return undefined;

    const newAttachment: Attachment = {
      ...attachment,
      id: generateAttachmentId(),
      noteId,
      createdAt: getCurrentTimestamp()
    };

    note.attachments.push(newAttachment);
    note.updatedAt = getCurrentTimestamp();
    this.notes.set(noteId, note);

    return newAttachment;
  }

  removeAttachment(noteId: string, attachmentId: string): boolean {
    const note = this.notes.get(noteId);
    if (!note) return false;

    const initialLength = note.attachments.length;
    note.attachments = note.attachments.filter(a => a.id !== attachmentId);
    
    if (note.attachments.length !== initialLength) {
      note.updatedAt = getCurrentTimestamp();
      this.notes.set(noteId, note);
      return true;
    }
    
    return false;
  }

  getNoteCount(): number {
    return this.notes.size;
  }

  clear(): void {
    this.notes.clear();
  }

  toJSON(): Note[] {
    return this.getAllNotes();
  }

  fromJSON(notes: Note[]): void {
    this.clear();
    for (const note of notes) {
      this.notes.set(note.id, note);
    }
  }
}
