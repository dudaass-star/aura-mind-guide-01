// Item do Percurso a abrir diretamente (ex.: "Ver frase" na tela inicial). Consumido uma vez.
const KEY = "aura-percurso-focus";
export function setPercursoFocus(id: string) {
  try { sessionStorage.setItem(KEY, id); } catch { /* sem storage */ }
  // Aba já aberta antes: avisa para rolar até o item.
  setTimeout(() => window.dispatchEvent(new Event("aura:percurso-focus")), 50);
}
export function takePercursoFocus(): string | null {
  try { const id = sessionStorage.getItem(KEY); sessionStorage.removeItem(KEY); return id; } catch { return null; }
}
