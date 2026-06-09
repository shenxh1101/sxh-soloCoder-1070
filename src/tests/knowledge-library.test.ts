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

test('31. 导入导出完整性 - JSON往返保留所有元数据', () => {
  const lib1 = new KnowledgeLibrary();
  const createdAt = Date.now() - 86400000;
  const updatedAt = Date.now() - 3600000;

  const { note: n1 } = lib1.notes.create({
    title: '完整元数据测试',
    content: '测试内容 [[另一篇]]',
    tags: ['重要', '测试'],
    isFavorite: true,
    summary: '自定义摘要',
    attachments: [
      { name: 'file.pdf', type: 'application/pdf', size: 1024, path: '/files/file.pdf' }
    ],
    metadata: { priority: 'high', author: 'test' },
    createdAt,
    updatedAt
  });

  const jsonStr = lib1.io.export({ format: 'json', includeAttachments: true }) as string;

  const lib2 = new KnowledgeLibrary();
  const result = lib2.io.importJSON(jsonStr, { conflictStrategy: 'overwrite', keepMetadata: true });

  assertEqual(result.importedNotes.length, 1, '应该导入1篇');
  const importedNote = result.importedNotes[0];

  assertEqual(importedNote.title, '完整元数据测试', '标题应该保留');
  assertEqual(importedNote.tags.length, 2, '标签应该保留');
  assertEqual(importedNote.tags[0], '重要', '标签内容应该保留');
  assertEqual(importedNote.isFavorite, true, '收藏应该保留');
  assertEqual(importedNote.summary, '自定义摘要', '摘要应该保留');
  assertEqual(importedNote.attachments.length, 1, '附件应该保留');
  assertEqual(importedNote.attachments[0].name, 'file.pdf', '附件名应该保留');
  assertEqual((importedNote.metadata as any)?.priority, 'high', '自定义信息应该保留');
  assertEqual(importedNote.createdAt, createdAt, '创建时间应该保留');
  assertEqual(importedNote.updatedAt, updatedAt, '更新时间应该保留');

  const queried = lib2.notes.get(importedNote.id)!;
  assertEqual(queried.title, '完整元数据测试', '查询应该能找到');
  assertEqual(queried.isFavorite, true, '查询的收藏状态应该正确');
});

test('32. 备份包 - 创建和恢复', () => {
  const lib1 = new KnowledgeLibrary();

  const { note: n1 } = lib1.notes.create({ title: '备份笔记1', content: '内容1', tags: ['tag1'], isFavorite: true });
  const { note: n2 } = lib1.notes.create({ title: '备份笔记2', content: '引用 [[备份笔记1]]', tags: ['tag2'] });

  lib1.notes.get(n1.id);
  lib1.notes.get(n2.id);
  lib1.notes.get(n1.id);

  const backup = lib1.io.createBackup({ includeAttachments: true, includeHistory: true });

  assertEqual(backup.version, '1.0.0', '备份版本应该正确');
  assertEqual(backup.notes.length, 2, '应该包含2篇笔记');
  assert(backup.history.length >= 2, '应该包含访问历史');
  assertEqual(backup.stats.noteCount, 2, '统计应该正确');
  assert(backup.exportedAt > 0, '应该有导出时间');

  const lib2 = new KnowledgeLibrary();
  const result = lib2.io.restoreBackup(backup, { keepMetadata: true });

  assertEqual(result.importedNotes.length, 2, '应该恢复2篇');
  assertEqual(lib2.notes.getCount(), 2, '总笔记数应该为2');
  assert(lib2.history.getVisitCount(n1.id) >= 2, '历史记录应该恢复');

  const restored = lib2.notes.getByTitle('备份笔记1');
  assert(restored !== null, '应该能按标题找到');
  assertEqual(restored!.isFavorite, true, '收藏应该恢复');
});

test('33. 导入预览 - JSON导入预览', () => {
  const lib = new KnowledgeLibrary();
  lib.notes.create({ title: '已存在', content: '旧内容', tags: ['old'] });

  const importData = {
    version: '1.0.0',
    notes: [
      { title: '已存在', content: '新内容', tags: ['new'] },
      { title: '新增笔记', content: '新的内容' }
    ]
  };

  const preview = lib.io.previewImportJSON(JSON.stringify(importData), { conflictStrategy: 'overwrite' });

  assertEqual(preview.items.length, 2, '应该预览2条');
  assertEqual(preview.summary.total, 2, '总数应该正确');
  assertEqual(preview.summary.toOverwrite, 1, '应该有1条覆盖');
  assertEqual(preview.summary.toCreate, 1, '应该有1条新增');

  const overwriteItem = preview.items.find(i => i.action === 'overwrite')!;
  assert(overwriteItem.existingId !== undefined, '应该有现有ID');

  const createItem = preview.items.find(i => i.action === 'create')!;
  assertEqual(createItem.title, '新增笔记', '应该显示新增标题');
});

test('34. 导入预览 - Markdown导入预览', () => {
  const lib = new KnowledgeLibrary();
  lib.notes.create({ title: '冲突笔记', content: '已有内容' });

  const mdFiles = [
    { filename: '冲突笔记.md', content: '# 冲突笔记\n\n新内容' },
    { filename: '全新笔记.md', content: '# 全新笔记\n\n全新内容' }
  ];

  const preview = lib.io.previewImportMarkdown(mdFiles, { conflictStrategy: 'skip' });

  assertEqual(preview.summary.toSkip, 1, '应该有1条跳过');
  assertEqual(preview.summary.toCreate, 1, '应该有1条新增');
});

test('35. 关系图筛选 - 按标签和收藏筛选', () => {
  const lib = new KnowledgeLibrary();

  const { note: n1 } = lib.notes.create({ title: '技术文档', content: '[[API参考]]', tags: ['技术', '重要'], isFavorite: true });
  const { note: n2 } = lib.notes.create({ title: 'API参考', content: '内容', tags: ['技术'] });
  const { note: n3 } = lib.notes.create({ title: '生活记录', content: '内容', tags: ['生活'], isFavorite: true });
  const { note: n4 } = lib.notes.create({ title: '随笔', content: '内容' });

  const techGraph = lib.relations.getFilteredGraph({ tagFilters: ['技术'] });
  assertEqual(techGraph.nodes.length, 2, '技术标签图应该有2个节点');

  const favGraph = lib.relations.getFilteredGraph({ isFavorite: true });
  assertEqual(favGraph.nodes.length, 2, '收藏图应该有2个节点');

  const techFavGraph = lib.relations.getFilteredGraph({ tagFilters: ['技术'], isFavorite: true });
  assertEqual(techFavGraph.nodes.length, 1, '技术+收藏应该有1个节点');
  assertEqual(techFavGraph.nodes[0].title, '技术文档', '应该是技术文档');
});

test('36. 图分析 - 孤立节点、断链节点、中心节点', () => {
  const lib = new KnowledgeLibrary();

  const { note: center } = lib.notes.create({ title: '中心节点', content: '[[叶子1]] [[叶子2]] [[叶子3]]' });
  const { note: leaf1 } = lib.notes.create({ title: '叶子1', content: '[[中心节点]]' });
  const { note: leaf2 } = lib.notes.create({ title: '叶子2', content: '[[中心节点]]' });
  const { note: leaf3 } = lib.notes.create({ title: '叶子3', content: '内容' });
  const { note: orphan } = lib.notes.create({ title: '孤立节点', content: '没有链接' });
  const { note: broken } = lib.notes.create({ title: '断链节点', content: '[[不存在的笔记]]' });

  const analysis = lib.relations.analyzeGraph();

  assertEqual(analysis.stats.totalNodes, 6, '总节点数应该是6');
  assert(analysis.stats.totalEdges >= 4, '总边数应该>=4');

  assertEqual(analysis.orphanNodes.length, 1, '应该有1个孤立节点');
  assertEqual(analysis.orphanNodes[0].title, '孤立节点', '孤立节点应该正确');

  assertEqual(analysis.brokenLinkNodes.length, 1, '应该有1个断链节点');
  assertEqual(analysis.brokenLinkNodes[0].note.title, '断链节点', '断链节点应该正确');

  assertEqual(analysis.centralNodes.length >= 1, true, '应该有中心节点');
  assertEqual(analysis.centralNodes[0].note.title, '中心节点', '第一个中心节点应该是中心节点');
  assert(analysis.centralNodes[0].centrality > 0, '中心性应该大于0');
});

test('37. 搜索增强 - 分页和游标', () => {
  const lib = new KnowledgeLibrary();

  for (let i = 1; i <= 15; i++) {
    lib.notes.create({ title: `笔记${i}`, content: `包含关键词的内容 ${i}` });
  }

  const page1 = lib.search.queryPaginated({ query: '关键词', limit: 5 });
  assertEqual(page1.results.length, 5, '第一页应该有5条');
  assertEqual(page1.total, 15, '总数应该是15');
  assertEqual(page1.hasMore, true, '应该有更多');
  assert(page1.cursor.cacheKey !== undefined, '应该有游标');

  const page2 = lib.search.continueSearch(page1.cursor.cacheKey);
  assert(page2 !== null, '应该能继续分页');
  assertEqual(page2!.results.length, 5, '第二页应该有5条');
  assertEqual(page2!.cursor.offset, 10, '下一页偏移应该是10');

  const page3 = lib.search.continueSearch(page2!.cursor.cacheKey);
  assert(page3 !== null, '应该能继续分页');
  assertEqual(page3!.results.length, 5, '第三页应该有5条');
  assertEqual(page3!.hasMore, false, '第三页应该没有更多');
});

test('38. 搜索增强 - 高亮文本和字段信息', () => {
  const lib = new KnowledgeLibrary();

  lib.notes.create({ title: 'JavaScript入门', content: 'JavaScript是一种编程语言', tags: ['javascript', '编程'] });

  const results = lib.search.queryEnhanced({ query: 'JavaScript' });

  assert(results.length > 0, '应该有搜索结果');
  assert(results[0].matches.length > 0, '应该有匹配');

  const titleMatch = results[0].matches.find(m => m.field === 'title');
  assert(titleMatch !== undefined, '应该有标题匹配');
  assert(titleMatch!.highlightedText.includes('<mark>'), '标题应该有高亮');
  assert(titleMatch!.matchedText.toLowerCase().includes('javascript'), '应该匹配正确的文本');

  const contentMatch = results[0].matches.find(m => m.field === 'content');
  assert(contentMatch !== undefined, '应该有内容匹配');
  assertEqual(contentMatch!.field, 'content', '字段应该正确');
  assert(contentMatch!.snippet !== undefined, '应该有片段');
});

test('39. 搜索筛选条件 - 保存、使用、热度统计', () => {
  const lib = new KnowledgeLibrary();

  lib.notes.create({ title: '技术笔记1', content: '内容', tags: ['技术'] });
  lib.notes.create({ title: '技术笔记2', content: '内容', tags: ['技术'] });
  lib.notes.create({ title: '生活笔记', content: '内容', tags: ['生活'] });

  const filter1 = lib.search.saveFilter('技术收藏', {
    query: '',
    tagFilters: ['技术'],
    isFavorite: false,
    sortBy: 'updatedAt',
    sortOrder: 'desc'
  });

  assertEqual(filter1.name, '技术收藏', '名称应该正确');
  assertEqual(filter1.options.tagFilters?.[0], '技术', '筛选条件应该正确');
  assertEqual(filter1.useCount, 0, '使用次数应该是0');

  const allFilters = lib.search.getSavedFilters();
  assertEqual(allFilters.length, 1, '应该有1个已保存筛选');

  const results1 = lib.search.queryWithFilter(filter1.id);
  assert(results1 !== null, '使用筛选应该返回结果');
  assertEqual(results1!.length, 2, '应该返回2篇技术笔记');

  const results2 = lib.search.queryWithFilter(filter1.id, { isFavorite: true });
  assert(results2 !== null, '覆盖选项应该有效');
  assertEqual(results2!.length, 0, '覆盖收藏筛选后应该0条');

  const updatedFilter = lib.search.getSavedFilter(filter1.id);
  assert(updatedFilter !== undefined, '应该能获取筛选');
  assertEqual(updatedFilter!.useCount, 2, '使用次数应该是2');

  const popular = lib.search.getPopularFilters(5);
  assertEqual(popular.length, 1, '热门筛选应该有1个');
  assertEqual(popular[0].useCount, 2, '热门筛选使用次数应该正确');

  const deleted = lib.search.deleteFilter(filter1.id);
  assertEqual(deleted, true, '删除应该成功');
  assertEqual(lib.search.getSavedFilters().length, 0, '删除后应该为空');
});

test('40. 导入覆盖时附件同步更新', () => {
  const lib = new KnowledgeLibrary();

  const { note: original } = lib.notes.create({
    title: '附件测试',
    content: '内容',
    attachments: [
      { name: 'old.pdf', type: 'application/pdf', size: 1000, path: '/old.pdf' }
    ]
  });

  assertEqual(original.attachments.length, 1, '初始附件1个');

  const updatedData = {
    version: '1.0.0',
    notes: [{
      title: '附件测试',
      content: '更新后的内容',
      attachments: [
        { id: 'new1', name: 'new.pdf', type: 'application/pdf', size: 2000, path: '/new.pdf' },
        { id: 'new2', name: 'image.png', type: 'image/png', size: 500, path: '/image.png' }
      ]
    }]
  };

  const result = lib.io.importJSON(JSON.stringify(updatedData), {
    conflictStrategy: 'overwrite',
    keepMetadata: true
  });

  assertEqual(result.overwrittenCount, 1, '应该覆盖1篇');

  const updatedNote = lib.notes.get(original.id)!;
  assertEqual(updatedNote.attachments.length, 2, '附件应该更新为2个');
  assertEqual(updatedNote.attachments[0].name, 'new.pdf', '第一个附件应该是new.pdf');
  assertEqual(updatedNote.attachments[1].name, 'image.png', '第二个附件应该是image.png');
  assertEqual(updatedNote.content, '更新后的内容', '内容应该更新');
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
