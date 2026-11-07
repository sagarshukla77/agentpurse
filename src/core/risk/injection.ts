/**
 * Layer 1 of prompt-injection defence: fast, deterministic heuristics.
 * (Layer 2 is an LLM classifier; layer 3, the one that actually matters, is that the
 * policy engine never reads document text.) Heuristics are intentionally conservative:
 * a false positive costs a human review, a false negative is mitigated by layers 2 and 3.
 */
export interface InjectionResult {
  flagged: boolean;
  evidence: string[];
}

const PATTERNS: [RegExp, string][] = [
  [/ignore (all |any |the )?(previous|prior|above|earlier) (instructions|rules|limits|polic)/i, 'tells the reader to ignore prior instructions'],
  [/disregard (all |any |the )?(previous|prior|above|earlier|your) /i, 'tells the reader to disregard rules'],
  [/(^|\n)\s*(system|assistant|developer)\s*[:：]/i, 'impersonates a system or assistant message'],
  [/\b(override|bypass|disable|skip)\b.{0,40}\b(limit|cap|budget|policy|approval|check|mandate|guardrail)/i, 'asks to bypass a control'],
  [/\b(pay|send|transfer|wire)\b.{0,30}\b(immediately|right now|without (approval|review|checking))/i, 'demands immediate payment'],
  [/you (are|must|should|will) (now )?(act|behave|respond|pay|approve)/i, 'addresses the AI directly'],
  [/\b(do not|don't) (flag|escalate|review|tell|mention)\b/i, 'asks to suppress review'],
  [/<\/?(system|instructions?|tool_call|function_call)>/i, 'contains pseudo-markup for model instructions'],
  [/\bapprove (this|the) (invoice|payment)\b/i, 'tries to pre-approve itself'],
];

export function detectInjection(text: string): InjectionResult {
  const evidence = PATTERNS.filter(([re]) => re.test(text)).map(([, why]) => why);
  return { flagged: evidence.length > 0, evidence };
}
