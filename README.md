# Sales Quest — шагалка отдела продаж

Сайт: https://konturproject.github.io/sales-quest/

Требования — [`docs/SPEC.md`](docs/SPEC.md), решения — [`docs/DECISIONS.md`](docs/DECISIONS.md),
открытые вопросы — [`docs/OPEN_QUESTIONS.md`](docs/OPEN_QUESTIONS.md).

## Запуск

Нужен Node 22.18 или новее.

```bash
npm install
npm run dev
```

Откроется http://localhost:5173/sales-quest/. Остальные команды — в [`CLAUDE.md`](CLAUDE.md).

## Окружение Claude Code (ставится вручную, D-5)

В терминальном `claude`:

```bash
npm install -g typescript-language-server typescript
```

```
/plugin install typescript-lsp@claude-plugins-official
```

```bash
claude mcp add context7 -- npx -y @upstash/context7-mcp
```

Инструкция для администратора игры появится на этапе 5 (DEP-8).
