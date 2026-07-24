import { unified } from "unified";
import remarkParse from "remark-parse";
import matter from "gray-matter";

export interface MarkdownInstruction {
  content: string;
  lineStart: number;
  lineEnd: number;
}

export interface ParsedMarkdown {
  frontmatter: Record<string, unknown>;
  body: string;
  instructions: MarkdownInstruction[];
}

interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
  position?: {
    start: { line: number };
    end: { line: number };
  };
}

function collectText(node: MdNode): string {
  if (typeof node.value === "string") {
    return node.type === "inlineCode" ? `\`${node.value}\`` : node.value;
  }
  if (!Array.isArray(node.children)) {
    return "";
  }
  return node.children.map(collectText).join(" ").replace(/\s+/g, " ").trim();
}

function countLeadingLines(prefix: string): number {
  return (prefix.match(/\n/g) ?? []).length;
}

export function parseMarkdown(content: string): ParsedMarkdown {
  const { data, content: body } = matter(content);
  const lineOffset = countLeadingLines(
    content.slice(0, content.length - body.length),
  );

  const tree = unified().use(remarkParse).parse(body) as unknown as MdNode;
  const instructions: MarkdownInstruction[] = [];

  const visit = (node: MdNode, parentType?: string): void => {
    // A paragraph directly inside a listItem is the item's own content,
    // not a separate instruction — count the listItem once, not both.
    const isInstruction =
      node.type === "listItem" ||
      (node.type === "paragraph" && parentType !== "listItem");

    if (isInstruction && node.position) {
      const text = collectText(node);
      if (text.length > 0) {
        instructions.push({
          content: text,
          lineStart: node.position.start.line + lineOffset,
          lineEnd: node.position.end.line + lineOffset,
        });
      }
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        visit(child, node.type);
      }
    }
  };

  visit(tree);

  return {
    frontmatter: data,
    body,
    instructions,
  };
}
