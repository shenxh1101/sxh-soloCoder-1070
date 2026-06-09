import { KnowledgeLibrary } from '../index';
import type { Note, ImportResult, SearchResult } from '../types';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void | Promise<void>): void {
  try {
    fn();
    passed++;
    console.log(`✓ ${name}`);
  } catch (error) {
    failed++;
    failures.push(name);
    console.log(`✗ ${name}`);
    console.log(`  Error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual: unknown, expected: unknown, message?: string): void {
  if (actual !== expected) {
    throw new Error(`${message || ''} Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

console.log('\n=== 知识管理类库自动化测试 ===\n');

test('1. 笔记创建 - 基本功能', () => {
  const lib = new KnowledgeLibrary();
  const { note } = lib.notes.create({
    title: '测试笔记',
    content: '这是测试内容',
    tags: ['测试', '技术']
  });

  assertEqual(note.title, '测试笔记', '标题应该匹配');
  assertEqual(note.content, '这是测试内容', '内容应该匹配');
  assertEqual(note.tags.length, 2, '应该有2个标签');
  assertEqual(note.isFavorite, false, '默认不应该收藏');
  assert(note.id.startsWith('note_'), 'ID格式应该正确');
  assert(note.summary !== undefined, '应该自动生成摘要');
});

test('2. 笔记创建 - 自动解析链接', () => {
  const lib = new KnowledgeLibrary();
  
  const { note: note1 } = lib.notes.create({
    title: '目标笔记',
    content: '目标内容'
  });

  const { note: note2 } = lib.notes.create({
    title: '引用笔记',
    content: '请参考 [[目标笔记]] 了解更多'
  });

  assertEqual(note2.outLinks.length, 1, '应该解析出1个链接');
  assertEqual(note2.outLinks[0].targetTitle, '目标笔记', '链接标题应该匹配');
  assertEqual(note2.outLinks[0].targetId, note1.id, '链接目标ID应该匹配');
});

test('3. 笔记创建 - 先写链接后创建目标笔记时自动补全', () => {
  const lib = new KnowledgeLibrary();

  const { note: note1 } = lib.notes.create({
    title: '引用笔记',
    content: '请参考 [[未来笔记]] 了解更多'
  });

  assertEqual(note1.outLinks[0].targetId, '', '初始时目标ID应该为空');

  const { note: note2, fixedLinks } = lib.notes.create({
    title: '未来笔记',
    content: '这是未来的笔记内容'
  });

  assertEqual(fixedLinks.length, 1, '应该修复1个链接');
  assertEqual(fixedLinks[0].sourceNoteId, note1.id, '来源笔记ID应该匹配');

  const updatedNote1 = lib.notes.get(note1.id)!;
  assertEqual(updatedNote1.outLinks[0].targetId, note2.id, '链接目标ID应该被补全');
});

test('4. 笔记更新 - 标题变更后自动修复引用', () => {
  const lib = new KnowledgeLibrary();

  const { note: note1 } = lib.notes.create({
    title: '旧标题',
    content: '内容1'
  });

  const { note: note2 } = lib.notes.create({
    title: '引用笔记',
    content: '请参考 [[旧标题]]'
  });

  assertEqual(note2.outLinks[0].targetTitle, '旧标题', '初始链接标题应该是旧标题');
  assertEqual(note2.outLinks[0].targetId, note1.id, '链接目标ID应该正确');

  const { updatedReferences } = lib.notes.update(note1.id, { title: '新标题' });

  assert(updatedReferences !== undefined, '应该返回更新的引用信息');
  assertEqual(updatedReferences!.updatedSourceNotes.length, 1, '应该更新1个引用');

  const updatedNote2 = lib.notes.get(note2.id)!;
  assert(updatedNote2.content.includes('[[新标题]]'), '内容中的链接应该被更新');
  assertEqual(updatedNote2.outLinks[0].targetTitle, '新标题', '链接标题应该更新');
});

test('5. 笔记更新 - 内容变更后重新解析链接', () => {
  const lib = new KnowledgeLibrary();

  const { note: note1 } = lib.notes.create({
    title: '笔记1',
    content: '内容'
  });

  const { note: note2 } = lib.notes.create({
    title: '笔记2',
    content: '初始内容'
  });

  const { note } = lib.notes.update(note2.id, {
    content: '现在引用 [[笔记1]]'
  });

  assertEqual(note!.outLinks.length, 1, '应该解析出1个链接');
  assertEqual(note!.outLinks[0].targetId, note1.id, '链接目标ID应该正确');
});

test('6. 笔记删除 - 删除后处理引用关系', () => {
  const lib = new KnowledgeLibrary();

  const { note: note1 } = lib.notes.create({
    title: '目标笔记',
    content: '内容'
  });

  const { note: note2 } = lib.notes.create({
    title: '引用笔记',
    content: '引用 [[目标笔记]]'
  });

  const { brokenLinks } = lib.notes.delete(note1.id);

  assertEqual(brokenLinks.length, 1, '应该报告1个断链');
  assertEqual(brokenLinks[0].noteId, note2.id, '断链来源应该正确');

  const updatedNote2 = lib.notes.get(note2.id)!;
  assertEqual(updatedNote2.outLinks[0].targetId, '', '链接目标ID应该被清空');
});

test('7. 收藏功能', () => {
  const lib = new KnowledgeLibrary();

  const { note } = lib.notes.create({
    title: '测试笔记',
    content: '内容',
    isFavorite: false
  });

  assertEqual(note.isFavorite, false, '初始不应该收藏');

  const updated = lib.notes.toggleFavorite(note.id);
  assertEqual(updated!.isFavorite, true, '切换后应该收藏');

  const favorites = lib.notes.getFavorites();
  assertEqual(favorites.length, 1, '收藏列表应该有1篇笔记');
});

test('8. 标签管理 - 基本功能', () => {
  const lib = new KnowledgeLibrary();

  lib.notes.create({ title: '笔记1', content: 'c1', tags: ['javascript', '前端'] });
  lib.notes.create({ title: '笔记2', content: 'c2', tags: ['javascript', '后端'] });
  lib.notes.create({ title: '笔记3', content: 'c3', tags: ['python', '后端'] });

  const allTags = lib.tags.getAll();
  assertEqual(allTags.length, 4, '应该有4个标签');

  const popular = lib.tags.getPopular(2);
  assertEqual(popular[0].name, 'javascript', '最热门应该是javascript');
  assertEqual(popular[0].count, 2, 'javascript应该有2篇');

  const related = lib.tags.getRelated('javascript');
  assert(related.length > 0, '应该有相关标签');

  const searchResults = lib.tags.search('java');
  assertEqual(searchResults.length, 1, '搜索java应该找到javascript');
});

test('9. 全文搜索 - 基本搜索', () => {
  const lib = new KnowledgeLibrary();

  lib.notes.create({ title: 'JavaScript入门', content: 'JavaScript是一种编程语言', tags: ['javascript'] });
  lib.notes.create({ title: 'Python教程', content: 'Python是一种脚本语言', tags: ['python'] });
  lib.notes.create({ title: 'TypeScript指南', content: 'TypeScript是JavaScript的超集', tags: ['typescript', 'javascript'] });

  const results: SearchResult[] = lib.search.query({
    query: 'JavaScript',
    searchInTitle: true,
    searchInContent: true,
    searchInTags: true
  });

  assert(results.length >= 2, '至少应该找到2篇笔记');
  assert(results[0].score >= results[1].score, '结果应该按得分排序');
  assert(results[0].bestSnippet !== undefined, '应该返回摘要片段');
});

test('10. 全文搜索 - 标签过滤', () => {
  const lib = new KnowledgeLibrary();

  lib.notes.create({ title: '笔记1', content: 'javascript content', tags: ['javascript', '前端'] });
  lib.notes.create({ title: '笔记2', content: 'python content', tags: ['python', '后端'] });
  lib.notes.create({ title: '笔记3', content: 'typescript content', tags: ['typescript', '前端'] });

  const results = lib.search.query({
    query: '',
    tagFilters: ['前端'],
    tagFilterMode: 'any'
  });

  assertEqual(results.length, 2, '应该找到2篇前端标签的笔记');
});

test('11. 全文搜索 - 收藏状态过滤', () => {
  const lib = new KnowledgeLibrary();

  const { note: n1 } = lib.notes.create({ title: '笔记1', content: '内容1', isFavorite: true });
  lib.notes.create({ title: '笔记2', content: '内容2', isFavorite: false });

  const results = lib.search.query({
    query: '',
    isFavorite: true
  });

  assertEqual(results.length, 1, '应该只找到收藏的笔记');
  assertEqual(results[0].note.id, n1.id, '应该是笔记1');
});

test('12. 全文搜索 - 时间范围过滤和排序', () => {
  const lib = new KnowledgeLibrary();
  const now = Date.now();

  const { note: n1 } = lib.notes.create({ title: '旧笔记', content: '内容' });
  (lib as any).noteManager['notes'].get(n1.id)!.createdAt = now - 86400000 * 7;
  (lib as any).noteManager['notes'].get(n1.id)!.updatedAt = now - 86400000 * 7;

  const { note: n2 } = lib.notes.create({ title: '新笔记', content: '内容' });
  (lib as any).noteManager['notes'].get(n2.id)!.createdAt = now - 86400000;
  (lib as any).noteManager['notes'].get(n2.id)!.updatedAt = now - 86400000;

  (lib as any).rebuildAllIndexes();

  const results = lib.search.query({
    query: '',
    dateFrom: now - 86400000 * 3,
    dateTo: now,
    sortBy: 'createdAt',
    sortOrder: 'desc'
  });

  assertEqual(results.length, 1, '应该只找到1篇3天内的笔记');
  assertEqual(results[0].note.id, n2.id, '应该是新笔记');
});

test('13. 双向链接 - 入链查询', () => {
  const lib = new KnowledgeLibrary();

  const { note: target } = lib.notes.create({ title: '目标', content: '内容' });
  const { note: source1 } = lib.notes.create({ title: '来源1', content: '引用 [[目标]]' });
  const { note: source2 } = lib.notes.create({ title: '来源2', content: '参考 [[目标]]' });

  const backLinks = lib.relations.getBackLinks(target.id);
  assertEqual(backLinks.length, 2, '应该有2个入链');
});

test('14. 关系图 - 基本构建', () => {
  const lib = new KnowledgeLibrary();

  const { note: n1 } = lib.notes.create({ title: '笔记1', content: '引用 [[笔记2]]', tags: ['tag1'] });
  const { note: n2 } = lib.notes.create({ title: '笔记2', content: '内容', tags: ['tag1', 'tag2'] });

  const graph = lib.relations.getGraph({ includeTags: true });

  assert(graph.nodes.length >= 2, '应该至少有2个笔记节点');
  assert(graph.edges.length >= 1, '应该至少有1条边');
});

test('15. 相似笔记推荐', () => {
  const lib = new KnowledgeLibrary();

  lib.notes.create({
    title: 'JavaScript基础',
    content: 'JavaScript是一种编程语言，使用变量、函数、对象等概念',
    tags: ['javascript', '编程']
  });

  lib.notes.create({
    title: 'Python基础',
    content: 'Python是一种编程语言，使用变量、函数、对象等概念',
    tags: ['python', '编程']
  });

  const { note: target } = lib.notes.create({
    title: 'TypeScript基础',
    content: 'TypeScript是JavaScript的超集，也是一种编程语言',
    tags: ['typescript', 'javascript', '编程']
  });

  const similar = lib.relations.getSimilar(target.id, { limit: 2 });

  assert(similar.length > 0, '应该找到相似笔记');
  assert(similar[0].similarity > 0, '相似度应该大于0');
  assert(similar[0].reasons.length > 0, '应该有相似原因');
});

test('16. 导入导出 - JSON导出导入', () => {
  const lib1 = new KnowledgeLibrary();

  const { note: n1 } = lib1.notes.create({
    title: '导出笔记1',
    content: '内容1',
    tags: ['标签1', '标签2'],
    isFavorite: true
  });

  const { note: n2 } = lib1.notes.create({
    title: '导出笔记2',
    content: '引用 [[导出笔记1]]',
    tags: ['标签3'],
    isFavorite: false
  });

  const json = lib1.io.export({ format: 'json', includeAttachments: true });
  assert(typeof json === 'string', '导出应该是字符串');

  const lib2 = new KnowledgeLibrary();
  const result = lib2.io.importJSON(json as string, {
    conflictStrategy: 'skip',
    keepFavorites: true,
    keepTags: true,
    keepCreationTime: true
  });

  assertEqual(result.successCount, 2, '应该成功导入2篇');
  assertEqual(result.importedNotes.length, 2, '应该返回2篇导入的笔记');
  assertEqual(result.importedNotes[0].title, '导出笔记1', '标题应该正确');
  assertEqual(result.importedNotes[0].isFavorite, true, '收藏状态应该保留');
  assertEqual(result.importedNotes[0].tags.length, 2, '标签应该保留');
});

test('17. 导入导出 - 同名冲突策略 - 跳过', () => {
  const lib = new KnowledgeLibrary();

  lib.notes.create({ title: '冲突笔记', content: '原有内容' });

  const importData = {
    notes: [{
      title: '冲突笔记',
      content: '导入内容',
      tags: ['新标签']
    }]
  };

  const result = lib.io.importJSON(JSON.stringify(importData), {
    conflictStrategy: 'skip'
  });

  assertEqual(result.skippedCount, 1, '应该跳过1篇');
  assertEqual(result.successCount, 0, '不应该有成功导入');
  assertEqual(result.skippedNotes[0].title, '冲突笔记', '应该记录跳过的笔记');

  const existing = lib.notes.getByTitle('冲突笔记')!;
  assertEqual(existing.content, '原有内容', '内容不应该被覆盖');
});

test('18. 导入导出 - 同名冲突策略 - 覆盖', () => {
  const lib = new KnowledgeLibrary();

  const { note: existing } = lib.notes.create({ title: '冲突笔记', content: '原有内容' });

  const importData = {
    notes: [{
      title: '冲突笔记',
      content: '导入内容',
      tags: ['新标签'],
      isFavorite: true
    }]
  };

  const result = lib.io.importJSON(JSON.stringify(importData), {
    conflictStrategy: 'overwrite',
    keepTags: true,
    keepFavorites: true
  });

  assertEqual(result.overwrittenCount, 1, '应该覆盖1篇');
  assertEqual(result.overwrittenNotes[0].oldId, existing.id, '应该记录被覆盖的ID');

  const updated = lib.notes.get(existing.id)!;
  assertEqual(updated.content, '导入内容', '内容应该被覆盖');
  assertEqual(updated.tags[0], '新标签', '标签应该被更新');
  assertEqual(updated.isFavorite, true, '收藏状态应该被更新');
});

test('19. 导入导出 - 同名冲突策略 - 重命名', () => {
  const lib = new KnowledgeLibrary();

  lib.notes.create({ title: '冲突笔记', content: '原有内容' });

  const importData = {
    notes: [{
      title: '冲突笔记',
      content: '导入内容'
    }]
  };

  const result = lib.io.importJSON(JSON.stringify(importData), {
    conflictStrategy: 'rename'
  });

  assertEqual(result.renamedCount, 1, '应该重命名1篇');
  assertEqual(result.renamedNotes[0].oldTitle, '冲突笔记', '应该记录旧标题');
  assert(result.renamedNotes[0].newTitle.startsWith('冲突笔记 ('), '新标题应该包含序号');

  const notes = lib.notes.getAll();
  assertEqual(notes.length, 2, '应该有2篇笔记');
});

test('20. 导入导出 - Markdown导出导入', () => {
  const lib1 = new KnowledgeLibrary();

  const { note: n1 } = lib1.notes.create({
    title: 'Markdown笔记',
    content: '# 标题\n\n这是内容',
    tags: ['markdown'],
    isFavorite: true
  });

  const mdFiles = lib1.io.export({ format: 'markdown', includeAttachments: false }) as { filename: string; content: string }[];
  assert(Array.isArray(mdFiles), '应该返回文件数组');
  assertEqual(mdFiles.length, 1, '应该有1个文件');
  assert(mdFiles[0].filename.endsWith('.md'), '文件名应该以.md结尾');
  assert(mdFiles[0].content.includes('# Markdown笔记'), '内容应该包含标题');

  const lib2 = new KnowledgeLibrary();
  const result = lib2.io.importMarkdown(mdFiles, {
    keepFavorites: true,
    keepTags: true
  });

  assertEqual(result.successCount, 1, '应该成功导入1篇');
  assertEqual(result.importedNotes[0].title, 'Markdown笔记', '标题应该正确');
  assertEqual(result.importedNotes[0].isFavorite, true, '收藏状态应该保留');
  assertEqual(result.importedNotes[0].tags[0], 'markdown', '标签应该保留');
});

test('21. 最近访问 - 基本记录', () => {
  const lib = new KnowledgeLibrary();

  const { note: n1 } = lib.notes.create({ title: '笔记1', content: '内容1' });
  const { note: n2 } = lib.notes.create({ title: '笔记2', content: '内容2' });

  lib.notes.get(n1.id);
  lib.notes.get(n2.id);
  lib.notes.get(n1.id);
  lib.notes.get(n1.id);

  const recent = lib.history.getRecent();
  assertEqual(recent[0].noteId, n1.id, '最近访问应该是n1');
  assertEqual(recent[1].noteId, n2.id, '其次是n2');

  const recentNotes = lib.history.getRecentNotes();
  assertEqual(recentNotes[0].id, n1.id, '最近笔记应该是n1');
});

test('22. 最近访问 - 多次访问计数', () => {
  const lib = new KnowledgeLibrary();

  const { note: n1 } = lib.notes.create({ title: '笔记1', content: '内容' });
  const { note: n2 } = lib.notes.create({ title: '笔记2', content: '内容' });

  lib.notes.get(n1.id);
  lib.notes.get(n1.id);
  lib.notes.get(n1.id);
  lib.notes.get(n2.id);
  lib.notes.get(n2.id);

  const mostVisited = lib.history.getMostVisited({ limit: 2 });
  assertEqual(mostVisited[0].note.id, n1.id, '访问最多的应该是n1');
  assertEqual(mostVisited[0].visitCount, 3, 'n1应该被访问3次');
  assertEqual(mostVisited[1].visitCount, 2, 'n2应该被访问2次');

  const totalCount = lib.history.getVisitCount(n1.id);
  assertEqual(totalCount, 3, '总访问次数应该是3');
});

test('23. 最近访问 - 详细统计', () => {
  const lib = new KnowledgeLibrary();

  const { note: n1 } = lib.notes.create({ title: '笔记1', content: '内容' });

  lib.notes.get(n1.id);
  lib.notes.get(n1.id);
  lib.notes.get(n1.id);

  const stats = lib.history.getVisitStats(n1.id);
  assert(stats !== null, '应该返回统计信息');
  assertEqual(stats!.totalVisits, 3, '总访问次数应该是3');
  assert(stats!.firstVisitAt > 0, '应该有首次访问时间');
  assert(stats!.lastVisitAt >= stats!.firstVisitAt, '最后访问时间应该晚于首次');
});

test('24. 最近访问 - 时间范围统计', () => {
  const lib = new KnowledgeLibrary();
  const now = Date.now();

  const { note: n1 } = lib.notes.create({ title: '笔记1', content: '内容' });

  (lib as any).historyManager['visitHistory'].push(
    { noteId: n1.id, noteTitle: '笔记1', visitedAt: now - 86400000 * 2 },
    { noteId: n1.id, noteTitle: '笔记1', visitedAt: now - 86400000 * 2 },
    { noteId: n1.id, noteTitle: '笔记1', visitedAt: now - 86400000 },
    { noteId: n1.id, noteTitle: '笔记1', visitedAt: now }
  );

  const lastDayCount = lib.history.getVisitCount(n1.id, now - 86400000);
  assertEqual(lastDayCount, 2, '最近24小时应该访问2次');

  const lastWeekCount = lib.history.getVisitCount(n1.id, now - 86400000 * 7);
  assertEqual(lastWeekCount, 4, '最近7天应该访问4次');
});

test('25. 最近访问 - 访问时间线', () => {
  const lib = new KnowledgeLibrary();
  const now = Date.now();

  const { note: n1 } = lib.notes.create({ title: '笔记1', content: '内容' });
  const { note: n2 } = lib.notes.create({ title: '笔记2', content: '内容' });

  (lib as any).historyManager['visitHistory'].push(
    { noteId: n1.id, noteTitle: '笔记1', visitedAt: now },
    { noteId: n2.id, noteTitle: '笔记2', visitedAt: now },
    { noteId: n1.id, noteTitle: '笔记1', visitedAt: now - 86400000 }
  );

  const timeline = lib.history.getTimeline({ groupBy: 'day' });
  assert(timeline.length >= 1, '应该至少有1天的记录');
  assert(timeline[0].count >= 1, '每天应该有访问记录');
  assert(timeline[0].uniqueCount >= 1, '应该有独立访问数');
});

test('26. 缺失链接检测和修复', () => {
  const lib = new KnowledgeLibrary();

  const { note: n1 } = lib.notes.create({
    title: '笔记1',
    content: '引用 [[不存在的笔记]] 和 [[另一个笔记]]'
  });

  const missing = lib.relations.getMissingLinks();
  assertEqual(missing.length, 2, '应该检测到2个缺失链接');

  const { note: n2, fixedLinks } = lib.notes.create({
    title: '不存在的笔记',
    content: '内容'
  });

  assertEqual(fixedLinks.length, 1, '应该修复1个链接');

  const missingAfter = lib.relations.getMissingLinks();
  assertEqual(missingAfter.length, 1, '应该只剩1个缺失链接');
  assertEqual(missingAfter[0].targetTitle, '另一个笔记', '应该是另一个笔记');

  const updatedN1 = lib.notes.get(n1.id)!;
  const fixedLink = updatedN1.outLinks.find(l => l.targetTitle === '不存在的笔记');
  assertEqual(fixedLink!.targetId, n2.id, '链接ID应该被补全');
});

test('27. 搜索结果 - 摘要片段', () => {
  const lib = new KnowledgeLibrary();

  lib.notes.create({
    title: '长文档',
    content: '这是一篇很长的文档。中间有一些重要的内容。我们要找的关键词在这里。还有更多内容...'.repeat(10),
    tags: ['测试']
  });

  const results = lib.search.query({
    query: '关键词',
    enableSnippet: true,
    snippetLength: 50
  });

  assertEqual(results.length, 1, '应该找到1篇');
  assert(results[0].bestSnippet !== undefined, '应该返回最佳摘要');
  assert(results[0].bestSnippet!.includes('关键词'), '摘要应该包含关键词');
  assert(results[0].matches[0].snippet !== undefined, '每个匹配应该有片段');
});

test('28. 孤立笔记检测', () => {
  const lib = new KnowledgeLibrary();

  const { note: linked1 } = lib.notes.create({ title: '链接笔记1', content: '引用 [[链接笔记2]]' });
  const { note: linked2 } = lib.notes.create({ title: '链接笔记2', content: '内容' });
  const { note: orphan } = lib.notes.create({ title: '孤立笔记', content: '没有链接' });

  const orphans = lib.relations.getOrphanNotes();
  assertEqual(orphans.length, 1, '应该有1个孤立笔记');
  assertEqual(orphans[0].id, orphan.id, '应该是孤立笔记');

  const linked = lib.relations.getLinkedNotes();
  assertEqual(linked.length, 2, '应该有2个链接笔记');
});

test('29. 引用关系查询', () => {
  const lib = new KnowledgeLibrary();

  const { note: target } = lib.notes.create({ title: '目标', content: '内容' });
  const { note: source1 } = lib.notes.create({ title: '来源1', content: '引用 [[目标]]' });
  const { note: source2 } = lib.notes.create({ title: '来源2', content: '参考 [[目标]] 和 [[目标]] 两次' });

  const referencesTo = lib.relations.getReferencesTo(target.id);
  assertEqual(referencesTo.length, 2, '应该有2个引用来源');
  assertEqual(referencesTo[0].linkCount, 2, '来源2应该引用2次');
  assertEqual(referencesTo[1].linkCount, 1, '来源1应该引用1次');

  const referencesFrom = lib.relations.getReferencesFrom(source2.id);
  assertEqual(referencesFrom.length, 1, '来源2应该引用1篇笔记');
  assertEqual(referencesFrom[0].linkCount, 2, '应该引用2次');
});

test('30. 数据持久化 - toJSON和fromJSON', () => {
  const lib1 = new KnowledgeLibrary();

  const { note: n1 } = lib1.notes.create({ title: '笔记1', content: '内容1', tags: ['tag1'] });
  const { note: n2 } = lib1.notes.create({ title: '笔记2', content: '内容2', tags: ['tag2'] });

  lib1.notes.get(n1.id);
  lib1.notes.get(n1.id);
  lib1.notes.get(n2.id);

  const data = lib1.toJSON();
  assertEqual(data.notes.length, 2, '应该有2篇笔记');
  assert(data.history.length >= 3, '应该有至少3条访问记录');

  const lib2 = new KnowledgeLibrary();
  lib2.fromJSON(data);

  assertEqual(lib2.notes.getCount(), 2, '应该恢复2篇笔记');
  assertEqual(lib2.history.getVisitCount(n1.id), 2, '应该恢复n1的访问次数');
  assertEqual(lib2.history.getVisitCount(n2.id), 1, '应该恢复n2的访问次数');

  const restoredNote = lib2.notes.get(n1.id)!;
  assertEqual(restoredNote.title, '笔记1', '标题应该恢复');
  assertEqual(restoredNote.tags[0], 'tag1', '标签应该恢复');
});

console.log(`\n=== 测试结果 ===`);
console.log(`通过: ${passed}, 失败: ${failed}`);

if (failures.length > 0) {
  console.log('\n失败的测试:');
  failures.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
} else {
  console.log('\n所有测试通过! 🎉');
}
