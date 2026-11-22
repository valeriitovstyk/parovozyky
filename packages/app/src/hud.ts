// HTML HUD of the modern view: the header (odometers, dispatchers, menu
// button), the status bar, dialogs, the manual and the records. It only
// reads the simulator state; user actions are sent to the game as the same
// input the original handles (keys of the dialog items, mouse clicks).
import { DialogType, manualPages, type Sim } from '@shortline/sim';
import { colorOf } from '@shortline/render';
import { SCANCODES } from './input';

export interface HudActions {
  key(scancode: number): void;
  click(x: number, y: number, button: 'left' | 'right'): void;
}

const LABELS = ['Trains', 'Money', 'Year', 'Level'];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** the letter's DOS scan code (dialog.cpp: g_asciiToKeycodeTable) */
function letterScancode(c: string): number {
  return SCANCODES[`Key${c.toUpperCase()}`] ?? 0;
}

export class Hud {
  readonly root = el('div', 'hud');
  private readonly header = el('div', 'hud-header');
  private readonly status = el('div', 'hud-status');
  private readonly modal = el('div', 'hud-modal');
  private readonly digits: HTMLElement[][] = [];
  private readonly dispatchers = el('div', 'hud-dispatchers');
  private dispatchersKey = '';
  private modalKey = '';
  private statusKey = '\u0000';
  private pages: string[][] | null = null;

  constructor(private readonly actions: HudActions) {
    // odometers: every digit is a window over a strip "9 0 1 ... 9 0" (draw_header.cpp)
    LABELS.forEach((label, f) => {
      const box = el('div', `hud-field hud-field-${label.toLowerCase()}`);
      box.append(el('span', 'hud-label', label));
      const odo = el('span', 'hud-odo');
      if (f === 1) odo.append(el('span', 'hud-unit', '$'));
      const n = [5, 4, 4, 2][f];
      const cells: HTMLElement[] = [];
      for (let i = 0; i < n; ++i) {
        const cell = el('span', 'hud-digit');
        const strip = el('span', 'hud-strip');
        for (const d of ['9', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0']) strip.append(el('span', '', d));
        cell.append(strip);
        odo.append(cell);
        cells.unshift(strip); // digit 0 = the rightmost one
      }
      if (f === 1) odo.append(el('span', 'hud-unit', ',000'));
      box.append(odo);
      this.header.append(box);
      this.digits.push(cells);
    });
    const ent = el('div', 'hud-field');
    ent.append(el('span', 'hud-label', 'Entrances'), this.dispatchers);
    this.header.append(ent);
    const menu = el('button', 'hud-menu', '☰');
    menu.title = 'Pause';
    // MenuButton (600, 13) 24x21
    menu.onclick = () => this.actions.click(612, 23, 'left');
    this.header.append(menu);
    this.root.append(this.header, this.status, this.modal);
    // HUD controls are not game input
    for (const part of [this.header, this.modal])
      for (const t of ['pointerdown', 'pointerup', 'pointermove'])
        part.addEventListener(t, (e) => e.stopPropagation());
  }

  update(sim: Sim): void {
    const w = sim.world;
    const screen = w.video.screen;
    const inField = screen === 'game' || screen === 'menu' || screen === 'archive';
    this.root.dataset.screen = screen;
    this.header.hidden = !inField;
    this.status.hidden = !inField;

    // odometers
    w.headers.forEach((h, f) => {
      const cells = this.digits[f];
      for (let i = 0; i < cells.length; ++i) {
        const d = h.digitValues[i];
        const scroll = i <= h.curAnimatingDigit ? h.yScroll / 16 : 0;
        cells[i].style.transform = `translateY(${-(d + 1 + scroll) * (100 / 12)}%)`;
      }
    });

    // dispatchers: one per entrance, with a flag when trains are waiting
    const dk = Array.from({ length: w.entranceCount }, (_, i) => `${w.entrances[i].bgColor}:${w.entrances[i].waitingTrainsCount ? 1 : 0}`).join(',');
    if (dk !== this.dispatchersKey) {
      this.dispatchersKey = dk;
      this.dispatchers.replaceChildren(
        ...Array.from({ length: w.entranceCount }, (_, i) => {
          const e = w.entrances[i];
          const d = el('span', `hud-dispatcher${e.waitingTrainsCount ? ' waiting' : ''}`);
          d.style.setProperty('--c', `#${colorOf(e.bgColor).toString(16).padStart(6, '0')}`);
          d.title = e.waitingTrainsCount ? `${e.waitingTrainsCount} train(s) waiting` : 'Entrance';
          return d;
        }),
      );
    }

    // status bar
    const text = w.video.statusText || ' * SHORTLINE * Game by Andrei Snegov * (c) DOKA 1992 Moscow * Version 1.1 *';
    if (text !== this.statusKey) {
      this.statusKey = text;
      this.status.textContent = text;
      this.status.classList.toggle('message', !!w.video.statusText);
    }

    this.updateModal(sim);
  }

  private updateModal(sim: Sim): void {
    const w = sim.world;
    const screen = w.video.screen;
    let key = '';
    if (screen === 'manual') key = `manual:${w.video.manualPage}`;
    else if (screen === 'records') key = 'records';
    else if (w.video.dialog >= 0 && (screen === 'game' || screen === 'menu' || screen === 'archive'))
      key = `dialog:${w.video.dialog}:${w.dialogs[w.video.dialog].title}:${w.dialogs[w.video.dialog].itemNames.join('|')}`;
    if (key === this.modalKey) return;
    this.modalKey = key;
    this.modal.replaceChildren();
    this.modal.hidden = !key;
    if (!key) return;
    if (key.startsWith('dialog:')) this.modal.append(this.dialog(sim, w.video.dialog));
    else if (key === 'records') this.modal.append(this.records(sim));
    else this.modal.append(this.manual(w.video.manualPage));
  }

  private dialog(sim: Sim, type: DialogType): HTMLElement {
    const d = sim.world.dialogs[type];
    const box = el('div', `hud-dialog hud-dialog-${type}`);
    box.append(el('h2', '', d.title.trim()));
    const items = d.itemNames.filter((n): n is string => n !== null);
    if (!items.length) {
      // Alert: any key or click closes it
      const ok = el('button', 'hud-item', 'OK');
      ok.onclick = () => this.actions.key(SCANCODES.Enter);
      box.append(ok);
      box.classList.add('alert');
    }
    for (const name of items) {
      const label = name.trim();
      if (!label) continue;
      const b = el('button', 'hud-item');
      b.append(el('u', '', name[0]), document.createTextNode(name.slice(1)));
      b.dataset.item = label;
      b.onclick = () => this.actions.key(letterScancode(name[0]));
      box.append(b);
    }
    return box;
  }

  private manual(page: number): HTMLElement {
    this.pages ??= manualPages();
    const box = el('div', 'hud-manual');
    const close = el('button', 'hud-close', '✕');
    close.title = 'Close (Esc)';
    // CloseButton (600, 10) 24x21
    close.onclick = (e) => {
      e.stopPropagation();
      this.actions.click(610, 20, 'left');
    };
    const pre = el('pre', '', this.pages[page]?.join('\n') ?? '');
    const foot = el('div', 'hud-manual-foot', `Page ${page + 1} / ${this.pages.length} — click for the next page`);
    box.append(close, pre, foot);
    // a click on the screen switches the page
    box.onclick = () => this.actions.click(320, 200, 'left');
    return box;
  }

  private records(sim: Sim): HTMLElement {
    const r = sim.world.video.records ?? { byTrains: [], byYears: [] };
    const box = el('div', 'hud-records');
    const close = el('button', 'hud-close', '✕');
    close.onclick = () => this.actions.click(610, 20, 'left');
    box.append(close);
    const table = (title: string, head: string[], rows: string[][]) => {
      box.append(el('h2', '', title));
      const t = el('table');
      const tr = el('tr');
      head.forEach((h) => tr.append(el('th', '', h)));
      t.append(tr);
      for (const row of rows) {
        const x = el('tr');
        row.forEach((c) => x.append(el('td', '', c)));
        t.append(x);
      }
      if (!rows.length) {
        const x = el('tr');
        const td = el('td', 'empty', 'No records yet');
        td.colSpan = head.length;
        x.append(td);
        t.append(x);
      }
      box.append(t);
    };
    table('The best dispatchers', ['#', 'Name', 'Trains', 'Money', 'Year', 'Level'],
      r.byTrains.map((v, i) => [`${i + 1}`, v.name, `${v.trains}`, `${v.money},000`, `${v.year}`, `${v.level}`]));
    table('The best managers', ['#', 'Name', 'Level', 'Year', 'Money', 'Trains'],
      r.byYears.map((v, i) => [`${i + 1}`, v.name, `${v.level}`, `${v.year}`, `${v.money},000`, `${v.trains}`]));
    return box;
  }
}
