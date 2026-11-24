// The way to install Journal in Kindroid (the same as Clotheskin): the Workshop agent opens each file from GitHub's raw
// address, pinned to a commit, step by step in the same Workshop chat. This script knows which files the app needs (it
// follows the imports, so a new module is never forgotten) and writes:
//   node scripts/build-install.mjs           COMO-INSTALAR.md, with <commit> to fill in (also: npm run build)
//   node scripts/build-install.mjs --check   fails if COMO-INSTALAR.md is out of date (npm run build:check)
//   node scripts/build-install.mjs --prompt [<commit>]   the messages ready to paste for a pushed commit (default HEAD),
//                                            with each file's size and SHA-256 (npm run install-prompt)
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainModule, writeOrCheck } from './lib/generated.mjs';
import { CORE_END, SCREEN_END } from './build-screen.mjs';
import { APP_VERSION } from '../src/core/constants.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const REPO = 'Varg67/kjournal';
const posix = (p) => p.split(sep).join('/');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/** main.js and every file it imports (what the run needs). */
function runFiles() {
  const seen = new Set();
  const walk = (rel) => {
    const f = posix(normalize(rel));
    if (seen.has(f)) return;
    seen.add(f);
    for (const m of read(f).matchAll(/^import [^;]*? from '(\.[^']+)';$/gm)) walk(join(dirname(f), m[1]));
  };
  walk('main.js');
  return [...seen];
}

/** screen/index.html and the files it loads. */
function screenFiles() {
  const refs = [...read('screen/index.html').matchAll(/(?:href|src)="([^":]+)"/g)].map((m) => posix(join('screen', m[1])));
  return ['screen/index.html', ...refs];
}

export function installFiles() {
  const sample = execFileSync('git', ['ls-files', 'sample'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  if (!sample.length) sample.push('sample/journal.json');
  return ['kin.json', 'package.json', ...runFiles().sort((a, b) => a.localeCompare(b)), ...screenFiles().sort((a, b) => a.localeCompare(b)), ...sample];
}

const raw = (commit, path) => `https://raw.githubusercontent.com/${REPO}/${commit}/${path}`;

function steps(commit, files) {
  const run = files.filter((f) => f === 'main.js' || f.startsWith('run/') || f.startsWith('src/'));
  return [
    { title: 'Conferir que ele lê o manifesto (sem dar a resposta no prompt)',
      message: `Open this raw GitHub file: ${raw(commit, 'kin.json')}. What are the exact values of run.entry and run.timeout, and the names of the actions? Only inspect the file for now.`,
      answer: '`node main.js`, `1m`, e as ações `save_journal_entry` e `read_journal`. Outra resposta: ele está lendo outra coisa, talvez uma cópia antiga que já está no Workshop.' },
    { title: 'Seguir a execução pelos imports',
      message: 'Starting from the same raw GitHub revision, open main.js and follow its local imports. Which file and function handle the save_journal_entry action, and which file does it write? List the files you successfully opened.',
      answer: `a função \`saveJournalEntry\` em \`run/program.js\`, que grava só \`kin-drafts.json\`; e os ${run.length} arquivos: ${run.map((f) => `\`${f}\``).join(', ')}.` },
    { title: 'Seguir a tela',
      message: 'Open screen/index.html from the same revision and follow its local scripts, stylesheets and assets. In which order are the two scripts loaded, and which two files of the program\'s folder does the screen read when it starts?',
      answer: '`screen/core.js` e depois `screen/app.js`; ela lê `journal.json` e `kin-drafts.json` (com `files.read`).' },
    { title: 'Copiar para o projeto do Workshop',
      message: `Copy the existing Journal app from the verified raw GitHub revision into the current Workshop project. Copy exactly these ${files.length} files, each from ${raw(commit, '<path>')}, saved at the same path, exactly as downloaded: do not rewrite, shorten or "improve" anything. Keep kin.json at the project root.\n\n${files.join('\n')}\n\nApply the files now. If a file fails to copy, report its path and the exact error.`,
      answer: 'que copiou os arquivos, ou o caminho e o erro exato de cada um que falhou.' },
    { title: 'Conferir a cópia, relendo do projeto do Workshop (não do GitHub)',
      message: 'Now reopen these files from the Workshop project, not from GitHub, and report: the run entry and screen entry in kin.json; the value of APP_VERSION in src/core/constants.js; and the exact last line of screen/core.js and of screen/app.js. Then open the screen in Workshop preview.',
      answer: `\`node main.js\`, \`screen/index.html\`; \`APP_VERSION\` = \`${APP_VERSION}\`; últimas linhas \`${CORE_END}\` e \`${SCREEN_END}\`. Outra última linha: aquele arquivo foi cortado na cópia (repita o passo 4 só com ele).` },
  ];
}

function renderGuide() {
  const files = installFiles();
  return `# Journal: como instalar e atualizar no Kindroid

Este arquivo é gerado por \`npm run build\` (\`scripts/build-install.mjs\`): não edite à mão. Versão do app: **${APP_VERSION}**.

## O jeito que funciona

O mesmo do Clotheskin: o agente do Workshop abre cada arquivo pelo endereço *raw* do GitHub, **um por vez**, no mesmo chat do Workshop, em etapas. O endereço aponta para um **commit**, não para um branch, para o agente pegar a execução, a tela e o manifesto da mesma versão.

- **Mensagens prontas, com o commit preenchido:** depois do push, rode \`npm run install-prompt\` (ou peça ao Claude). Ele imprime as mensagens abaixo com o commit, as respostas esperadas e o tamanho e o SHA-256 de cada arquivo.
- **À mão:** troque \`<commit>\` pelo hash completo do commit em cada mensagem.

## Os ${files.length} arquivos que o Kindroid usa

\`\`\`
${files.join('\n')}
\`\`\`

O resto do repositório (\`tests/\`, \`dev/\`, \`scripts/\`, \`docs/\`, \`examples/\`) é só para desenvolver e testar. **Para atualizar, mande sempre os ${files.length} juntos**: eles dependem uns dos outros.

## As mensagens para o agente, em ordem

${steps('<commit>', files).map((step, i) => `### ${i + 1}. ${step.title}

\`\`\`
${step.message}
\`\`\`

**Resposta certa:** ${step.answer}`).join('\n\n')}

### 6. Testar dentro do Kindroid

1. Apps → **Waiting for you** → **Allow**. O Journal não pede nenhuma permissão (nem leitura do chat, nem rede): só usa a própria pasta.
2. Configurações do app → **Kins** → marque os Kins.
3. Abra a tela: os Kins marcados aparecem no menu (☰). No fim do menu aparece "Journal ${APP_VERSION}".
4. No chat com o Kin, peça algo como *"anota no seu journal que a Marta é minha irmã e mora em Lisboa"*. O Kin usa \`save_journal_entry\`; o rascunho aparece na tela com o ícone de pena (pode levar até 20 s, ou feche e abra a tela).
5. Pergunte *"o que o seu journal diz sobre a Marta?"*: o Kin usa \`read_journal\`.

## O que custa

Não há agendamento: o Journal só roda quando o Kin usa uma das ações (alguns segundos cada). A tela não gasta créditos.
`;
}

function renderPrompt(commit) {
  const files = installFiles();
  const sizes = files.map((f) => {
    const text = read(f);
    return `| \`${f}\` | ${text.split('\n').length - (text.endsWith('\n') ? 1 : 0)} | ${[...text].length} | \`${createHash('sha256').update(text).digest('hex').slice(0, 16)}\` |`;
  });
  return `Journal ${APP_VERSION}, commit ${commit}: send each message in the same Workshop chat, in order, and compare the answer.

${steps(commit, files).map((s, i) => `===== ${i + 1}. ${s.title}\n\n${s.message}\n\n--> Resposta certa: ${s.answer}`).join('\n\n')}

===== Cada arquivo (linhas, caracteres, SHA-256 abreviado)

| arquivo | linhas | caracteres | sha256 |
| --- | --- | --- | --- |
${sizes.join('\n')}
`;
}

if (isMainModule(import.meta.url)) {
  const at = process.argv.indexOf('--prompt');
  if (at >= 0) {
    const commit = process.argv[at + 1] || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
    process.stdout.write(renderPrompt(commit));
  } else writeOrCheck('COMO-INSTALAR.md', renderGuide());
}
