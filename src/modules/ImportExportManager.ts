import type { Note, ExportOptions, ImportResult, Attachment, WikiLink, CreateNoteOptions } from '../types';
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
      
      lines.push('---');
      lines.push(...metadata);
      lines.push('---');
      lines.push('');
      
      if (note.summary) {
        lines.push(`> ${note.summary}`);
        lines.push('');
      }
      
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

  importFromJSON(jsonString: string): ImportResult {
    const result: ImportResult = {
      successCount: 0,
      failedCount: 0,
      errors: [],
      importedNoteIds: []
    };

    try {
      const data = JSON.parse(jsonString);
      const notes = Array.isArray(data) ? data : (data.notes || []);

      for (let i = 0; i < notes.length; i++) {
        try {
          const noteData = notes[i];
          const note = this.validateAndConvertNote(noteData);
          result.importedNoteIds.push(note.id);
          result.successCount++;
        } catch (error) {
          result.failedCount++;
          result.errors.push({
            index: i,
            message: error instanceof Error ? error.message : '未知错误',
            data: notes[i]
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

    return result;
  }

  importFromMarkdown(markdownFiles: { filename: string; content: string }[]): ImportResult {
    const result: ImportResult = {
      successCount: 0,
      failedCount: 0,
      errors: [],
      importedNoteIds: []
    };

    for (let i = 0; i < markdownFiles.length; i++) {
      try {
        const file = markdownFiles[i];
        const note = this.parseMarkdownNote(file.filename, file.content);
        result.importedNoteIds.push(note.id);
        result.successCount++;
      } catch (error) {
        result.failedCount++;
        result.errors.push({
          index: i,
          message: error instanceof Error ? error.message : '未知错误',
          data: { filename: markdownFiles[i].filename }
        });
      }
    }

    return result;
  }

  private validateAndConvertNote(data: any): Note {
    if (!data || typeof data !== 'object') {
      throw new Error('笔记数据格式无效');
    }

    if (!data.title || typeof data.title !== 'string') {
      throw new Error('笔记标题不能为空');
    }

    const now = getCurrentTimestamp();
    const attachments: Attachment[] = (data.attachments || []).map((att: any) => ({
      id: att.id || generateAttachmentId(),
      name: att.name || '未命名',
      path: att.path || '',
      type: att.type || '',
      size: att.size || 0,
      noteId: data.id || generateId(),
      createdAt: att.createdAt || now
    }));

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
      summary: data.summary,
      tags: normalizeTags(data.tags || []),
      isFavorite: !!data.isFavorite,
      attachments,
      outLinks,
      createdAt: data.createdAt || now,
      updatedAt: data.updatedAt || now,
      lastVisitedAt: data.lastVisitedAt,
      metadata: data.metadata || {}
    };
  }

  private parseMarkdownNote(filename: string, content: string): Note {
    const lines = content.split('\n');
    let currentLine = 0;
    
    let title = filename.replace(/\.md$/i, '');
    if (lines[currentLine]?.startsWith('# ')) {
      title = lines[currentLine].substring(2).trim();
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

    const contentLines: string[] = [];
    const attachments: Attachment[] = [];
    
    while (currentLine < lines.length) {
      const line = lines[currentLine];
      
      const attachmentMatch = line.match(/^-\s*\[([^\]]+)\]\(([^)]+)\)\s*\(([^,]+),\s*([^)]+)\)/);
      if (attachmentMatch) {
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
    if (metadata.tags) {
      tags = metadata.tags.split(',').map(t => t.trim()).filter(t => t);
    }

    let createdAt = getCurrentTimestamp();
    if (metadata.created) {
      const parsed = Date.parse(metadata.created);
      if (!isNaN(parsed)) createdAt = parsed;
    }

    let updatedAt = createdAt;
    if (metadata.updated) {
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
      tags: normalizeTags(tags),
      isFavorite: metadata.favorite === 'true',
      attachments,
      outLinks,
      createdAt,
      updatedAt,
      lastVisitedAt,
      metadata: {}
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
