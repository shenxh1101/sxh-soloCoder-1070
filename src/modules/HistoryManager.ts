import type { Note, RecentVisit } from '../types';
import { getCurrentTimestamp } from '../utils';

export class HistoryManager {
  private recentVisits: RecentVisit[] = [];
  private maxRecentVisits: number = 50;

  setMaxRecentVisits(max: number): void {
    this.maxRecentVisits = Math.max(1, max);
    if (this.recentVisits.length > this.maxRecentVisits) {
      this.recentVisits = this.recentVisits.slice(0, this.maxRecentVisits);
    }
  }

  recordVisit(note: Note): void {
    const existingIndex = this.recentVisits.findIndex(v => v.noteId === note.id);
    
    const visit: RecentVisit = {
      noteId: note.id,
      noteTitle: note.title,
      visitedAt: getCurrentTimestamp()
    };

    if (existingIndex !== -1) {
      this.recentVisits.splice(existingIndex, 1);
    }

    this.recentVisits.unshift(visit);

    if (this.recentVisits.length > this.maxRecentVisits) {
      this.recentVisits = this.recentVisits.slice(0, this.maxRecentVisits);
    }
  }

  getRecentVisits(limit?: number): RecentVisit[] {
    if (limit && limit > 0) {
      return this.recentVisits.slice(0, limit);
    }
    return [...this.recentVisits];
  }

  getRecentNotes(notes: Note[], limit?: number): Note[] {
    const visits = this.getRecentVisits(limit);
    const noteMap = new Map(notes.map(n => [n.id, n]));
    
    return visits
      .map(v => noteMap.get(v.noteId))
      .filter((n): n is Note => n !== undefined);
  }

  removeFromHistory(noteId: string): boolean {
    const initialLength = this.recentVisits.length;
    this.recentVisits = this.recentVisits.filter(v => v.noteId !== noteId);
    return this.recentVisits.length !== initialLength;
  }

  clearHistory(): void {
    this.recentVisits = [];
  }

  getVisitCount(noteId: string, since?: number): number {
    return this.recentVisits.filter(v => 
      v.noteId === noteId && (!since || v.visitedAt >= since)
    ).length;
  }

  getMostVisited(notes: Note[], options: {
    limit?: number;
    since?: number;
  } = {}): { note: Note; visitCount: number }[] {
    const { limit = 10, since } = options;
    
    const visitCounts = new Map<string, number>();
    for (const visit of this.recentVisits) {
      if (!since || visit.visitedAt >= since) {
        visitCounts.set(visit.noteId, (visitCounts.get(visit.noteId) || 0) + 1);
      }
    }

    const noteMap = new Map(notes.map(n => [n.id, n]));
    const results: { note: Note; visitCount: number }[] = [];

    for (const [noteId, count] of visitCounts.entries()) {
      const note = noteMap.get(noteId);
      if (note) {
        results.push({ note, visitCount: count });
      }
    }

    return results
      .sort((a, b) => b.visitCount - a.visitCount)
      .slice(0, limit);
  }

  getLastVisit(noteId: string): RecentVisit | undefined {
    return this.recentVisits.find(v => v.noteId === noteId);
  }

  getVisitTimeline(options: {
    startDate?: number;
    endDate?: number;
    groupBy?: 'hour' | 'day' | 'week' | 'month';
  } = {}): { date: string; count: number }[] {
    const { startDate, endDate, groupBy = 'day' } = options;
    
    const filtered = this.recentVisits.filter(v => {
      if (startDate && v.visitedAt < startDate) return false;
      if (endDate && v.visitedAt > endDate) return false;
      return true;
    });

    const grouped = new Map<string, number>();
    
    for (const visit of filtered) {
      const date = new Date(visit.visitedAt);
      let key: string;
      
      switch (groupBy) {
        case 'hour':
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:00`;
          break;
        case 'day':
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
          break;
        case 'week':
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          key = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`;
          break;
        case 'month':
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          break;
        default:
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      }
      
      grouped.set(key, (grouped.get(key) || 0) + 1);
    }

    return Array.from(grouped.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, count]) => ({ date, count }));
  }

  updateNoteTitleInHistory(noteId: string, newTitle: string): void {
    for (const visit of this.recentVisits) {
      if (visit.noteId === noteId) {
        visit.noteTitle = newTitle;
      }
    }
  }

  toJSON(): RecentVisit[] {
    return [...this.recentVisits];
  }

  fromJSON(visits: RecentVisit[]): void {
    this.recentVisits = visits
      .sort((a, b) => b.visitedAt - a.visitedAt)
      .slice(0, this.maxRecentVisits);
  }

  clear(): void {
    this.clearHistory();
  }
}
