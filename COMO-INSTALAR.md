# Journal: como instalar e atualizar no Kindroid

Este arquivo é gerado por `npm run build` (`scripts/build-install.mjs`): não edite à mão. Versão do app: **1.0.0**.

## O jeito que funciona

O mesmo do Clotheskin: o agente do Workshop abre cada arquivo pelo endereço *raw* do GitHub, **um por vez**, no mesmo chat do Workshop, em etapas. O endereço aponta para um **commit**, não para um branch, para o agente pegar a execução, a tela e o manifesto da mesma versão.

- **Mensagens prontas, com o commit preenchido:** depois do push, rode `npm run install-prompt` (ou peça ao Claude). Ele imprime as mensagens abaixo com o commit, as respostas esperadas e o tamanho e o SHA-256 de cada arquivo.
- **À mão:** troque `<commit>` pelo hash completo do commit em cada mensagem.

## Os 18 arquivos que o Kindroid usa

```
kin.json
package.json
main.js
run/kin.js
run/program.js
src/core/constants.js
src/core/document.js
src/core/entry.js
src/core/rules.js
src/core/text.js
src/core/triggers.js
screen/app.js
screen/assets/icon.svg
screen/core.js
screen/index.html
screen/styles.css
screen/theme.css
sample/journal.json
```

O resto do repositório (`tests/`, `dev/`, `scripts/`, `docs/`, `examples/`) é só para desenvolver e testar. **Para atualizar, mande sempre os 18 juntos**: eles dependem uns dos outros.

## As mensagens para o agente, em ordem

### 1. Conferir que ele lê o manifesto (sem dar a resposta no prompt)

```
Open this raw GitHub file: https://raw.githubusercontent.com/Varg67/kjournal/<commit>/kin.json. What are the exact values of run.entry and run.timeout, and the names of the actions? Only inspect the file for now.
```

**Resposta certa:** `node main.js`, `1m`, e as ações `save_journal_entry` e `read_journal`. Outra resposta: ele está lendo outra coisa, talvez uma cópia antiga que já está no Workshop.

### 2. Seguir a execução pelos imports

```
Starting from the same raw GitHub revision, open main.js and follow its local imports. Which file and function handle the save_journal_entry action, and which file does it write? List the files you successfully opened.
```

**Resposta certa:** a função `saveJournalEntry` em `run/program.js`, que grava só `kin-drafts.json`; e os 9 arquivos: `main.js`, `run/kin.js`, `run/program.js`, `src/core/constants.js`, `src/core/document.js`, `src/core/entry.js`, `src/core/rules.js`, `src/core/text.js`, `src/core/triggers.js`.

### 3. Seguir a tela

```
Open screen/index.html from the same revision and follow its local scripts, stylesheets and assets. In which order are the two scripts loaded, and which two files of the program's folder does the screen read when it starts?
```

**Resposta certa:** `screen/core.js` e depois `screen/app.js`; ela lê `journal.json` e `kin-drafts.json` (com `files.read`).

### 4. Copiar para o projeto do Workshop

```
Copy the existing Journal app from the verified raw GitHub revision into the current Workshop project. Copy exactly these 18 files, each from https://raw.githubusercontent.com/Varg67/kjournal/<commit>/<path>, saved at the same path, exactly as downloaded: do not rewrite, shorten or "improve" anything. Keep kin.json at the project root.

kin.json
package.json
main.js
run/kin.js
run/program.js
src/core/constants.js
src/core/document.js
src/core/entry.js
src/core/rules.js
src/core/text.js
src/core/triggers.js
screen/app.js
screen/assets/icon.svg
screen/core.js
screen/index.html
screen/styles.css
screen/theme.css
sample/journal.json

Apply the files now. If a file fails to copy, report its path and the exact error.
```

**Resposta certa:** que copiou os arquivos, ou o caminho e o erro exato de cada um que falhou.

### 5. Conferir a cópia, relendo do projeto do Workshop (não do GitHub)

```
Now reopen these files from the Workshop project, not from GitHub, and report: the run entry and screen entry in kin.json; the value of APP_VERSION in src/core/constants.js; and the exact last line of screen/core.js and of screen/app.js. Then open the screen in Workshop preview.
```

**Resposta certa:** `node main.js`, `screen/index.html`; `APP_VERSION` = `1.0.0`; últimas linhas `// end of Journal core 1.0.0` e `// end of Journal screen 1.0.0`. Outra última linha: aquele arquivo foi cortado na cópia (repita o passo 4 só com ele).

### 6. Testar dentro do Kindroid

1. Apps → **Waiting for you** → **Allow**. O Journal não pede nenhuma permissão (nem leitura do chat, nem rede): só usa a própria pasta.
2. Configurações do app → **Kins** → marque os Kins.
3. Abra a tela: os Kins marcados aparecem no menu (☰). No fim do menu aparece "Journal 1.0.0".
4. No chat com o Kin, peça algo como *"anota no seu journal que a Marta é minha irmã e mora em Lisboa"*. O Kin usa `save_journal_entry`; o rascunho aparece na tela com o ícone de pena (pode levar até 20 s, ou feche e abra a tela).
5. Pergunte *"o que o seu journal diz sobre a Marta?"*: o Kin usa `read_journal`.

## O que custa

Não há agendamento: o Journal só roda quando o Kin usa uma das ações (alguns segundos cada). A tela não gasta créditos.
