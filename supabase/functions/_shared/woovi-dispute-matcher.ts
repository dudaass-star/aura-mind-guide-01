export type RegistroComPayload = {
  id?: string | null;
  installment_id?: string | null;
  raw_payload?: unknown;
};

const CHAVES_E2E = new Set([
  "endtoendid",
  "endtoendidpix",
  "pixendtoendid",
  "transactionendtoendid",
]);

function chaveNormalizada(chave: string): string {
  return chave.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

/** Localiza o identificador Bacen independentemente do envelope enviado pela Woovi. */
export function localizarEndToEndId(valor: unknown): string | null {
  if (!valor || typeof valor !== "object") return null;
  if (Array.isArray(valor)) {
    for (const item of valor) {
      const encontrado = localizarEndToEndId(item);
      if (encontrado) return encontrado;
    }
    return null;
  }

  for (const [chave, conteudo] of Object.entries(valor as Record<string, unknown>)) {
    if (CHAVES_E2E.has(chaveNormalizada(chave)) && typeof conteudo === "string" && conteudo.trim()) {
      return conteudo.trim();
    }
  }
  for (const conteudo of Object.values(valor as Record<string, unknown>)) {
    const encontrado = localizarEndToEndId(conteudo);
    if (encontrado) return encontrado;
  }
  return null;
}

/** Confirma correspondência exata; nunca escolhe silenciosamente entre cobranças diferentes. */
export function encontrarCobrancaUnicaPorE2E<T extends RegistroComPayload>(
  cobrancas: T[],
  endToEndId: string,
): { cobranca: T | null; ambiguo: boolean; quantidade: number } {
  const alvo = endToEndId.trim();
  const correspondencias = cobrancas.filter((cobranca) =>
    cobranca.installment_id === alvo || localizarEndToEndId(cobranca.raw_payload) === alvo
  );
  const ids = new Set(correspondencias.map((cobranca) => cobranca.id).filter(Boolean));
  const quantidade = ids.size || correspondencias.length;
  return {
    cobranca: quantidade === 1 ? correspondencias[0] : null,
    ambiguo: quantidade > 1,
    quantidade,
  };
}