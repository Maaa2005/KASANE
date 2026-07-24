import type {
  AgentType,
  AnalysisContext,
  ContextInstruction,
  Diagnostic,
  DiffConflict,
  DiffResult,
} from "./types.js";
import { resolveEffectiveContext } from "./resolver.js";
import { extractMentionedManagers } from "../utils/commands.js";

export interface DiffOptions {
  agents: AgentType[];
  targetPath?: string;
}

function detectPackageManagerConflict(
  perAgent: Record<string, ContextInstruction[]>,
): DiffConflict | null {
  const values: Partial<Record<AgentType, string>> = {};

  for (const [agent, instructions] of Object.entries(perAgent)) {
    const mentioned = new Set<string>();
    for (const instruction of instructions) {
      for (const manager of extractMentionedManagers(instruction.content)) {
        mentioned.add(manager);
      }
    }
    if (mentioned.size === 1) {
      values[agent as AgentType] = [...mentioned][0];
    }
  }

  const distinctValues = new Set(Object.values(values));
  if (distinctValues.size < 2) {
    return null;
  }

  return { category: "Package manager", values };
}

export function computeDiff(
  context: AnalysisContext,
  diagnostics: Diagnostic[],
  options: DiffOptions,
): DiffResult {
  const perAgent: Record<string, ReturnType<typeof resolveEffectiveContext>> = {};
  for (const agent of options.agents) {
    perAgent[agent] = resolveEffectiveContext(context, diagnostics, {
      agent,
      targetPath: options.targetPath,
    });
  }

  const instructionsByAgent: Record<string, ContextInstruction[]> = {};
  for (const agent of options.agents) {
    instructionsByAgent[agent] = perAgent[agent].instructions;
  }

  const normalizedSetByAgent: Record<string, Set<string>> = {};
  for (const agent of options.agents) {
    normalizedSetByAgent[agent] = new Set(
      instructionsByAgent[agent].map((instruction) => instruction.normalizedContent),
    );
  }

  const common: ContextInstruction[] = [];
  const seenCommon = new Set<string>();
  const onlyIn: Record<string, ContextInstruction[]> = {};

  for (const agent of options.agents) {
    onlyIn[agent] = [];
    for (const instruction of instructionsByAgent[agent]) {
      const presentInAll = options.agents.every((other) =>
        normalizedSetByAgent[other].has(instruction.normalizedContent),
      );
      if (presentInAll) {
        if (!seenCommon.has(instruction.normalizedContent)) {
          seenCommon.add(instruction.normalizedContent);
          common.push(instruction);
        }
      } else {
        const presentElsewhere = options.agents.some(
          (other) =>
            other !== agent &&
            normalizedSetByAgent[other].has(instruction.normalizedContent),
        );
        if (!presentElsewhere) {
          onlyIn[agent].push(instruction);
        }
      }
    }
  }

  const conflicts: DiffConflict[] = [];
  const packageManagerConflict = detectPackageManagerConflict(instructionsByAgent);
  if (packageManagerConflict) {
    conflicts.push(packageManagerConflict);
  }

  return {
    targetPath: perAgent[options.agents[0]]?.targetPath,
    agents: options.agents,
    perAgent,
    onlyIn,
    common,
    conflicts,
  };
}
