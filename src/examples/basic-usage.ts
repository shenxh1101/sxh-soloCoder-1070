import { KnowledgeLibrary } from '../index';
import type { Note, SearchResult, SimilarNote, RelationGraph } from '../types';

console.log('=== 知识管理类库使用示例 ===\n');

const library = new KnowledgeLibrary({
  autoParseLinks: true,
  autoGenerateSummary: true,
  summaryMaxLength: 150,
  maxRecentVisits: 20,
  similarityThreshold: 0.15
});

console.log('1. 创建笔记...');

const { note: note1 } = library.notes.create({
  title: 'JavaScript 基础入门',
  content: `JavaScript 是一种轻量级的编程语言，广泛用于 Web 开发。

## 变量声明

使用 let、const 和 var 声明变量。const 声明的变量不能重新赋值。

## 数据类型

JavaScript 支持多种数据类型，包括：
- 基本类型：string, number, boolean, null, undefined, symbol
- 引用类型：object, array, function

更多信息请参考 [[JavaScript 高级教程]]。

#javascript #编程 #前端`,
  tags: ['javascript', '编程', '前端'],
  isFavorite: true
});

const { note: note2 } = library.notes.create({
  title: 'JavaScript 高级教程',
  content: `本教程深入讲解 JavaScript 的高级特性。

## 闭包

闭包是指有权访问另一个函数作用域中变量的函数。

## 原型链

JavaScript 通过原型链实现继承。每个对象都有一个 __proto__ 属性指向其原型。

## 异步编程

Promise 和 async/await 是现代 JavaScript 异步编程的核心。

相关内容：[[JavaScript 基础入门]]、[[TypeScript 入门指南]]

#javascript #高级 #编程`,
  tags: ['javascript', '高级', '编程'],
  isFavorite: false
});

const { note: note3 } = library.notes.create({
  title: 'TypeScript 入门指南',
  content: `TypeScript 是 JavaScript 的超集，添加了可选的静态类型和基于类的面向对象编程。

## 类型注解

TypeScript 允许为变量添加类型注解：

\`\`\`typescript
let name: string = "Hello";
let age: number = 25;
\`\`\`

## 接口

接口定义了对象的形状：

\`\`\`typescript
interface User {
  name: string;
  age: number;
}
\`\`\`

参考 [[JavaScript 高级教程]] 了解更多。

#typescript #javascript #前端`,
  tags: ['typescript', 'javascript', '前端']
});

const { note: note4 } = library.notes.create({
  title: 'React 开发实践',
  content: `React 是一个用于构建用户界面的 JavaScript 库。

## 组件

React 应用由组件构成。组件可以是函数组件或类组件。

## Hooks

React Hooks 让你在不编写 class 的情况下使用 state 以及其他的 React 特性。

常用的 Hooks：
- useState
- useEffect
- useContext
- useReducer

#react #前端 #javascript`,
  tags: ['react', '前端', 'javascript']
});

console.log(`  已创建 ${library.notes.getCount()} 篇笔记\n`);

console.log('2. 笔记自动生成的摘要：');
for (const note of [note1, note2, note3, note4]) {
  const n = library.notes.get(note.id)!;
  console.log(`  - "${n.title}": ${n.summary || '(无摘要)'}`);
}
console.log('');

console.log('3. 双向链接解析结果：');
console.log(`  "${note1.title}" 的出链:`, note1.outLinks.map(l => l.targetTitle));
console.log(`  "${note2.title}" 的入链:`, library.relations.getBackLinks(note2.id).map(l => l.targetTitle));
console.log(`  "${note3.title}" 的入链:`, library.relations.getBackLinks(note3.id).map(l => l.targetTitle));
console.log('');

console.log('4. 标签系统：');
console.log('  所有标签:', library.tags.getNames());
console.log('  热门标签:', library.tags.getPopular(5).map(t => `${t.name}(${t.count})`));
console.log('  标签云:', library.tags.getCloud().map(t => `${t.name}(${Math.round(t.weight * 100)}%)`));
console.log('');

console.log('5. 全文搜索：');
const searchResults: SearchResult[] = library.search.query({
  query: 'javascript',
  searchInTitle: true,
  searchInContent: true,
  searchInTags: true,
  enableHighlight: true
});
console.log(`  搜索 "javascript" 找到 ${searchResults.length} 条结果：`);
for (const result of searchResults) {
  console.log(`  - ${result.note.title} (得分: ${result.score})`);
  console.log(`    匹配: ${result.matches.map(m => `${m.field}: ${m.matchedText}`).join(', ')}`);
}
console.log('');

console.log('6. 相似笔记推荐：');
const similarNotes: SimilarNote[] = library.relations.getSimilar(note1.id, { limit: 3 });
console.log(`  与 "${note1.title}" 相似的笔记：`);
for (const similar of similarNotes) {
  console.log(`  - ${similar.note.title} (相似度: ${Math.round(similar.similarity * 100)}%)`);
  console.log(`    原因: ${similar.reasons.join('; ')}`);
}
console.log('');

console.log('7. 引用关系查询：');
console.log(`  "${note2.title}" 被哪些笔记引用：`);
const refsTo = library.relations.getReferencesTo(note2.id);
for (const ref of refsTo) {
  console.log(`  - ${ref.noteTitle} (${ref.linkCount} 次引用)`);
}
console.log(`  "${note1.title}" 引用了哪些笔记：`);
const refsFrom = library.relations.getReferencesFrom(note1.id);
for (const ref of refsFrom) {
  console.log(`  - ${ref.noteTitle} (${ref.linkCount} 次引用)`);
}
console.log('');

console.log('8. 关系图构建：');
const graph: RelationGraph = library.relations.getGraph({ includeTags: true });
console.log(`  关系图包含 ${graph.nodes.length} 个节点, ${graph.edges.length} 条边`);
console.log('  节点:');
for (const node of graph.nodes.slice(0, 8)) {
  console.log(`    - [${node.type}] ${node.title}`);
}
console.log('');

console.log('9. 最近访问记录：');
library.notes.get(note1.id);
library.notes.get(note2.id);
library.notes.get(note1.id);
library.notes.get(note3.id);
console.log('  最近访问的笔记：');
const recentVisits = library.history.getRecentNotes(5);
for (const recent of recentVisits) {
  console.log(`  - ${recent.title}`);
}
console.log(`  访问最多的笔记：`);
const mostVisited = library.history.getMostVisited({ limit: 3 });
for (const mv of mostVisited) {
  console.log(`  - ${mv.note.title} (${mv.visitCount} 次)`);
}
console.log('');

console.log('10. 收藏功能：');
console.log('  收藏的笔记：', library.notes.getFavorites().map(n => n.title));
library.notes.toggleFavorite(note3.id);
console.log('  切换收藏后：', library.notes.getFavorites().map(n => n.title));
console.log('');

console.log('11. Markdown 摘要提取：');
const sampleMarkdown = `# 测试文档

这是第一篇内容丰富的段落，包含了很多重要的信息。我们可以从这里提取摘要。

## 第二部分

这是第二篇的内容，同样包含有价值的信息。

## 第三部分

最后这部分是总结。`;

const summary = library.summary.extract(sampleMarkdown, { maxLength: 100 });
console.log('  原文长度:', sampleMarkdown.length, '字符');
console.log('  提取的摘要:', summary);
console.log('  自动生成的标签:', library.summary.generateTags(sampleMarkdown, 5));
console.log('  阅读时间:', library.summary.getReadingTime(sampleMarkdown));
console.log('');

console.log('12. 导入导出：');
const jsonExport = library.io.export({ format: 'json', includeAttachments: true });
console.log('  JSON 导出长度:', typeof jsonExport === 'string' ? jsonExport.length : 'N/A', '字符');

const mdExport = library.io.export({ format: 'markdown', includeAttachments: false });
console.log('  Markdown 导出文件数:', Array.isArray(mdExport) ? mdExport.length : 'N/A');
if (Array.isArray(mdExport) && mdExport.length > 0) {
  console.log('  第一个文件:', mdExport[0].filename);
}
console.log('');

console.log('13. 更新笔记内容（自动重新解析链接和摘要）：');
library.notes.update(note4.id, {
  content: `React 是一个用于构建用户界面的 JavaScript 库。

## 组件

React 应用由组件构成。组件可以是函数组件或类组件。

## Hooks

React Hooks 让你在不编写 class 的情况下使用 state 以及其他的 React 特性。

常用的 Hooks：
- useState
- useEffect
- useContext
- useReducer

参考 [[TypeScript 入门指南]] 了解类型系统。

#react #前端 #javascript`
});
const updatedNote = library.notes.get(note4.id)!;
console.log(`  "${note4.title}" 新的出链:`, updatedNote.outLinks.map(l => l.targetTitle));
console.log(`  更新后的摘要: ${updatedNote.summary}`);
console.log('');

console.log('14. 删除笔记：');
console.log('  删除前笔记数:', library.notes.getCount());
library.notes.delete(note4.id);
console.log('  删除后笔记数:', library.notes.getCount());
console.log('');

console.log('15. 孤立笔记检测：');
console.log('  孤立笔记（无入链无出链）:', library.relations.getOrphanNotes().map(n => n.title));
console.log('  有链接的笔记:', library.relations.getLinkedNotes().map(n => n.title));
console.log('');

console.log('16. 数据持久化：');
const savedData = library.toJSON();
console.log('  序列化数据包含:', savedData.notes.length, '篇笔记,', savedData.history.length, '条访问记录');

library.clear();
console.log('  清空后笔记数:', library.notes.getCount());

library.fromJSON(savedData);
console.log('  恢复后笔记数:', library.notes.getCount());
console.log('');

console.log('=== 示例运行完成 ===');
console.log('');
console.log('API 接口组织说明：');
console.log('  1. notes - 笔记管理：create, get, getAll, update, delete, toggleFavorite, addAttachment 等');
console.log('  2. tags - 标签管理：getAll, getPopular, getRelated, getCloud, search 等');
console.log('  3. search - 全文搜索：query, autocomplete, getStats');
console.log('  4. relations - 关系图与推荐：getBackLinks, getReferencesTo, getGraph, getSimilar, findPath 等');
console.log('  5. io - 导入导出：export, importJSON, importMarkdown');
console.log('  6. history - 最近访问：getRecent, getMostVisited, getTimeline');
console.log('  7. attachments - 附件索引：getAll, getByNote, getByType, search 等');
console.log('  8. summary - 摘要提取：extract, generateTags, getReadingTime');
