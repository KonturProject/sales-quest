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

## Демо-игра

В `data/` лежит демо-игра с вымышленными командами и операторами (D-32). Её код доступа открытый —
`sales-quest-demo`:

- карта: https://konturproject.github.io/sales-quest/#/?k=sales-quest-demo
- служебная страница с таблицами: https://konturproject.github.io/sales-quest/#/debug?k=sales-quest-demo
  (`&date=ГГГГ-ММ-ДД` — игра на этот день)

Код из ссылки сохраняется в браузере и убирается из адресной строки. У настоящей игры код другой, и в
репозиторий он не попадает.

Пересоздать демо (две недели с понедельника текущей недели; `--start` — другая дата):

```bash
npm run seed-demo -- --phrase sales-quest-demo
```

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
