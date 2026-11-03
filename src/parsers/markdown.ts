import { unified } from "unified";
import remarkParse from "remark-parse";
import { splitFrontmatter } from "./frontmatter.js";
import { commandsInCodeBlock } from "./code-block.js";

export interface MarkdownInstruction {
  content: string;
  lineStart: number;
  lineEnd: number;
  /** `url` of every link/image node inside this instruction. */
  linkTargets: string[];
  /** Value of every inline code span inside this instruction. */
  codeSpans: string[];
  /** Claude Code `@path` imports in this instruction's own text. */
  imports: string[];
  /** Whether the instruction is nothing but `@path` imports. */
  importsOnly: boolean;
  /** Whether the instruction is a command written in a code block. */
  inCodeBlock: boolean;
}

export interface ParsedMarkdown {
  frontmatter: Record<string, unknown>;
  /**
   * The frontmatter is not valid YAML and was read line by line instead,
   * as Cursor reads it. Claude Code ignores such frontmatter.
   */
  looseFrontmatter: boolean;
  body: string;
  instructions: MarkdownInstruction[];
  /** Every Claude Code `@path` import in the file, headings included. */
  imports: string[];
}

interface MdNode {
  type: string;
  value?: string;
  /** The info string's first word on a `code` node. */
  lang?: string | null;
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
 * extraction compare text that never appears together in the file. A code
 * block in a list item is left out for the same reason: its commands become
 * instructions of their own.
 */
function ownChildren(node: MdNode): MdNode[] {
  const children = Array.isArray(node.children) ? node.children : [];
  return node.type === "listItem"
    ? children.filter((child) => child.type !== "list" && child.type !== "code")
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

/**
 * A Claude Code `@path` import: an `@` at the start of a text run or after
 * whitespace, up to the next space that is not escaped with a backslash.
 * Only text nodes are searched, so code spans and fenced code blocks are
 * skipped, as Claude Code skips them.
 */
const IMPORT_PATTERN = /(^|\s)@((?:\\ |\S)+)/g;

/** A path wrapped in quotes is not imported, with or without escapes. */
function isQuoted(importPath: string): boolean {
  return /^["']/.test(importPath);
}

function importsInText(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(IMPORT_PATTERN)) {
    if (isQuoted(match[2])) continue;
    found.push(match[2].replace(/\\ /g, " "));
  }
  return found;
}

function collectImports(
  node: MdNode,
  children: (node: MdNode) => MdNode[],
  acc: string[],
): void {
  if (node.type === "text" && typeof node.value === "string") {
    acc.push(...importsInText(node.value));
  }
  for (const child of children(node)) {
    collectImports(child, children, acc);
  }
}

function textWithoutImports(node: MdNode): string {
  if (node.type === "text") {
    return (node.value ?? "").replace(
      IMPORT_PATTERN,
      (match: string, lead: string, importPath: string) =>
        isQuoted(importPath) ? match : lead,
    );
  }
  if (typeof node.value === "string") {
    return node.value;
  }
  return ownChildren(node).map(textWithoutImports).join("");
}

/**
 * One instruction per command in a code block. Each is written as inline
 * code, so the rules read it as a command the way they read `pnpm test` in
 * a sentence; normalizing drops the backticks, so the same command in a
 * list item of one file and a code block of another compares equal. Paths in
 * a command are not references: a command names the files it creates too.
 */
function codeBlockInstructions(
  lang: string | null | undefined,
  value: string,
  position: NonNullable<MdNode["position"]>,
  lineOffset: number,
): MarkdownInstruction[] {
  // A fenced block starts with its opening fence; an indented one has none.
  const spanLines = position.end.line - position.start.line + 1;
  const valueLines = value === "" ? 0 : value.split("\n").length;
  const firstLine =
    position.start.line + lineOffset + (spanLines > valueLines ? 1 : 0);

  return commandsInCodeBlock(lang, value, firstLine).map((command) => ({
    // A backtick in the command would end the code span early.
    content: command.command.includes("`")
      ? command.command
      : `\`${command.command}\``,
    lineStart: command.lineStart,
    lineEnd: command.lineEnd,
    linkTargets: [],
    codeSpans: [],
    imports: [],
    importsOnly: false,
    inCodeBlock: true,
  }));
}

export function parseMarkdown(content: string): ParsedMarkdown {
  const { data, body, lineOffset, loose } = splitFrontmatter(content);

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
        const imports: string[] = [];
        collectImports(node, ownChildren, imports);
        instructions.push({
          content: text,
          lineStart: node.position.start.line + lineOffset,
          lineEnd: node.position.end.line + lineOffset,
          linkTargets: inline.linkTargets,
          codeSpans: inline.codeSpans,
          imports,
          importsOnly:
            imports.length > 0 && textWithoutImports(node).trim() === "",
          inCodeBlock: false,
        });
      }
    }
    if (node.type === "code" && node.position && typeof node.value === "string") {
      instructions.push(
        ...codeBlockInstructions(node.lang, node.value, node.position, lineOffset),
      );
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

  const imports: string[] = [];
  collectImports(tree, (node) => node.children ?? [], imports);

  return {
    frontmatter: data,
    looseFrontmatter: loose,
    body,
    instructions,
    imports,
  };
}
