export interface AutomationFacts {
  exactNeed?: boolean;
  budgetEgp?: number | null;
  hasInternalSystems?: boolean;
  clearProblem?: boolean;
}

export type QualificationReason = 'exact_need' | 'budget' | 'internal_systems' | 'clear_problem';
export type AutomationNextAction = 'ASK_QUALIFICATION_QUESTION' | 'COLLECT_MEETING_DETAILS' | 'COLLECT_HUMAN_FOLLOWUP_DETAILS';

export function qualifyAutomationLead(facts: AutomationFacts): { qualified: boolean; reason?: QualificationReason } {
  if (facts.exactNeed) return { qualified: true, reason: 'exact_need' };
  if (typeof facts.budgetEgp === 'number' && facts.budgetEgp >= 25_000) return { qualified: true, reason: 'budget' };
  if (facts.hasInternalSystems) return { qualified: true, reason: 'internal_systems' };
  if (facts.clearProblem) return { qualified: true, reason: 'clear_problem' };
  return { qualified: false };
}

export function selectAutomationNextAction(input: { facts: AutomationFacts; questionsAsked: number }): AutomationNextAction {
  if (qualifyAutomationLead(input.facts).qualified) return 'COLLECT_MEETING_DETAILS';
  if (input.questionsAsked >= 4) return 'COLLECT_HUMAN_FOLLOWUP_DETAILS';
  return 'ASK_QUALIFICATION_QUESTION';
}
