import { test, expect } from 'bun:test';
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error('Configuração de acesso ausente');
const client = createClient(url, key, { auth: { persistSession: false } });

test('visitante não consegue listar livremente as capas', async () => {
  const { data, error } = await client.storage.from('blog-covers').list();
  expect(error).toBeNull();
  expect(data).toEqual([]);
});

test('visitante não consegue autorizar download de uma capa', async () => {
  const { data: post } = await client.from('blog_posts').select('cover_url').not('cover_url', 'is', null).limit(1).single();
  expect(post?.cover_url).toBeTruthy();
  if (!post?.cover_url) throw new Error('Capa não encontrada');
  const path = decodeURIComponent(new URL(post.cover_url).pathname.split('/blog-covers/')[1] ?? '');
  expect(path.length).toBeGreaterThan(0);
  const { error } = await client.storage.from('blog-covers').createSignedUrl(path, 60);
  expect(error).not.toBeNull();
});

test('link autorizado do artigo continua entregando a imagem', async () => {
  const { data: post } = await client.from('blog_posts').select('cover_url').not('cover_url', 'is', null).limit(1).single();
  if (!post?.cover_url) throw new Error('Capa não encontrada');
  const response = await fetch(post.cover_url);
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toStartWith('image/');
  expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
});