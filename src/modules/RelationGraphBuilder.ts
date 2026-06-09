import type {
  Note,
  RelationGraph,
  RelationNode,
  RelationEdge,
  ReferenceInfo,
  GraphFilterOptions,
  GraphAnalysis,
  WikiLink
} from '../types';
import { normalizeTag } from '../utils';

export class RelationGraphBuilder {
  buildGraph(notes: Note[], options: {
    includeTags?: boolean;
    maxNotes?: number;
    minLinkCount?: number;
  } = {}): RelationGraph {
    const { includeTags = true, maxNotes = 100, minLinkCount = 0 } = options;
    
    const nodes: RelationNode[] = [];
    const edges: RelationEdge[] = [];
    const nodeIds = new Set<string>();

    const filteredNotes = notes.slice(0, maxNotes);

    for (const note of filteredNotes) {
      nodes.push({
        id: note.id,
        title: note.title,
        type: 'note',
        data: {
          tagCount: note.tags.length,
          linkCount: note.outLinks.length,
          createdAt: note.createdAt
        }
      });
      nodeIds.add(note.id);
    }

    for (const note of filteredNotes) {
      if (note.outLinks.length < minLinkCount) continue;
      for (const link of note.outLinks) {
        if (link.targetId && nodeIds.has(link.targetId) && nodeIds.has(note.id)) {
          edges.push({
            source: note.id,
            target: link.targetId,
            type: 'link',
            weight: 1
          });
        }
      }
    }

    if (includeTags) {
      const tagNodeMap = new Map<string, string>();
      const tagNoteMap = new Map<string, string[]>();

      for (const note of filteredNotes) {
        for (const tag of note.tags) {
          if (!tagNoteMap.has(tag)) {
            tagNoteMap.set(tag, []);
          }
          tagNoteMap.get(tag)!.push(note.id);
        }
      }

      for (const [tag, noteIds] of tagNoteMap.entries()) {
        if (noteIds.length >= minLinkCount) {
          const tagNodeId = `tag:${tag}`;
          nodes.push({
            id: tagNodeId,
            title: tag,
            type: 'tag',
            data: {
              noteCount: noteIds.length
            }
          });
          tagNodeMap.set(tag, tagNodeId);
          nodeIds.add(tagNodeId);

          for (const noteId of noteIds) {
            if (nodeIds.has(noteId)) {
              edges.push({
                source: tagNodeId,
                target: noteId,
                type: 'tag',
                weight: noteIds.length
              });
            }
          }
        }
      }
    }

    return { nodes, edges };
  }

  buildSubgraph(
    centerNoteId: string,
    notes: Note[],
    options: {
      depth?: number;
      includeBackLinks?: boolean;
      includeTags?: boolean;
    } = {}
  ): RelationGraph {
    const { depth = 2, includeBackLinks = true, includeTags = true } = options;
    
    const nodes: RelationNode[] = [];
    const edges: RelationEdge[] = [];
    const visited = new Set<string>();
    const noteMap = new Map(notes.map(n => [n.id, n]));

    const centerNote = noteMap.get(centerNoteId);
    if (!centerNote) {
      return { nodes: [], edges: [] };
    }

    const traverse = (noteId: string, currentDepth: number) => {
      if (currentDepth > depth || visited.has(noteId)) return;
      visited.add(noteId);

      const note = noteMap.get(noteId);
      if (!note) return;

      nodes.push({
        id: note.id,
        title: note.title,
        type: 'note',
        data: { depth: currentDepth }
      });

      for (const link of note.outLinks) {
        if (link.targetId && noteMap.has(link.targetId)) {
          edges.push({
            source: note.id,
            target: link.targetId,
            type: 'link',
            weight: 1
          });
          traverse(link.targetId, currentDepth + 1);
        }
      }

      if (includeBackLinks) {
        for (const otherNote of notes) {
          if (otherNote.id !== note.id) {
            for (const link of otherNote.outLinks) {
              if (link.targetId === note.id) {
                edges.push({
                  source: otherNote.id,
                  target: note.id,
                  type: 'link',
                  weight: 1
                });
                traverse(otherNote.id, currentDepth + 1);
              }
            }
          }
        }
      }

      if (includeTags && currentDepth <= 1) {
        for (const tag of note.tags) {
          const tagNodeId = `tag:${tag}`;
          if (!visited.has(tagNodeId)) {
            visited.add(tagNodeId);
            nodes.push({
              id: tagNodeId,
              title: tag,
              type: 'tag',
              data: { depth: currentDepth + 0.5 }
            });
          }
          edges.push({
            source: note.id,
            target: tagNodeId,
            type: 'tag',
            weight: 2
          });
        }
      }
    };

    traverse(centerNoteId, 0);

    return { nodes, edges };
  }

  getNodeDegree(graph: RelationGraph, nodeId: string): { inDegree: number; outDegree: number; total: number } {
    let inDegree = 0;
    let outDegree = 0;

    for (const edge of graph.edges) {
      if (edge.source === nodeId) {
        outDegree++;
      }
      if (edge.target === nodeId) {
        inDegree++;
      }
    }

    return { inDegree, outDegree, total: inDegree + outDegree };
  }

  getConnectedComponents(graph: RelationGraph): RelationNode[][] {
    const visited = new Set<string>();
    const components: RelationNode[][] = [];

    const nodeMap = new Map(graph.nodes.map(n => [n.id, n]));
    const adjacencyMap = new Map<string, string[]>();

    for (const edge of graph.edges) {
      if (!adjacencyMap.has(edge.source)) {
        adjacencyMap.set(edge.source, []);
      }
      if (!adjacencyMap.has(edge.target)) {
        adjacencyMap.set(edge.target, []);
      }
      adjacencyMap.get(edge.source)!.push(edge.target);
      adjacencyMap.get(edge.target)!.push(edge.source);
    }

    for (const node of graph.nodes) {
      if (!visited.has(node.id)) {
        const component: RelationNode[] = [];
        const queue = [node.id];

        while (queue.length > 0) {
          const current = queue.shift()!;
          if (visited.has(current)) continue;
          
          visited.add(current);
          const currentNode = nodeMap.get(current);
          if (currentNode) {
            component.push(currentNode);
          }

          const neighbors = adjacencyMap.get(current) || [];
          for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) {
              queue.push(neighbor);
            }
          }
        }

        if (component.length > 0) {
          components.push(component);
        }
      }
    }

    return components.sort((a, b) => b.length - a.length);
  }

  findShortestPath(
    graph: RelationGraph,
    startId: string,
    endId: string
  ): string[] | null {
    if (startId === endId) return [startId];

    const visited = new Set<string>();
    const queue: { id: string; path: string[] }[] = [{ id: startId, path: [startId] }];

    const adjacencyMap = new Map<string, string[]>();
    for (const edge of graph.edges) {
      if (!adjacencyMap.has(edge.source)) {
        adjacencyMap.set(edge.source, []);
      }
      adjacencyMap.get(edge.source)!.push(edge.target);
    }

    while (queue.length > 0) {
      const { id, path } = queue.shift()!;
      
      if (id === endId) {
        return path;
      }

      if (visited.has(id)) continue;
      visited.add(id);

      const neighbors = adjacencyMap.get(id) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          queue.push({ id: neighbor, path: [...path, neighbor] });
        }
      }
    }

    return null;
  }

  calculateBetweennessCentrality(graph: RelationGraph): Map<string, number> {
    const centrality = new Map<string, number>();
    
    for (const node of graph.nodes) {
      centrality.set(node.id, 0);
    }

    for (const startNode of graph.nodes) {
      const stack: string[] = [];
      const predecessors = new Map<string, string[]>();
      const sigma = new Map<string, number>();
      const distance = new Map<string, number>();
      const queue: string[] = [];

      for (const node of graph.nodes) {
        predecessors.set(node.id, []);
        sigma.set(node.id, 0);
        distance.set(node.id, -1);
      }
      sigma.set(startNode.id, 1);
      distance.set(startNode.id, 0);
      queue.push(startNode.id);

      const adjacencyMap = new Map<string, string[]>();
      for (const edge of graph.edges) {
        if (!adjacencyMap.has(edge.source)) {
          adjacencyMap.set(edge.source, []);
        }
        adjacencyMap.get(edge.source)!.push(edge.target);
      }

      while (queue.length > 0) {
        const v = queue.shift()!;
        stack.push(v);

        const neighbors = adjacencyMap.get(v) || [];
        for (const w of neighbors) {
          if (distance.get(w)! < 0) {
            queue.push(w);
            distance.set(w, distance.get(v)! + 1);
          }
          if (distance.get(w) === distance.get(v)! + 1) {
            sigma.set(w, sigma.get(w)! + sigma.get(v)!);
            predecessors.get(w)!.push(v);
          }
        }
      }

      const delta = new Map<string, number>();
      for (const node of graph.nodes) {
        delta.set(node.id, 0);
      }

      while (stack.length > 0) {
        const w = stack.pop()!;
        for (const v of predecessors.get(w)!) {
          delta.set(v, delta.get(v)! + (sigma.get(v)! / sigma.get(w)!) * (1 + delta.get(w)!));
        }
        if (w !== startNode.id) {
          centrality.set(w, centrality.get(w)! + delta.get(w)!);
        }
      }
    }

    return centrality;
  }

  getReferenceTree(
    noteId: string,
    notes: Note[],
    referencesTo: ReferenceInfo[],
    referencesFrom: ReferenceInfo[]
  ): {
    id: string;
    title: string;
    type: 'root' | 'incoming' | 'outgoing';
    children: any[];
  } {
    const note = notes.find(n => n.id === noteId);
    if (!note) {
      return { id: '', title: '', type: 'root', children: [] };
    }

    return {
      id: note.id,
      title: note.title,
      type: 'root',
      children: [
        {
          id: 'incoming',
          title: '被引用',
          type: 'incoming',
          children: referencesTo.map(ref => ({
            id: ref.noteId,
            title: ref.noteTitle,
            type: 'incoming',
            linkCount: ref.linkCount,
            children: []
          }))
        },
        {
          id: 'outgoing',
          title: '引用',
          type: 'outgoing',
          children: referencesFrom.map(ref => ({
            id: ref.noteId,
            title: ref.noteTitle,
            type: 'outgoing',
            linkCount: ref.linkCount,
            children: []
          }))
        }
      ]
    };
  }

  buildFilteredGraph(notes: Note[], options: GraphFilterOptions = {}): RelationGraph {
    const {
      tagFilters,
      tagFilterMode = 'any',
      isFavorite,
      hasAttachments,
      attachmentTypes,
      noteIds,
      includeTags = false,
      maxDepth
    } = options;

    let filteredNotes = [...notes];

    if (noteIds && noteIds.length > 0) {
      filteredNotes = filteredNotes.filter(n => noteIds.includes(n.id));
    }

    if (typeof isFavorite === 'boolean') {
      filteredNotes = filteredNotes.filter(n => n.isFavorite === isFavorite);
    }

    if (typeof hasAttachments === 'boolean') {
      filteredNotes = filteredNotes.filter(n =>
        hasAttachments ? n.attachments.length > 0 : n.attachments.length === 0
      );
    }

    if (attachmentTypes && attachmentTypes.length > 0) {
      const normalizedTypes = attachmentTypes.map(t => t.toLowerCase());
      filteredNotes = filteredNotes.filter(n =>
        n.attachments.some(a => normalizedTypes.includes(a.type.toLowerCase()))
      );
    }

    if (tagFilters && tagFilters.length > 0) {
      const normalizedFilters = tagFilters.map(normalizeTag);
      filteredNotes = filteredNotes.filter(n => {
        const noteTags = n.tags.map(normalizeTag);
        if (tagFilterMode === 'all') {
          return normalizedFilters.every(f => noteTags.includes(f));
        } else {
          return normalizedFilters.some(f => noteTags.includes(f));
        }
      });
    }

    if (maxDepth && maxDepth > 0) {
      const expandedIds = new Set(filteredNotes.map(n => n.id));
      let currentLayer = [...filteredNotes.map(n => n.id)];

      for (let depth = 0; depth < maxDepth; depth++) {
        const nextLayer: string[] = [];
        for (const noteId of currentLayer) {
          const note = notes.find(n => n.id === noteId);
          if (note) {
            for (const link of note.outLinks) {
              if (link.targetId && !expandedIds.has(link.targetId)) {
                expandedIds.add(link.targetId);
                nextLayer.push(link.targetId);
              }
            }
            for (const other of notes) {
              for (const link of other.outLinks) {
                if (link.targetId === noteId && !expandedIds.has(other.id)) {
                  expandedIds.add(other.id);
                  nextLayer.push(other.id);
                }
              }
            }
          }
        }
        currentLayer = nextLayer;
        if (currentLayer.length === 0) break;
      }

      filteredNotes = notes.filter(n => expandedIds.has(n.id));
    }

    return this.buildGraph(filteredNotes, { includeTags });
  }

  analyzeGraph(notes: Note[], graph?: RelationGraph): GraphAnalysis {
    const fullGraph = graph || this.buildGraph(notes, { includeTags: false });
    const noteMap = new Map(notes.map(n => [n.id, n]));

    const inDegree = new Map<string, number>();
    const outDegree = new Map<string, number>();

    for (const edge of fullGraph.edges) {
      if (edge.type !== 'link') continue;
      outDegree.set(edge.source, (outDegree.get(edge.source) || 0) + 1);
      inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
    }

    const orphanNodes: Note[] = [];
    for (const note of notes) {
      const inD = inDegree.get(note.id) || 0;
      const hasAnyLinks = note.outLinks.length > 0 || inD > 0;
      if (!hasAnyLinks) {
        orphanNodes.push(note);
      }
    }

    const brokenLinkNodes: { note: Note; brokenLinks: WikiLink[] }[] = [];
    for (const note of notes) {
      const brokenLinks = note.outLinks.filter(l => !l.targetId || !noteMap.has(l.targetId));
      if (brokenLinks.length > 0) {
        brokenLinkNodes.push({ note, brokenLinks });
      }
    }

    const centrality = this.calculateBetweennessCentrality(fullGraph);
    const centralNodes: GraphAnalysis['centralNodes'] = [];
    for (const note of notes) {
      const inD = inDegree.get(note.id) || 0;
      const outD = outDegree.get(note.id) || 0;
      const centralityScore = centrality.get(note.id) || 0;
      if (inD + outD > 0) {
        centralNodes.push({
          note,
          centrality: centralityScore,
          inDegree: inD,
          outDegree: outD
        });
      }
    }
    centralNodes.sort((a, b) => b.centrality - a.centrality);

    const components = this.getConnectedComponents(fullGraph);
    const isolatedClusters: GraphAnalysis['isolatedClusters'] = components
      .filter(comp => comp.length >= 2)
      .map((comp, idx) => ({
        id: `cluster_${idx}`,
        notes: comp
          .filter(c => c.type === 'note')
          .map(c => noteMap.get(c.id)!)
          .filter(Boolean),
        size: comp.filter(c => c.type === 'note').length
      }))
      .filter(c => c.size >= 2);

    const totalNoteNodes = fullGraph.nodes.filter(n => n.type === 'note').length;
    const totalEdges = fullGraph.edges.filter(e => e.type === 'link').length;
    const maxPossibleEdges = totalNoteNodes * (totalNoteNodes - 1);

    return {
      orphanNodes,
      brokenLinkNodes,
      centralNodes: centralNodes.slice(0, 20),
      isolatedClusters,
      stats: {
        totalNodes: totalNoteNodes,
        totalEdges,
        orphanCount: orphanNodes.length,
        brokenLinkCount: brokenLinkNodes.length,
        averageDegree: totalNoteNodes > 0 ? (2 * totalEdges) / totalNoteNodes : 0,
        density: maxPossibleEdges > 0 ? totalEdges / maxPossibleEdges : 0
      }
    };
  }

  getOrphanNodes(notes: Note[]): Note[] {
    const noteIds = new Set(notes.map(n => n.id));
    const linkedIds = new Set<string>();

    for (const note of notes) {
      for (const link of note.outLinks) {
        if (link.targetId && noteIds.has(link.targetId)) {
          linkedIds.add(note.id);
          linkedIds.add(link.targetId);
        }
      }
    }

    return notes.filter(n => !linkedIds.has(n.id));
  }

  getBrokenLinkNodes(notes: Note[]): { note: Note; brokenLinks: WikiLink[] }[] {
    const noteIds = new Set(notes.map(n => n.id));
    const result: { note: Note; brokenLinks: WikiLink[] }[] = [];

    for (const note of notes) {
      const brokenLinks = note.outLinks.filter(l => !l.targetId || !noteIds.has(l.targetId));
      if (brokenLinks.length > 0) {
        result.push({ note, brokenLinks });
      }
    }

    return result;
  }

  getCentralNodes(notes: Note[], limit: number = 10): GraphAnalysis['centralNodes'] {
    return this.analyzeGraph(notes).centralNodes.slice(0, limit);
  }

  clear(): void {
  }
}
