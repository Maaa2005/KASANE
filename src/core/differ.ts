import type {
  AgentType,
  AnalysisContext,
  ContextInstruction,
  Diagnostic,
  DiffConflict,
  DiffResult,
  SharedInstruction,
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
  // Duplicate agents in --agents would otherwise make an instruction look
  // "shared" with itself and skew every membership count below.
  const agents = Array.from(new Set(options.agents));

  const perAgent: Record<string, ReturnType<typeof resolveEffectiveContext>> = {};
  for (const agent of agents) {
    perAgent[agent] = resolveEffectiveContext(context, diagnostics, {
      agent,
      targetPath: options.targetPath,
    });
  }

  const instructionsByAgent: Record<string, ContextInstruction[]> = {};
  for (const agent of agents) {
    instructionsByAgent[agent] = perAgent[agent].instructions;
  }

  // Group by normalized text and record which agents receive it. Deciding
  // membership per instruction instead of per agent is what keeps a
  // three-way comparison from dropping text that two of the three share.
  const groups = new Map<
    string,
    { instruction: ContextInstruction; agents: AgentType[] }
  >();

  for (const agent of agents) {
    for (const instruction of instructionsByAgent[agent]) {
      const existing = groups.get(instruction.normalizedContent);
      if (existing === undefined) {
        groups.set(instruction.normalizedContent, {
          instruction,
          agents: [agent],
        });
      } else if (!existing.agents.includes(agent)) {
        existing.agents.push(agent);
      }
    }
  }

  const common: ContextInstruction[] = [];
  const sharedBy: SharedInstruction[] = [];
  const onlyIn: Record<string, ContextInstruction[]> = {};
  for (const agent of agents) {
    onlyIn[agent] = [];
  }

  for (const group of groups.values()) {
    if (group.agents.length === agents.length) {
      common.push(group.instruction);
    } else if (group.agents.length === 1) {
      onlyIn[group.agents[0]].push(group.instruction);
    } else {
      sharedBy.push({
        // Report in the order the caller listed the agents, not discovery order.
        agents: agents.filter((agent) => group.agents.includes(agent)),
        instruction: group.instruction,
      });
    }
  }

  const conflicts: DiffConflict[] = [];
  const packageManagerConflict = detectPackageManagerConflict(instructionsByAgent);
  if (packageManagerConflict) {
    conflicts.push(packageManagerConflict);
  }

  return {
    targetPath: perAgent[agents[0]]?.targetPath,
    agents,
    perAgent,
    onlyIn,
    common,
    sharedBy,
    conflicts,
  };
}
