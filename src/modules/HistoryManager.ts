import type { Note, RecentVisit, VisitStats } from '../types';
import { getCurrentTimestamp } from '../utils';

export class HistoryManager {
  private visitHistory: RecentVisit[] = [];
  private maxHistorySize: number = 1000;
  private maxRecentVisits: number = 50;

  setMaxRecentVisits(max: number): void {
    this.maxRecentVisits = Math.max(1, max);
  }

  setMaxHistorySize(max: number): void {
    this.maxHistorySize = Math.max(1, max);
    if (this.visitHistory.length > this.maxHistorySize) {
      this.visitHistory = this.visitHistory.slice(0, this.maxHistorySize);
    }
  }

  recordVisit(note: Note): void {
    const visit: RecentVisit = {
      noteId: note.id,
      noteTitle: note.title,
      visitedAt: getCurrentTimestamp()
    };

    this.visitHistory.unshift(visit);

    if (this.visitHistory.length > this.maxHistorySize) {
      this.visitHistory = this.visitHistory.slice(0, this.maxHistorySize);
    }
  }

  getRecentVisits(limit?: number): RecentVisit[] {
    const recentNotes = new Map<string, RecentVisit>();
    
    for (const visit of this.visitHistory) {
      if (!recentNotes.has(visit.noteId)) {
        recentNotes.set(visit.noteId, visit);
        if (limit && recentNotes.size >= limit) {
          break;
        }
      }
    }
    
    return Array.from(recentNotes.values());
  }

  getRecentNotes(notes: Note[], limit?: number): Note[] {
    const visits = this.getRecentVisits(limit);
    const noteMap = new Map(notes.map(n => [n.id, n]));
    
    return visits
      .map(v => noteMap.get(v.noteId))
      .filter((n): n is Note => n !== undefined);
  }

  getAllVisits(options?: {
    noteId?: string;
    since?: number;
    until?: number;
    limit?: number;
  }): RecentVisit[] {
    let filtered = [...this.visitHistory];

    if (options?.noteId) {
      filtered = filtered.filter(v => v.noteId === options.noteId);
    }

    const sinceTime = options?.since;
    if (typeof sinceTime === 'number') {
      filtered = filtered.filter(v => v.visitedAt >= sinceTime);
    }

    const untilTime = options?.until;
    if (typeof untilTime === 'number') {
      filtered = filtered.filter(v => v.visitedAt <= untilTime);
    }

    if (typeof options?.limit === 'number') {
      filtered = filtered.slice(0, options.limit);
    }

    return filtered;
  }

  removeFromHistory(noteId: string): boolean {
    const initialLength = this.visitHistory.length;
    this.visitHistory = this.visitHistory.filter(v => v.noteId !== noteId);
    return this.visitHistory.length !== initialLength;
  }

  clearHistory(): void {
    this.visitHistory = [];
  }

  getVisitCount(noteId?: string, since?: number, until?: number): number {
    let filtered = this.visitHistory;

    if (noteId) {
      filtered = filtered.filter(v => v.noteId === noteId);
    }

    if (since) {
      filtered = filtered.filter(v => v.visitedAt >= since);
    }

    if (until) {
      filtered = filtered.filter(v => v.visitedAt <= until);
    }

    return filtered.length;
  }

  getUniqueVisitCount(noteId?: string, since?: number, until?: number): number {
    let filtered = this.visitHistory;

    if (noteId) {
      filtered = filtered.filter(v => v.noteId === noteId);
    }

    if (since) {
      filtered = filtered.filter(v => v.visitedAt >= since);
    }

    if (until) {
      filtered = filtered.filter(v => v.visitedAt <= until);
    }

    return new Set(filtered.map(v => v.noteId)).size;
  }

  getMostVisited(notes: Note[], options: {
    limit?: number;
    since?: number;
    until?: number;
    includeStats?: boolean;
  } = {}): { note: Note; visitCount: number; uniqueVisits?: number; firstVisitAt?: number; lastVisitAt?: number }[] {
    const { limit = 10, since, until, includeStats = false } = options;
    
    const visitCounts = new Map<string, number>();
    const firstVisit = new Map<string, number>();
    const lastVisit = new Map<string, number>();

    for (const visit of this.visitHistory) {
      if (since && visit.visitedAt < since) continue;
      if (until && visit.visitedAt > until) continue;

      visitCounts.set(visit.noteId, (visitCounts.get(visit.noteId) || 0) + 1);
      
      if (!firstVisit.has(visit.noteId) || visit.visitedAt < firstVisit.get(visit.noteId)!) {
        firstVisit.set(visit.noteId, visit.visitedAt);
      }
      if (!lastVisit.has(visit.noteId) || visit.visitedAt > lastVisit.get(visit.noteId)!) {
        lastVisit.set(visit.noteId, visit.visitedAt);
      }
    }

    const noteMap = new Map(notes.map(n => [n.id, n]));
    const results: { note: Note; visitCount: number; uniqueVisits?: number; firstVisitAt?: number; lastVisitAt?: number }[] = [];

    for (const [noteId, count] of visitCounts.entries()) {
      const note = noteMap.get(noteId);
      if (note) {
        const result: { note: Note; visitCount: number; uniqueVisits?: number; firstVisitAt?: number; lastVisitAt?: number } = {
          note,
          visitCount: count
        };
        if (includeStats) {
          result.uniqueVisits = 1;
          result.firstVisitAt = firstVisit.get(noteId);
          result.lastVisitAt = lastVisit.get(noteId);
        }
        results.push(result);
      }
    }

    return results
      .sort((a, b) => b.visitCount - a.visitCount)
      .slice(0, limit);
  }

  getVisitStats(noteId: string, notes: Note[], options?: {
    since?: number;
    until?: number;
  }): VisitStats | null {
    const note = notes.find(n => n.id === noteId);
    if (!note) return null;

    const visits = this.getAllVisits({ noteId, ...options });
    if (visits.length === 0) {
      return {
        noteId,
        noteTitle: note.title,
        totalVisits: 0,
        uniqueVisits: 0,
        firstVisitAt: 0,
        lastVisitAt: 0
      };
    }

    const uniqueVisits = new Set(visits.map(v => v.noteId)).size;
    const timestamps = visits.map(v => v.visitedAt).sort((a, b) => a - b);
    
    let averageVisitInterval: number | undefined;
    if (visits.length > 1) {
      let totalInterval = 0;
      for (let i = 1; i < timestamps.length; i++) {
        totalInterval += timestamps[i] - timestamps[i - 1];
      }
      averageVisitInterval = totalInterval / (visits.length - 1);
    }

    return {
      noteId,
      noteTitle: note.title,
      totalVisits: visits.length,
      uniqueVisits,
      firstVisitAt: timestamps[0],
      lastVisitAt: timestamps[timestamps.length - 1],
      averageVisitInterval
    };
  }

  getLastVisit(noteId: string): RecentVisit | undefined {
    return this.visitHistory.find(v => v.noteId === noteId);
  }

  getFirstVisit(noteId: string): RecentVisit | undefined {
    const visits = this.visitHistory.filter(v => v.noteId === noteId);
    return visits[visits.length - 1];
  }

  getVisitTimeline(options: {
    startDate?: number;
    endDate?: number;
    groupBy?: 'hour' | 'day' | 'week' | 'month';
    noteId?: string;
  } = {}): { date: string; count: number; uniqueCount: number; noteIds: string[] }[] {
    const { startDate, endDate, groupBy = 'day', noteId } = options;
    
    const filtered = this.visitHistory.filter(v => {
      if (noteId && v.noteId !== noteId) return false;
      if (startDate && v.visitedAt < startDate) return false;
      if (endDate && v.visitedAt > endDate) return false;
      return true;
    });

    const grouped = new Map<string, { count: number; noteIds: Set<string> }>();
    
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
      
      if (!grouped.has(key)) {
        grouped.set(key, { count: 0, noteIds: new Set() });
      }
      const group = grouped.get(key)!;
      group.count++;
      group.noteIds.add(visit.noteId);
    }

    return Array.from(grouped.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, data]) => ({ 
        date, 
        count: data.count, 
        uniqueCount: data.noteIds.size,
        noteIds: Array.from(data.noteIds)
      }));
  }

  getVisitHeatmap(options: {
    startDate?: number;
    endDate?: number;
  } = {}): { date: string; count: number }[] {
    const { startDate, endDate } = options;
    const today = new Date();
    const end = endDate ? new Date(endDate) : today;
    const start = startDate ? new Date(startDate) : new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    const result: { date: string; count: number }[] = [];
    const current = new Date(start);

    while (current <= end) {
      const dateStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
      const nextDay = new Date(current);
      nextDay.setDate(current.getDate() + 1);

      const count = this.visitHistory.filter(v => 
        v.visitedAt >= current.getTime() && v.visitedAt < nextDay.getTime()
      ).length;

      result.push({ date: dateStr, count });
      current.setDate(current.getDate() + 1);
    }

    return result;
  }

  getActiveNotes(notes: Note[], options: {
    since?: number;
    limit?: number;
  } = {}): { note: Note; visitCount: number; lastVisitAt: number }[] {
    const { since, limit = 20 } = options;
    const sinceTime = since || Date.now() - 7 * 24 * 60 * 60 * 1000;

    const recentVisits = this.visitHistory.filter(v => v.visitedAt >= sinceTime);
    const noteVisits = new Map<string, { count: number; lastVisit: number }>();

    for (const visit of recentVisits) {
      if (!noteVisits.has(visit.noteId)) {
        noteVisits.set(visit.noteId, { count: 0, lastVisit: 0 });
      }
      const data = noteVisits.get(visit.noteId)!;
      data.count++;
      if (visit.visitedAt > data.lastVisit) {
        data.lastVisit = visit.visitedAt;
      }
    }

    const noteMap = new Map<string, Note>(notes.map((n: Note) => [n.id, n]));
    const result: { note: Note; visitCount: number; lastVisitAt: number }[] = [];

    for (const [noteId, data] of noteVisits.entries()) {
      const note = noteMap.get(noteId);
      if (note) {
        result.push({
          note,
          visitCount: data.count,
          lastVisitAt: data.lastVisit
        });
      }
    }

    return result
      .sort((a, b) => b.visitCount - a.visitCount)
      .slice(0, limit);
  }

  updateNoteTitleInHistory(noteId: string, newTitle: string): void {
    for (const visit of this.visitHistory) {
      if (visit.noteId === noteId) {
        visit.noteTitle = newTitle;
      }
    }
  }

  toJSON(): RecentVisit[] {
    return [...this.visitHistory];
  }

  fromJSON(visits: RecentVisit[]): void {
    this.visitHistory = visits
      .sort((a, b) => b.visitedAt - a.visitedAt)
      .slice(0, this.maxHistorySize);
  }

  clear(): void {
    this.clearHistory();
  }
}
