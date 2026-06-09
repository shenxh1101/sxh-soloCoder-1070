import type { Note, ExportOptions, ImportResult, ImportOptions, ImportConflictStrategy, Attachment, WikiLink, CreateNoteOptions } from '../types';
import { generateId, generateAttachmentId, normalizeTags, getCurrentTimestamp, normalizeTag } from '../utils';

export class ImportExportManager {
  exportToJSON(notes: Note[], options: ExportOptions): string {
    const { includeAttachments = true, noteIds, tagFilters } = options;
    
    let exportNotes = notes;
    
    if (noteIds && noteIds.length > 0) {
      exportNotes = notes.filter(n => noteIds.includes(n.id));
    }
    
    if (tagFilters && tagFilters.length > 0) {
      const normalizedFilters = tagFilters.map(normalizeTag);
      exportNotes = exportNotes.filter(note =>
        note.tags.some(tag => normalizedFilters.includes(normalizeTag(tag)))
      );
    }

    const exportData = exportNotes.map(note => {
      const data: any = {
        id: note.id,
        title: note.title,
        content: note.content,
        summary: note.summary,
        tags: note.tags,
        isFavorite: note.isFavorite,
        outLinks: note.outLinks,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
        lastVisitedAt: note.lastVisitedAt,
        metadata: note.metadata
      };

      if (includeAttachments) {
        data.attachments = note.attachments;
      } else {
        data.attachments = [];
      }

      return data;
    });

    return JSON.stringify({
      version: '1.0.0',
      exportedAt: getCurrentTimestamp(),
      noteCount: exportNotes.length,
      notes: exportData
    }, null, 2);
  }

  exportToMarkdown(notes: Note[], options: ExportOptions): { filename: string; content: string }[] {
    const { includeAttachments = true, noteIds, tagFilters } = options;
    
    let exportNotes = notes;
    
    if (noteIds && noteIds.length > 0) {
      exportNotes = notes.filter(n => noteIds.includes(n.id));
    }
    
    if (tagFilters && tagFilters.length > 0) {
      const normalizedFilters = tagFilters.map(normalizeTag);
      exportNotes = exportNotes.filter(note =>
        note.tags.some(tag => normalizedFilters.includes(normalizeTag(tag)))
      );
    }

    return exportNotes.map(note => {
      const lines: string[] = [];
      
      lines.push(`# ${note.title}`);
      lines.push('');
      
      const metadata: string[] = [];
      metadata.push(`id: ${note.id}`);
      metadata.push(`created: ${new Date(note.createdAt).toISOString()}`);
      metadata.push(`updated: ${new Date(note.updatedAt).toISOString()}`);
      if (note.lastVisitedAt) {
        metadata.push(`last_visited: ${new Date(note.lastVisitedAt).toISOString()}`);
      }
      if (note.isFavorite) {
        metadata.push(`favorite: true`);
      }
      if (note.tags.length > 0) {
        metadata.push(`tags: ${note.tags.join(', ')}`);
      }
      if (note.summary) {
        metadata.push(`summary: ${note.summary}`);
      }
      
      lines.push('---');
      lines.push(...metadata);
      lines.push('---');
      lines.push('');
      
      lines.push(note.content);
      
      if (includeAttachments && note.attachments.length > 0) {
        lines.push('');
        lines.push('## 附件');
        lines.push('');
        for (const att of note.attachments) {
          lines.push(`- [${att.name}](${att.path}) (${att.type}, ${Math.round(att.size / 1024)}KB)`);
        }
      }
      
      if (note.outLinks.length > 0) {
        lines.push('');
        lines.push('## 相关链接');
        lines.push('');
        const uniqueLinks = [...new Set(note.outLinks.map(l => l.targetTitle))];
        for (const linkTitle of uniqueLinks) {
          lines.push(`- [[${linkTitle}]]`);
        }
      }

      const safeFilename = note.title.replace(/[<>:"/\\|?*]/g, '_').substring(0, 100);
      
      return {
        filename: `${safeFilename}.md`,
        content: lines.join('\n')
      };
    });
  }

  importFromJSON(
    jsonString: string,
    options: ImportOptions = {},
    existingNotes: Note[] = []
  ): { result: ImportResult; notesToCreate: CreateNoteOptions[]; notesToUpdate: { id: string; options: CreateNoteOptions }[] } {
    const result: ImportResult = {
      successCount: 0,
      failedCount: 0,
      skippedCount: 0,
      overwrittenCount: 0,
      renamedCount: 0,
      errors: [],
      importedNotes: [],
      importedNoteIds: [],
      skippedNotes: [],
      overwrittenNotes: [],
      renamedNotes: []
    };

    const notesToCreate: CreateNoteOptions[] = [];
    const notesToUpdate: { id: string; options: CreateNoteOptions }[] = [];

    try {
      const data = JSON.parse(jsonString);
      const notesData = Array.isArray(data) ? data : (data.notes || []);

      for (let i = 0; i < notesData.length; i++) {
        try {
          const noteData = notesData[i];
          const validatedNote = this.validateAndConvertNote(noteData, options);
          
          const processed = this.processImportedNote(
            validatedNote,
            options,
            existingNotes,
            notesToCreate,
            notesToUpdate,
            result
          );

          if (processed) {
            result.importedNotes.push(processed);
            result.importedNoteIds.push(processed.id);
            result.successCount++;
          }
        } catch (error) {
          result.failedCount++;
          result.errors.push({
            index: i,
            message: error instanceof Error ? error.message : '未知错误',
            data: notesData[i]
          });
        }
      }
    } catch (error) {
      result.failedCount++;
      result.errors.push({
        index: 0,
        message: `JSON 解析失败: ${error instanceof Error ? error.message : '未知错误'}`
      });
    }

    return { result, notesToCreate, notesToUpdate };
  }

  importFromMarkdown(
    markdownFiles: { filename: string; content: string }[],
    options: ImportOptions = {},
    existingNotes: Note[] = []
  ): { result: ImportResult; notesToCreate: CreateNoteOptions[]; notesToUpdate: { id: string; options: CreateNoteOptions }[] } {
    const result: ImportResult = {
      successCount: 0,
      failedCount: 0,
      skippedCount: 0,
      overwrittenCount: 0,
      renamedCount: 0,
      errors: [],
      importedNotes: [],
      importedNoteIds: [],
      skippedNotes: [],
      overwrittenNotes: [],
      renamedNotes: []
    };

    const notesToCreate: CreateNoteOptions[] = [];
    const notesToUpdate: { id: string; options: CreateNoteOptions }[] = [];

    for (let i = 0; i < markdownFiles.length; i++) {
      try {
        const file = markdownFiles[i];
        const parsedNote = this.parseMarkdownNote(file.filename, file.content, options);
        
        const processed = this.processImportedNote(
          parsedNote,
          options,
          existingNotes,
          notesToCreate,
          notesToUpdate,
          result
        );

        if (processed) {
          result.importedNotes.push(processed);
          result.importedNoteIds.push(processed.id);
          result.successCount++;
        }
      } catch (error) {
        result.failedCount++;
        result.errors.push({
          index: i,
          message: error instanceof Error ? error.message : '未知错误',
          data: { filename: markdownFiles[i].filename }
        });
      }
    }

    return { result, notesToCreate, notesToUpdate };
  }

  private processImportedNote(
    note: Note,
    options: ImportOptions,
    existingNotes: Note[],
    notesToCreate: CreateNoteOptions[],
    notesToUpdate: { id: string; options: CreateNoteOptions }[],
    result: ImportResult
  ): Note | null {
    const conflictStrategy: ImportConflictStrategy = options.conflictStrategy || 'skip';
    const normalizedTitle = note.title.toLowerCase().trim();
    
    const existingNote = existingNotes.find(n => 
      n.title.toLowerCase().trim() === normalizedTitle
    );

    if (existingNote) {
      switch (conflictStrategy) {
        case 'skip':
          result.skippedCount++;
          result.skippedNotes.push({
            title: note.title,
            existingId: existingNote.id
          });
          return null;

        case 'overwrite':
          result.overwrittenCount++;
          result.overwrittenNotes.push({
            title: note.title,
            oldId: existingNote.id,
            newId: note.id
          });
          notesToUpdate.push({
            id: existingNote.id,
            options: this.noteToCreateOptions(note, options)
          });
          return { ...note, id: existingNote.id };

        case 'rename':
          result.renamedCount++;
          let newTitle = this.generateUniqueTitle(note.title, existingNotes);
          result.renamedNotes.push({
            oldTitle: note.title,
            newTitle,
            noteId: note.id
          });
          const renamedNote = { ...note, title: newTitle };
          notesToCreate.push(this.noteToCreateOptions(renamedNote, options));
          return renamedNote;
      }
    }

    notesToCreate.push(this.noteToCreateOptions(note, options));
    return note;
  }

  private generateUniqueTitle(baseTitle: string, existingNotes: Note[]): string {
    const existingTitles = new Set(existingNotes.map(n => n.title.toLowerCase()));
    let counter = 1;
    let newTitle = `${baseTitle} (${counter})`;
    
    while (existingTitles.has(newTitle.toLowerCase())) {
      counter++;
      newTitle = `${baseTitle} (${counter})`;
    }
    
    return newTitle;
  }

  private noteToCreateOptions(note: Note, options: ImportOptions): CreateNoteOptions {
    const createOptions: CreateNoteOptions = {
      title: note.title,
      content: note.content,
      tags: options.keepTags !== false ? note.tags : [],
      isFavorite: options.keepFavorites !== false ? note.isFavorite : false,
      metadata: options.keepMetadata !== false ? note.metadata : {}
    };

    if (options.keepAttachments !== false && note.attachments.length > 0) {
      createOptions.attachments = note.attachments.map(a => ({
        name: a.name,
        path: a.path,
        type: a.type,
        size: a.size
      }));
    }

    return createOptions;
  }

  private validateAndConvertNote(data: any, options: ImportOptions = {}): Note {
    if (!data || typeof data !== 'object') {
      throw new Error('笔记数据格式无效');
    }

    if (!data.title || typeof data.title !== 'string') {
      throw new Error('笔记标题不能为空');
    }

    const now = getCurrentTimestamp();
    const attachments: Attachment[] = options.keepAttachments !== false
      ? (data.attachments || []).map((att: any) => ({
          id: att.id || generateAttachmentId(),
          name: att.name || '未命名',
          path: att.path || '',
          type: att.type || '',
          size: att.size || 0,
          noteId: data.id || generateId(),
          createdAt: att.createdAt || now
        }))
      : [];

    const outLinks: WikiLink[] = (data.outLinks || []).map((link: any) => ({
      targetId: link.targetId || '',
      targetTitle: link.targetTitle || '',
      anchor: link.anchor,
      displayText: link.displayText,
      position: link.position || { start: 0, end: 0 }
    }));

    return {
      id: data.id || generateId(),
      title: data.title.trim(),
      content: data.content || '',
      summary: options.keepSummary !== false ? data.summary : undefined,
      tags: options.keepTags !== false ? normalizeTags(data.tags || []) : [],
      isFavorite: options.keepFavorites !== false ? !!data.isFavorite : false,
      attachments,
      outLinks,
      createdAt: options.keepCreationTime !== false && data.createdAt ? data.createdAt : now,
      updatedAt: options.keepUpdateTime !== false && data.updatedAt ? data.updatedAt : now,
      lastVisitedAt: data.lastVisitedAt,
      metadata: options.keepMetadata !== false ? data.metadata || {} : {}
    };
  }

  private parseMarkdownNote(
    filename: string,
    content: string,
    options: ImportOptions = {}
  ): Note {
    const lines = content.split('\n');
    let currentLine = 0;
    
    let title = filename.replace(/\.md$/i, '');
    if (lines[currentLine]?.startsWith('# ')) {
      title = lines[currentLine].substring(2).trim();
      currentLine++;
    }

    while (currentLine < lines.length && lines[currentLine]?.trim() === '') {
      currentLine++;
    }

    let metadata: Record<string, string> = {};
    if (lines[currentLine]?.trim() === '---') {
      currentLine++;
      while (currentLine < lines.length && lines[currentLine]?.trim() !== '---') {
        const colonIndex = lines[currentLine].indexOf(':');
        if (colonIndex > 0) {
          const key = lines[currentLine].substring(0, colonIndex).trim();
          const value = lines[currentLine].substring(colonIndex + 1).trim();
          metadata[key] = value;
        }
        currentLine++;
      }
      if (lines[currentLine]?.trim() === '---') {
        currentLine++;
      }
    }

    while (currentLine < lines.length && lines[currentLine]?.trim() === '') {
      currentLine++;
    }

    let summary: string | undefined;
    if (lines[currentLine]?.startsWith('> ')) {
      summary = lines[currentLine].substring(2).trim();
      currentLine++;
    }

    if (!summary && metadata.summary && options.keepSummary !== false) {
      summary = metadata.summary;
    }

    const contentLines: string[] = [];
    const attachments: Attachment[] = [];
    
    while (currentLine < lines.length) {
      const line = lines[currentLine];
      
      const attachmentMatch = line.match(/^-\s*\[([^\]]+)\]\(([^)]+)\)\s*\(([^,]+),\s*([^)]+)\)/);
      if (attachmentMatch && options.keepAttachments !== false) {
        const [, name, path, type, sizeStr] = attachmentMatch;
        const sizeMatch = sizeStr.match(/(\d+)/);
        attachments.push({
          id: generateAttachmentId(),
          name: name.trim(),
          path: path.trim(),
          type: type.trim(),
          size: sizeMatch ? parseInt(sizeMatch[1]) * 1024 : 0,
          noteId: metadata.id || generateId(),
          createdAt: getCurrentTimestamp()
        });
        currentLine++;
        continue;
      }

      if (line.trim() === '## 附件' || line.trim() === '## 相关链接') {
        break;
      }

      contentLines.push(line);
      currentLine++;
    }

    let tags: string[] = [];
    if (metadata.tags && options.keepTags !== false) {
      tags = metadata.tags.split(',').map(t => t.trim()).filter(t => t);
    }

    const now = getCurrentTimestamp();
    let createdAt = now;
    if (metadata.created && options.keepCreationTime !== false) {
      const parsed = Date.parse(metadata.created);
      if (!isNaN(parsed)) createdAt = parsed;
    }

    let updatedAt = createdAt;
    if (metadata.updated && options.keepUpdateTime !== false) {
      const parsed = Date.parse(metadata.updated);
      if (!isNaN(parsed)) updatedAt = parsed;
    }

    let lastVisitedAt: number | undefined;
    if (metadata.last_visited) {
      const parsed = Date.parse(metadata.last_visited);
      if (!isNaN(parsed)) lastVisitedAt = parsed;
    }

    const noteContent = contentLines.join('\n').trim();
    const outLinks = this.extractLinksFromContent(noteContent);

    return {
      id: metadata.id || generateId(),
      title: title.trim(),
      content: noteContent,
      summary,
      tags: options.keepTags !== false ? normalizeTags(tags) : [],
      isFavorite: options.keepFavorites !== false ? metadata.favorite === 'true' : false,
      attachments,
      outLinks,
      createdAt,
      updatedAt,
      lastVisitedAt,
      metadata: options.keepMetadata !== false ? {} : {}
    };
  }

  private extractLinksFromContent(content: string): WikiLink[] {
    const links: WikiLink[] = [];
    const linkPattern = /\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g;
    
    let match: RegExpExecArray | null;
    while ((match = linkPattern.exec(content)) !== null) {
      links.push({
        targetId: '',
        targetTitle: match[1].trim(),
        anchor: match[2]?.trim(),
        displayText: match[3]?.trim(),
        position: {
          start: match.index,
          end: match.index + match[0].length
        }
      });
    }
    
    return links;
  }

  convertToCreateOptions(notes: Note[]): CreateNoteOptions[] {
    return notes.map(note => ({
      title: note.title,
      content: note.content,
      tags: [...note.tags],
      isFavorite: note.isFavorite,
      attachments: note.attachments.map(a => ({
        name: a.name,
        path: a.path,
        type: a.type,
        size: a.size
      })),
      metadata: { ...note.metadata }
    }));
  }

  clear(): void {
  }
}
