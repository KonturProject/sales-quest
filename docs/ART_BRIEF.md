# ТЗ на арты локаций для игровой доски

Для этапа 3б (D-37). **Получено 09.10.2026:** генератор дал 1408×768 вместо квадрата — доска приняла эти
пропорции (D-41); выбранные варианты и правила сборки — в `scripts/lib/assets.ts`. Четыре картинки — панели игровой доски, которые лежат в ряд слева направо:
**руины → лёд → вулкан → небеса**. Поверх каждой панели игра ставит объёмные клетки и фигурки героев,
камера смотрит сверху под наклоном и иногда подлетает близко. Текущие картинки из `refs/` остаются
референсами настроения; эти — рабочие.

## Обязательно

1. **Строго сверху, 90°.** Вид «карта / flat lay», без перспективы и изометрии: никаких колонн, скал и
   стен, нарисованных сбоку. Высоту показывают тени и свет сверху, не боковые стенки. Иначе на
   наклонённой камере предметы выглядят «нарисованными на полу».
2. **Тропа входит посередине левого края и выходит посередине правого.** Мягкая S-образная дуга через
   всю панель; ширина тропы — примерно 1/10 ширины картинки. Так панели стыкуются: выход одной — вход
   следующей.
3. **На тропе ничего не нарисовано**: ни клеток, ни точек, ни номеров, ни иконок. Клетки ставит игра.
4. **Левый и правый края** (по 5–8 % ширины) уходят в одинаковую тёмную сине-серую дымку — на всех
   четырёх одинаково. Это прячет стыки.
5. **Без надписей и интерфейса**: START/EXIT, прицелы, сетки, рамки, виньетка, подписи, водяные знаки.
6. **Единый стиль на всех четырёх**: одна и та же манера (рисованное стилизованное фэнтези), свет сверху
   слева, похожая насыщенность, одинаковый масштаб (ширина тропы).
7. **Тропа читается**: средний тон, не слепящая; вокруг тропы — спокойнее, чем по краям, чтобы фигурки
   было хорошо видно. Без людей и персонажей.

Формат: квадрат, **2048×2048** (можно 1536×1536), PNG. Сгенерируйте несколько вариантов на локацию —
выберем лучший; точный изгиб тропы не важен, путь клеток я проведу по нарисованной тропе.

Готовые картинки — в `refs/board/` с именами `ruins.png`, `ice.png`, `volcano.png`, `heaven.png`
(папка не попадает в git; для сайта я сожму их сам после вашего выбора).

## Промпты (английский — генераторы лучше понимают)

Общий хвост — добавлять к каждому промпту:

```
top-down orthographic view, seen from directly above, flat lay game board map, no perspective,
stylized hand-painted fantasy illustration, soft even light from the top left, rich but not
oversaturated colors, highly detailed, clean readable composition, a single winding path enters at
the middle of the left edge and exits at the middle of the right edge in a gentle S-curve, plain path
surface, the left and right borders fade into dark blue-grey mist
```

Negative prompt — для всех:

```
perspective, isometric, tilted camera, 3d render, horizon, sky, side view of walls, tall columns seen
from the side, cliffs seen from the side, text, letters, numbers, ui, icons, grid, tiles on the path,
dots, game pieces, people, characters, frame, border, vignette, watermark, signature, blurry
```

1. **Руины** (`ruins.png`):
   ```
   ancient overgrown temple ruins seen from above, tops of broken columns, mossy flagstones, ivy,
   small glowing runes on scattered stones, misty chasms between ruined platforms, a path of worn
   stone slabs
   ```
2. **Лёд** (`ice.png`):
   ```
   frozen glacier land seen from above, snow-covered ice floes, cracked blue ice, frosted rocks,
   dark icy water between floes, a path of packed snow and ice slabs
   ```
3. **Вулкан** (`volcano.png`):
   ```
   volcanic land seen from above, rivers of glowing lava, black basalt rock islands, embers and
   ash, a path of dark stone slabs crossing the lava
   ```
4. **Небеса** (`heaven.png`):
   ```
   heavenly sky garden seen from above, floating grassy islands among soft white clouds, golden
   light, flowers, a path of pale stone stepping slabs across the islands
   ```

Если генератор упорно рисует перспективу — поднимите вес «top-down orthographic view» или добавьте
`(satellite view:1.2)`; если тропа уходит в углы — допишите `path from left edge center to right edge
center`.
