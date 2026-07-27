import { unified } from "unified";
import remarkParse from "remark-parse";
import matter from "gray-matter";

export interface MarkdownInstruction {
  content: string;
  lineStart: number;
  lineEnd: number;
  /** `url` of every link/image node inside this instruction. */
  linkTargets: string[];
  /** Value of every inline code span inside this instruction. */
  codeSpans: string[];
}

export interface ParsedMarkdown {
  frontmatter: Record<string, unknown>;
  body: string;
  instructions: MarkdownInstruction[];
}

interface MdNode {
  type: string;
  value?: string;
  url?: string;
  children?: MdNode[];
  position?: {
    start: { line: number };
    end: { line: number };
  };
}

/**
 * The children that belong to this node's own text.
 *
 * A nested list is rendered as a child of its parent `listItem`, but each of
 * its items is also visited as an instruction in its own right. Including it
 * here would splice every child's text into the parent instruction, which
 * inflates token counts and makes duplicate detection and reference
 * extraction compare text that never appears together in the file.
 */
function ownChildren(node: MdNode): MdNode[] {
  const children = Array.isArray(node.children) ? node.children : [];
  return node.type === "listItem"
    ? children.filter((child) => child.type !== "list")
    : children;
}

function collectText(node: MdNode): string {
  if (typeof node.value === "string") {
    return node.type === "inlineCode" ? `\`${node.value}\`` : node.value;
  }
  const children = ownChildren(node);
  if (children.length === 0) {
    return "";
  }
  return children.map(collectText).join(" ").replace(/\s+/g, " ").trim();
}

interface Inline {
  linkTargets: string[];
  codeSpans: string[];
}

function collectInline(node: MdNode, acc: Inline): void {
  if (
    (node.type === "link" || node.type === "image") &&
    typeof node.url === "string"
  ) {
    acc.linkTargets.push(node.url);
  }
  if (node.type === "inlineCode" && typeof node.value === "string") {
    acc.codeSpans.push(node.value);
  }
  for (const child of ownChildren(node)) {
    collectInline(child, acc);
  }
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
        const inline: Inline = { linkTargets: [], codeSpans: [] };
        collectInline(node, inline);
        instructions.push({
          content: text,
          lineStart: node.position.start.line + lineOffset,
          lineEnd: node.position.end.line + lineOffset,
          linkTargets: inline.linkTargets,
          codeSpans: inline.codeSpans,
        });
      }
    }
    // Nested lists are excluded from the parent's text but still visited,
    // so each child item becomes its own instruction exactly once.
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
