export interface LiveDisclosureSignals {
  isSensitiveDisclosure: boolean;
  isSubstantiveNarrative: boolean;
  shouldHoldPresence: boolean;
}

const SENSITIVE_DISCLOSURE_REGEX = /\b(abuso|abusad[ao]|assedi|estupr|viol[eê]ncia|agress|amea[çc]|p[eê]nis|membro|masturb|tocou em mim|passou a m[ãa]o|tentou me beijar|me for[çc]ou|me obrigou|queria desistir|desistir da vida|me matar|suic[ií]d|automutil|cort(?:ei|ar) (?:meu corpo|meus pulsos|os pulsos))\b/i;
const NARRATIVE_DISCLOSURE_REGEX = /\b(aconteceu|lembro que|me lembrei|nunca contei|nunca falei|naquela vez|quando eu tinha|quando eu era|a[ií] eu|depois disso|foi quando|ele fez|ela fez|eu vi|eu ouvi|eu sa[ií]|eu corri)\b/i;
const REFLECTIVE_MEANING_REGEX = /\b(agora (?:eu )?(?:percebo|entendo)|isso explica|acho que isso|talvez isso|pra mim significa|para mim significa|vejo um padr[aã]o|me dei conta de que|faz sentido porque)\b/i;

// O microagente é assíncrono e seu rótulo só fica disponível no turno seguinte.
// Esta proteção reconhece uma revelação viva diretamente no turno atual.
export function detectLiveDisclosure(userMessage?: string | null): LiveDisclosureSignals {
  const text = (userMessage ?? '').trim();
  if (!text) {
    return { isSensitiveDisclosure: false, isSubstantiveNarrative: false, shouldHoldPresence: false };
  }

  const isSensitiveDisclosure = SENSITIVE_DISCLOSURE_REGEX.test(text);
  const isNarrating = NARRATIVE_DISCLOSURE_REGEX.test(text);
  const isReflectingOnMeaning = REFLECTIVE_MEANING_REGEX.test(text);
  const isSubstantiveNarrative = !isReflectingOnMeaning && isNarrating && text.length >= 80;

  return {
    isSensitiveDisclosure,
    isSubstantiveNarrative,
    shouldHoldPresence: isSensitiveDisclosure || isSubstantiveNarrative,
  };
}