# Histórico e decisões

## 1.x — Kindroid Journal Manager (julho de 2025)

App web local (React + IndexedDB) com um servidor Node em `127.0.0.1:8787` que publicava entradas pelo endpoint não
documentado `POST api.kindroid.ai/v1/journal-create`, com a chave `kn_` da conta. Problemas: endpoint sem garantia,
risco de duplicar entradas quando a resposta se perdia (status "uncertain"), uma chave com acesso à conta inteira e
dois processos para rodar.

## 2.0 — standalone sem API (novembro de 2026, descartada)

A API v1 saiu e o app passou a rodar só no navegador. Ficou como etapa intermediária: o objetivo era fazer parte do
Kindroid, não rodar sozinho.

## Journal 1.0 — programa do Kindroid Workshop

- Mesmo molde do Clotheskin: `kin.json`, `main.js` → `run/` → `src/core/`, tela em `screen/` gerada como scripts
  clássicos, instalação pelo agente do Workshop copiando do GitHub fixado num commit.
- A tela foi refeita em JavaScript puro: a versão em React tinha 774 mil caracteres num arquivo só, grande demais
  para o agente copiar inteiro. Agora são dois scripts de ~41 mil e ~53 mil (`core.js` e `app.js`), cada um com
  uma última linha que confirma a cópia completa.
- Kins são os Kins anexados ao app; não se criam Kins dentro do Journal.
- Duas ações do Kin: `save_journal_entry` (rascunho) e `read_journal`. Sem agendamento e sem grants.
- Um escritor por arquivo: tela → `journal.json`; execução → `kin-drafts.json`.
- Continua fora: escrever direto no Journal real do Kindroid. Exigiria `secret:kindroid@api.kindroid.ai`, a chave
  da conta inteira, e o objetivo foi justamente tirar a API antiga.
