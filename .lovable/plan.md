

# Plano: Corrigir Pronúncia do Nome "Aura"

## Problema

O Google Cloud TTS está soletrando "A-U-R-A" ao invés de falar "Aura" como uma palavra. Isso acontece porque nos scripts de meditação o nome está em maiúsculas: **"AURA"**.

O TTS interpreta texto em maiúsculas como siglas e soletra cada letra.

## Solução

Atualizar todos os scripts de meditação no banco de dados, substituindo "AURA" por "Aura".

## Mudanças Necessárias

| Local | Ação |
|-------|------|
| Tabela `meditations` | Executar UPDATE para trocar "AURA" → "Aura" em todos os scripts |
| Áudios afetados | Regenerar os áudios das meditações que já foram geradas |

## Comando SQL

```sql
UPDATE meditations 
SET script = REPLACE(script, 'AURA', 'Aura')
WHERE script LIKE '%AURA%';
```

## Meditações que Precisam Regenerar

Após a correção dos scripts, será necessário regenerar os áudios das meditações que já foram geradas com a pronúncia incorreta:

- `med-ansiedade-tempestade`
- `med-estresse-muscular`
- Qualquer outra que já tenha áudio gerado

## Passos

1. Executar a migração SQL para corrigir os scripts
2. Deletar os áudios existentes (chunks e áudio final)
3. Regenerar usando o botão "Gerar" na página admin

