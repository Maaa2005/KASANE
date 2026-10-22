import { unified } from "unified";
import remarkParse from "remark-parse";
import { splitFrontmatter } from "./frontmatter.js";

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
  identifier?: string;
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

/** Nodes whose children are inline text, which already carries its spaces. */
const INLINE_PARENTS = new Set([
  "paragraph",
  "heading",
  "emphasis",
  "strong",
  "delete",
  "link",
  "linkReference",
  "tableCell",
]);

function collectText(node: MdNode): string {
  if (typeof node.value === "string") {
    return node.type === "inlineCode" ? `\`${node.value}\`` : node.value;
  }
  if (node.type === "break") {
    return " ";
  }
  const children = ownChildren(node);
  if (children.length === 0) {
    return "";
  }
  // Joining inline nodes with a space would turn "`npm`;" into "`npm` ;"
  // and "**a**b" into "a b"; blocks such as a list item's paragraphs do
  // need one between them.
  const separator = INLINE_PARENTS.has(node.type) ? "" : " ";
  return children.map(collectText).join(separator).replace(/\s+/g, " ").trim();
}

interface Inline {
  linkTargets: string[];
  codeSpans: string[];
}

/** Link reference definitions (`[id]: docs/guide.md`) keyed by identifier. */
type Definitions = ReadonlyMap<string, string>;

/** Matches the way CommonMark compares labels: case and spacing ignored. */
function normalizeLabel(label: string): string {
  return label.replace(/\s+/g, " ").trim().toLowerCase();
}

function collectDefinitions(node: MdNode, acc: Map<string, string>): void {
  if (
    node.type === "definition" &&
    typeof node.identifier === "string" &&
    typeof node.url === "string"
  ) {
    const key = normalizeLabel(node.identifier);
    // The first definition of a label wins, as in CommonMark.
    if (!acc.has(key)) {
      acc.set(key, node.url);
    }
  }
  for (const child of node.children ?? []) {
    collectDefinitions(child, acc);
  }
}

function collectInline(node: MdNode, acc: Inline, definitions: Definitions): void {
  if (
    (node.type === "link" || node.type === "image") &&
    typeof node.url === "string"
  ) {
    acc.linkTargets.push(node.url);
  }
  // `[guide][g]` with `[g]: docs/guide.md` elsewhere in the file points at
  // the definition's URL; the reference itself carries only the label.
  if (
    (node.type === "linkReference" || node.type === "imageReference") &&
    typeof node.identifier === "string"
  ) {
    const url = definitions.get(normalizeLabel(node.identifier));
    if (url !== undefined) {
      acc.linkTargets.push(url);
    }
  }
  if (node.type === "inlineCode" && typeof node.value === "string") {
    acc.codeSpans.push(node.value);
  }
  for (const child of ownChildren(node)) {
    collectInline(child, acc, definitions);
  }
}

export function parseMarkdown(content: string): ParsedMarkdown {
  const { data, body, lineOffset } = splitFrontmatter(content);

  const tree = unified().use(remarkParse).parse(body) as unknown as MdNode;
  const instructions: MarkdownInstruction[] = [];
  const definitions = new Map<string, string>();
  collectDefinitions(tree, definitions);

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
        collectInline(node, inline, definitions);
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
