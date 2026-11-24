# KJOURNAL/2

Formato de troca para importar e exportar Journal Entries em massa. Texto
(`.kjournal`) e JSON (`.kjournal.json`) descrevem exatamente a mesma coisa.
Implementação: `src/core/kjournal.js`. Exemplos: `examples/`.

## Texto

```text
KJOURNAL/2

# Comentários só fora dos blocos, começando na coluna 1.
@@JOURNAL
id: cabana-lareira          (opcional) identidade local para reimportações
title: A noite na cabana    (opcional) só para organização
kin: Alexi                  (opcional) nome do Kin anexado ao app
scope: global               (opcional) "kin" (padrão) ou "global"
tags: memórias, viagens     (opcional) separadas por vírgula
@@KEYPHRASES
- aquela noite na cabana
- perto da lareira
@@ENTRY
Texto da entrada, em quantas linhas quiser.
\@@END   ← linha que começa com \ seguida de um marcador vira o marcador literal
@@END
```

(As anotações à direita acima são explicativas; no arquivo real o valor vai até o fim da linha.)

Regras estritas:

- A primeira linha é exatamente `KJOURNAL/2` (ou `KJOURNAL/1`, ver abaixo).
  BOM UTF-8 é aceito; outras codificações não.
- Marcadores (`@@JOURNAL`, `@@KEYPHRASES`, `@@ENTRY`, `@@END`) ocupam a linha
  inteira, na coluna 1, sem espaços.
- Ordem fixa: metadados → `@@KEYPHRASES` → `@@ENTRY` → `@@END`.
- Metadados: `campo: valor`, cada campo no máximo uma vez, nunca vazio. Campo
  desconhecido é erro.
- Keyphrases: uma por linha, começando com `- `.
- `kin` e `scope: global` juntos é erro.
- Linhas em branco no início/fim do texto são removidas; o resto é preservado.
  O importador nunca corrige, corta ou reescreve texto.
- As regras de conteúdo são as mesmas do editor (`src/core/rules.js`):
  erros bloqueiam o arquivo inteiro; avisos exigem confirmação.

## JSON

```json
{
  "format": "kjournal",
  "version": 2,
  "entries": [
    { "id": "x", "title": "…", "kin": "Alexi", "tags": ["a"], "entry": "…", "keyphrases": ["…"] },
    { "scope": "global", "entry": "…", "keyphrases": ["…"] }
  ]
}
```

## Compatibilidade com KJOURNAL/1

Arquivos v1 (texto ou JSON) continuam aceitos. O campo `ai_id` é ignorado com
um aviso; o Kin de destino é escolhido na tela de importação. Campos da v2
(`kin`, `scope`, `tags`) não são aceitos dentro de um arquivo v1.

## Importação

1. O arquivo é lido e validado inteiro; nada é gravado.
2. A prévia mostra o destino de cada entrada e os avisos (incluindo keyphrases
   que já existem na biblioteca e Kins do arquivo que não estão anexados ao
   app; essas entradas vão para o destino escolhido, nenhum Kin é criado) e
   os conflitos:
   - mesmo `id` e mesmo texto → padrão **Ignorar**
   - mesmo `id`, texto diferente → padrão **Manter as duas** (ou Substituir)
   - mesmo texto sem `id` → padrão **Ignorar**
3. Ao confirmar, as entradas entram juntas no `journal.json`.
4. Toda entrada importada chega como **Rascunho**.

## Backups

A caixa de importação também aceita, pelo mesmo fluxo de prévia:

- uma cópia do `journal.json` deste app (o formato "Backup" da exportação): mantém status e datas, e casa os Kins
  pelo id ou pelo nome;
- o backup da versão 2.0 standalone (`kindroid-journal-manager.backup`): os Kins eram pastas locais e são casados
  pelo nome com os Kins anexados;
- o export da versão 1.x (`kindroid-journal-manager.export`): o `ai_id` da API antiga é descartado, e as entradas
  vão para o Kin que você escolher. `published` vira "In Kindroid"; o resto vira rascunho.
