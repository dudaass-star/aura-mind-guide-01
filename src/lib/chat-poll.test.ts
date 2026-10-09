import { test, expect } from 'bun:test';
import { pollChatIndependently } from './chat-poll';

test('balões chegam mesmo enquanto consulta do estado está bloqueada', async () => {
  let release: (value: string) => void = () => {};
  const slow = new Promise<string>(resolve => { release = resolve; });
  let visible = false;
  const polling = pollChatIndependently(async () => { visible = true; }, () => slow, () => {});
  await Promise.resolve();
  expect(visible).toBe(true);
  release('completed');
  await polling;
});

test('falha na consulta de estado não cancela leitura de mensagens', async () => {
  let visible = false;
  await pollChatIndependently(async () => { visible = true; }, async () => { throw new Error('consulta indisponível'); }, () => {});
  expect(visible).toBe(true);
});