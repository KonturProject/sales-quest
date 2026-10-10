# Ассеты и лицензии

Только CC0 / CC-BY (SPEC §11.4, GFX-SRC-1). CC-BY — с атрибуцией на экране «Об игре».

| Пак | Автор | URL | Лицензия | Где используется |
|---|---|---|---|---|
| KayKit Character Pack: Adventurers 1.0 (герои, клипы) | Kay Lousberg | https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0 (коммит `672074b`), https://kaylousberg.itch.io/kaykit-adventurers | CC0 1.0 | `src/assets/heroes/*.glb` — фигурки команд (D-41); `src/assets/props/props.glb` — вещи на столе (D-43) |
| Панели локаций (руины, лёд, вулкан, небеса) | автор игры (сгенерировано по `docs/ART_BRIEF.md`) | — | публикуются с разрешения автора (D-37) | `src/assets/board/*.webp` — доска (D-41) |
| KayKit Medieval Hexagon Pack 1.0 (деревья, скалы, горы, облака) | Kay Lousberg | https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0 (коммит `84fa4e9`) | CC0 1.0 | `src/assets/decor/decor.glb` — объём на панелях (D-44) |
| KayKit Dungeon Remastered 1.0 (колонны, обломки, факелы, монеты, свеча) | Kay Lousberg | https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0 (коммит `b0ca9bd`) | CC0 1.0 | `src/assets/decor/decor.glb`, `src/assets/props/props.glb` (D-43, D-44) |

## Библиотеки, скачанные не из npm

- **SheetJS Community Edition 0.20.3** — чтение выгрузок Excel в админке и в скриптах (план 2а); с
  официального `cdn.sheetjs.com` (в общем реестре npm — устаревшая версия, ТЗ §13.2), лицензия
  Apache-2.0. Скачана с «да» автора 10.10.2026. Зрителям не грузится (D-7a).
