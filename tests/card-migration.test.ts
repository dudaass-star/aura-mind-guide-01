import { test, expect } from "bun:test";
import { canMigratePixToCard } from "../src/lib/card-migration";

test("PIX Woovi permite a alternativa de cartão", () => {
  expect(canMigratePixToCard("woovi-pix", null)).toBe(true);
});

test("cartão não oferece migração para PIX", () => {
  expect(canMigratePixToCard("stripe-card")).toBe(false);
  expect(canMigratePixToCard("asaas-card")).toBe(false);
});

test("PIX legado sem encerramento automático não oferece migração", () => {
  expect(canMigratePixToCard("inter-pix")).toBe(false);
  expect(canMigratePixToCard("asaas-pix")).toBe(false);
});

test("migração não substitui planos de retenção por preços completos", () => {
  expect(canMigratePixToCard("woovi-pix", "lite")).toBe(false);
  expect(canMigratePixToCard("woovi-pix", "base")).toBe(false);
});