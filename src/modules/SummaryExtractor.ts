import { truncate, tokenize } from '../utils';

export class SummaryExtractor {
  private maxLength: number = 200;

  setMaxLength(length: number): void {
    this.maxLength = Math.max(50, length);
  }

  extractSummary(markdown: string, options: {
    maxLength?: number;
    preferFirstParagraph?: boolean;
    includeHeadings?: boolean;
    removeMarkdown?: boolean;
  } = {}): string {
    const {
      maxLength = this.maxLength,
      preferFirstParagraph = true,
      includeHeadings = true,
      removeMarkdown = true
    } = options;

    if (!markdown || !markdown.trim()) {
      return '';
    }

    let content = markdown;

    if (removeMarkdown) {
      content = this.removeMarkdownSyntax(content);
    }

    if (preferFirstParagraph) {
      const firstParagraph = this.getFirstParagraph(content);
      if (firstParagraph) {
        return truncate(firstParagraph, maxLength);
      }
    }

    if (includeHeadings) {
      const headings = this.extractHeadings(markdown);
      if (headings.length > 0) {
        const headingSummary = headings.slice(0, 3).join(' / ');
        if (headingSummary.length > 0) {
          return truncate(headingSummary, maxLength);
        }
      }
    }

    const sentences = this.extractSentences(content);
    if (sentences.length > 0) {
      const summary = this.selectTopSentences(sentences, content, 3);
      return truncate(summary.join(' '), maxLength);
    }

    return truncate(content, maxLength);
  }

  private removeMarkdownSyntax(markdown: string): string {
    return markdown
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/_([^_]+)_/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/^\s*[-*+]\s+/gm, '')
      .replace(/^\s*\d+\.\s+/gm, '')
      .replace(/^\s*>/gm, '')
      .replace(/---+/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private getFirstParagraph(content: string): string {
    const paragraphs = content
      .split(/\n{2,}/)
      .map(p => p.trim())
      .filter(p => p.length > 0);
    
    for (const paragraph of paragraphs) {
      if (paragraph.length > 20 && !paragraph.startsWith('#')) {
        return paragraph.replace(/\n/g, ' ');
      }
    }
    
    return paragraphs[0]?.replace(/\n/g, ' ') || '';
  }

  private extractHeadings(markdown: string): string[] {
    const headingRegex = /^#{1,6}\s+(.+)$/gm;
    const headings: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = headingRegex.exec(markdown)) !== null) {
      headings.push(match[1].trim());
    }

    return headings;
  }

  private extractSentences(content: string): string[] {
    const sentenceEndRegex = /([。！？.!?]|\.\s)/g;
    const sentences: string[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = sentenceEndRegex.exec(content)) !== null) {
      const sentence = content.substring(lastIndex, match.index + match[0].length).trim();
      if (sentence.length > 5) {
        sentences.push(sentence);
      }
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < content.length) {
      const remaining = content.substring(lastIndex).trim();
      if (remaining.length > 5) {
        sentences.push(remaining);
      }
    }

    return sentences;
  }

  private selectTopSentences(sentences: string[], content: string, count: number): string[] {
    const wordFrequency = new Map<string, number>();
    const words = tokenize(content);
    
    for (const word of words) {
      wordFrequency.set(word, (wordFrequency.get(word) || 0) + 1);
    }

    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used', '的', '了', '是', '在', '和', '与', '及', '或', '而', '但', '如果', '因为', '所以', '虽然', '但是', '不', '也', '都', '就', '还', '又', '再', '已', '已经', '曾', '曾经', '正', '正在', '将', '将要', '会', '可以', '能', '能够', '要', '应该', '应当', '必须', '需', '需要', '得', '的话', '等', '等等', '之类', '什么', '怎么', '怎样', '如何', '为什么', '哪', '哪里', '那个', '这个', '这些', '那些', '一个', '一些', '多少', '几', '多少']);

    const scoredSentences = sentences.map((sentence, index) => {
      const sentenceWords = tokenize(sentence);
      let score = 0;
      
      for (const word of sentenceWords) {
        if (!stopWords.has(word)) {
          score += wordFrequency.get(word) || 0;
        }
      }

      if (index === 0) {
        score *= 1.5;
      }
      if (index === sentences.length - 1) {
        score *= 1.2;
      }

      if (sentence.length > 100) {
        score *= 0.8;
      }

      return { sentence, score, index };
    });

    return scoredSentences
      .sort((a, b) => b.score - a.score)
      .slice(0, count)
      .sort((a, b) => a.index - b.index)
      .map(s => s.sentence);
  }

  generateTagsFromContent(markdown: string, maxTags: number = 5): string[] {
    const content = this.removeMarkdownSyntax(markdown);
    const words = tokenize(content);
    const wordFrequency = new Map<string, number>();

    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used', '的', '了', '是', '在', '和', '与', '及', '或', '而', '但', '如果', '因为', '所以', '虽然', '但是', '不', '也', '都', '就', '还', '又', '再', '已', '已经', '曾', '曾经', '正', '正在', '将', '将要', '会', '可以', '能', '能够', '要', '应该', '应当', '必须', '需', '需要', '得', '等', '等等', '之类']);

    for (const word of words) {
      if (word.length >= 2 && !stopWords.has(word)) {
        wordFrequency.set(word, (wordFrequency.get(word) || 0) + 1);
      }
    }

    const tagRegex = /#([^\s#]+)/g;
    let match: RegExpExecArray | null;
    while ((match = tagRegex.exec(markdown)) !== null) {
      const tag = match[1].toLowerCase();
      wordFrequency.set(tag, (wordFrequency.get(tag) || 0) + 5);
    }

    return Array.from(wordFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxTags)
      .map(([word]) => word);
  }

  extractKeywords(markdown: string, maxKeywords: number = 10): { keyword: string; frequency: number }[] {
    const content = this.removeMarkdownSyntax(markdown);
    const words = tokenize(content);
    const wordFrequency = new Map<string, number>();

    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used', '的', '了', '是', '在', '和', '与', '及', '或', '而', '但', '如果', '因为', '所以', '虽然', '但是', '不', '也', '都', '就', '还', '又', '再', '已', '已经', '曾', '曾经', '正', '正在', '将', '将要', '会', '可以', '能', '能够', '要', '应该', '应当', '必须', '需', '需要', '得', '等', '等等', '之类']);

    for (const word of words) {
      if (word.length >= 2 && !stopWords.has(word)) {
        wordFrequency.set(word, (wordFrequency.get(word) || 0) + 1);
      }
    }

    return Array.from(wordFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxKeywords)
      .map(([keyword, frequency]) => ({ keyword, frequency }));
  }

  getReadingTime(markdown: string): { minutes: number; words: number } {
    const content = this.removeMarkdownSyntax(markdown);
    const words = tokenize(content);
    const wordCount = words.length;
    const readingTime = Math.ceil(wordCount / 200);

    return {
      minutes: Math.max(1, readingTime),
      words: wordCount
    };
  }

  clear(): void {
  }
}
