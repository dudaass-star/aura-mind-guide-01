// A leitura dos balões não depende da resposta da consulta de estado.
export async function pollChatIndependently<T>(readMessages: () => Promise<void>, readState: () => Promise<T>, applyState: (state: T) => void) {
  await Promise.allSettled([
    readMessages(),
    readState().then(applyState),
  ]);
}