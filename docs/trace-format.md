# Формат траси і канонічний стан

Траса — текст, один запис на рядок: `<тип> <t_us> …`, де `t_us` — віртуальний час у мікросекундах
від старту програми. Golden-траси лежать у `tests/golden/traces/<scenario>.trace.gz`, сценарії — у
`tests/golden/scenarios/<scenario>.json` (формат — у `tools/oracle/scenario.mjs`).

| Рядок | Значення |
|---|---|
| `V shortline-trace 1` | версія формату |
| `L <0\|1>` | 1, якщо рейки в'їздів мають меншу адресу, ніж `g_rails` (як у DOS) |
| `T <t> <taskId>` | створено задачу (id — порядковий номер створення, з 1) |
| `H <t> <taskId> <hash>` | після відновлення задачі `taskId` хеш стану змінився (режим `chainEveryUs = 0`) |
| `C <t> <steps> <chain>` | режим ланцюга: кожні `chainEveryUs` мкс — згорнуті всі `H`-кроки від початку |
| `D <t> {json}` | дельта-дамп: лише секції, що змінились від попереднього `D` (перший `D` — повний) |
| `F <t> {json}` | повний дамп у момент завершення |
| `S <t> <freq>` | `sound(freq)`; `S <t> 0` — `nosound()` |
| `M <t> <text>` | `showStatusMessage(text)` |
| `I <t> key <scancode> <down> 0 0` / `I <t> mouse <flags> <buttons> <x> <y>` | доставлено ввід |
| `U <t> <what>` | невизначена поведінка (див. `docs/fidelity.md`, U1) |
| `E <t> <stop\|exit\|ub> <hash>` | кінець: `RESL_STOP_AT`, вихід із гри (Bye) або UB |

## Точки траси

- **Відновлення задачі.** Після кожного `Task::resume()` у планувальнику (і коли задача завершилась) рахується хеш
  стану. Рядок `H` пишеться лише якщо хеш змінився. Час (`t`) у хеш не входить, але входить у рядок.
- **Дамп.** Після відновлення, якщо `t ≥` наступної межі `dumpEveryUs` (межі: 0, P, 2P, …).
- **Зупинка.** Після відновлення задачі або на межі кадру (`flush()` з новим кадром), коли `t ≥ stopAtUs`.
- **Ланцюг** (`chainEveryUs > 0`): для кожного кроку, що в звичайному режимі дав би `H`,
  `chain = fnv(chain, t_lo, t_hi, taskId, hash)`; рядок `C` — після відновлення, якщо `t ≥` наступної межі.
  Початкове `chain = 2166136261`.

## Хеш

FNV-1a над 32-бітними словами: `h = 2166136261; для кожного слова w: h = (h ^ w) * 16777619 (mod 2³²)`.
Слова: для кожної секції по порядку — спершу довжина секції, потім її значення (як `int32`).

## Секції канонічного стану (порядок важливий)

Вказівники: рейка → `0` (null), `1` (`g_disabledSwitchPath`), `2 + ((x·11 + y)·6 + type)` для `g_rails[x][y][type]`,
`728 + i` для `g_entrances[i].rail`. Вагон → `0` (null) або `train·5 + idx + 1`.

1. `sys`: timer `startValue`, `enabled`, `multiplier`, `startTime_us` (lo, hi); стан ГВЧ (`uint32` як `int32`);
   `g_lastKeyPressed`, `g_lastKeyCode`; миша: стан кнопок, `cursorX`, `cursorY`, `cursorVisible`.
2. `game`: `g_gameTime`, `g_isDemoMode`, `g_gameOver`, `g_soundEnabled`, `g_previousMouseButtonState`,
   `g_footerMessageTimeout`, `g_lastProcessedTrain`, `g_lastProcessedCarriages[20]`, `g_entranceCount`,
   `g_railRoadCount`, `g_nSwitches`, `g_semaphoreCount`, `g_newSemaphoreCount`, `g_erasedSemaphoreCount`,
   `g_cuttingDownStaticObjectsByKind[4]`, `g_demoFileName[5]`, `g_demoMouseMsg` (action, x, y),
   режим миші (0 — немає, 1 — керування, 2 — будівництво), `modeManagement.x/y`, `modeConstruction.x/y`,
   `g_railCursorState` (5 полів `RailInfo`), `g_playerName[20]` (байти).
3. `headers`: 4 × (`x, y, valueLimit, nDigits, curAnimatingDigit, value, yScroll, digitValues[6]`).
4. `queues`: для черг миші, будівництва, шапки — `size`, `hasWaitingTask`, елементи
   (миша: `action, x, y`; будівництво: `RailInfo`; шапка: `delta, fieldId, value`).
5. `dialogs`: 5 × (`x, itemY[7], itemWidth`), потім пункт паузи (0 — `"Save"`, 1 — `"  OK"`).
6. `rails`: 726 × (`x, y, type, minPathStep, maxPathStep, semSlotIdByDirection[3], c0.rail, c0.slot, c1.rail, c1.slot`).
7. `road`: `g_railRoad[0..count)` по 5 полів `RailInfo`, потім `g_railroadTypeMasks[11][11]`.
8. `switches`: `g_nSwitches` × (`x, y, exit, entry, disabledPath` (по 2), `adjacentSwitchIdx`).
9. `semaphores`: `g_semaphoreCount` × (`rail, type, isRed, isRightDirection, pixelX, pixelY, glyph` (індекс у `g_semaphoreGlyphs[2][2]`)).
10. `entrances`: 9 × (`bgColor, fgColor, entranceRailInfoIdx, waitingTrainsCount`, рейка — 12 полів як у `rails`).
11. `objects`: 120 × (`x, y, kind, type, color, creationYear`).
12. `trains`: 20 × (`isFreeSlot, carriageCnt, drawingChainIdx, needToRedraw, isActualPosition, speed, maxSpeed,
    headCarriageIdx, movementDebt, year, lastMovementTime`, `head`, `tail` (по 3: `pathStep, forwardDirection, rail`),
    5 вагонів × (`next, drawingPriority, train, dstEntranceIdx, type, direction, x_direction`, `location` (3), `rect` (4))).
13. `chains`: `g_collidedTrainsArrayLen`, пари вагонів, `g_trainDrawingChainLen`, кожен ланцюжок — id вагонів і `0`,
    `g_needToRedrawTrains`.
