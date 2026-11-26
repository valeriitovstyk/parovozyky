// Player settings (localStorage) and the toolbar: the player name (argv[1]
// of the original game: records and the start level), sound, shadows, the
// view mode and the fullscreen mode; moving the saved games in and out.
import { reslBookmarklet, reslExportScript, type ImportReport } from './transfer';

export type ViewMode = 'modern' | 'classic' | 'overlay';

export interface SettingsData {
  playerName: string;
  sound: boolean;
  shadows: boolean;
  view: ViewMode;
}

const KEY = 'parovozyky.settings';

export function loadSettings(): SettingsData {
  const def: SettingsData = { playerName: 'Unknown', sound: true, shadows: true, view: 'modern' };
  try {
    const legacy = localStorage.getItem('parovozyky.playerName');
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<SettingsData> | null;
    return { ...def, ...(legacy ? { playerName: legacy } : {}), ...(s ?? {}) };
  } catch {
    return def;
  }
}

export function saveSettings(s: SettingsData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage may be unavailable */
  }
}

/** the original game keeps the name in char[20] => at most 19 printable ASCII characters */
export function sanitizeName(s: string): string {
  return s.replace(/[^\x20-\x7e]/g, '').slice(0, 19).trim() || 'Unknown';
}

export class Settings {
  readonly root = document.createElement('div');

  constructor(
    private readonly s: SettingsData,
    private readonly cb: {
      changed: (what: keyof SettingsData) => void;
      fullscreen: () => void;
      exportReplay: () => void;
      importFiles: (files: File[]) => Promise<ImportReport>;
      exportSaves: () => number;
    },
  ) {
    this.root.className = 'toolbar';
    const gear = this.button('⚙', 'Settings');
    const panel = document.createElement('div');
    panel.className = 'settings';
    panel.hidden = true;
    gear.onclick = () => {
      panel.hidden = !panel.hidden;
      if (!panel.hidden) this.fill(panel);
    };
    const sound = this.button(s.sound ? '🔊' : '🔇', 'Sound');
    sound.onclick = () => {
      s.sound = !s.sound;
      sound.textContent = s.sound ? '🔊' : '🔇';
      cb.changed('sound');
    };
    const fs = this.button('⛶', 'Fullscreen');
    fs.onclick = () => cb.fullscreen();
    this.root.append(sound, fs, gear, panel);
  }

  private button(text: string, title: string): HTMLButtonElement {
    const b = document.createElement('button');
    b.textContent = text;
    b.title = title;
    b.setAttribute('aria-label', title);
    return b;
  }

  private fill(panel: HTMLElement): void {
    panel.replaceChildren();
    const row = (label: string, input: HTMLElement) => {
      const l = document.createElement('label');
      l.append(label, input);
      panel.append(l);
    };
    const name = document.createElement('input');
    name.value = this.s.playerName;
    name.maxLength = 19;
    name.name = 'playerName';
    name.addEventListener('keydown', (e) => e.stopPropagation());
    name.addEventListener('keyup', (e) => e.stopPropagation());
    row('Player name', name);
    const apply = document.createElement('button');
    apply.textContent = 'Start as this player';
    apply.onclick = () => {
      this.s.playerName = sanitizeName(name.value);
      name.value = this.s.playerName;
      this.cb.changed('playerName');
    };
    panel.append(apply);
    const shadows = document.createElement('input');
    shadows.type = 'checkbox';
    shadows.checked = this.s.shadows;
    shadows.onchange = () => {
      this.s.shadows = shadows.checked;
      this.cb.changed('shadows');
    };
    row('Shadows', shadows);
    const view = document.createElement('select');
    for (const [v, t] of [['modern', '3D'], ['classic', 'Classic (F2)'], ['overlay', 'Overlay (F3)']] as const) {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = t;
      view.append(o);
    }
    view.value = this.s.view;
    view.onchange = () => {
      this.s.view = view.value as ViewMode;
      this.cb.changed('view');
    };
    row('View', view);
    this.savesSection(panel);
    const replay = document.createElement('button');
    replay.textContent = 'Export replay (for a bug report)';
    replay.onclick = () => this.cb.exportReplay();
    panel.append(replay);
    const help = document.createElement('p');
    help.className = 'help';
    help.textContent =
      'Паровозики 1.0. Left click: switch / semaphore, next rail type. Right click: call the server / build. Space, the middle button or both buttons: mode. ' +
      '1/2/3: speed. Touch: tap = left, long tap = right, swipe = mode.';
    panel.append(help);
  }

  /** saved games and records: import (also by dropping files on the page), export, from the reSL web version */
  private savesSection(panel: HTMLElement): void {
    const box = document.createElement('fieldset');
    box.className = 'saves';
    const legend = document.createElement('legend');
    legend.textContent = 'Збережені ігри';
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.hidden = true;
    const imp = document.createElement('button');
    imp.textContent = 'Імпорт файлів…';
    imp.title = 'Збереження (????????.??_), results.tbl або zip; файли можна й просто перетягнути на сторінку';
    imp.onclick = () => input.click();
    const exp = document.createElement('button');
    exp.textContent = 'Експорт (zip)';
    const report = document.createElement('div');
    report.className = 'saves-report';
    input.onchange = () => {
      const files = Array.from(input.files ?? []);
      input.value = '';
      if (files.length) void this.cb.importFiles(files).then((r) => this.showReport(report, r));
    };
    exp.onclick = () => {
      const n = this.cb.exportSaves();
      report.textContent = n ? `Збережено файлів: ${n}` : 'Ще немає збережених ігор';
    };
    const row = document.createElement('div');
    row.className = 'saves-buttons';
    row.append(imp, exp);

    // the reSL web version keeps its files on its own site: a bookmarklet takes them out
    const resl = document.createElement('details');
    const sum = document.createElement('summary');
    sum.textContent = 'Перенести з веб-версії reSL';
    const steps = document.createElement('ol');
    const li = (...nodes: (Node | string)[]) => {
      const e = document.createElement('li');
      e.append(...nodes);
      steps.append(e);
    };
    const link = document.createElement('a');
    link.href = reslBookmarklet();
    link.textContent = 'ShortLine → zip';
    link.className = 'bookmarklet';
    link.onclick = (e) => {
      e.preventDefault();
      report.textContent = 'Цю кнопку треба перетягнути на панель закладок і натиснути вже на сторінці гри reSL.';
    };
    const site = document.createElement('a');
    site.href = 'https://konovalov-aleks.github.io/shortline-railroads.html';
    site.target = '_blank';
    site.rel = 'noopener';
    site.textContent = 'сторінку гри';
    const copy = document.createElement('button');
    copy.textContent = 'скопіювати код';
    copy.onclick = () => {
      void navigator.clipboard?.writeText(reslExportScript()).then(() => (report.textContent = 'Код скопійовано.'));
    };
    li('Перетягніть ', link, ' на панель закладок браузера.');
    li('Відкрийте ', site, ' (у тому ж браузері, де грали) і натисніть цю закладку — завантажиться shortline-saves.zip.');
    li('Тут натисніть «Імпорт файлів…» і виберіть цей zip (або перетягніть його на сторінку).');
    const alt = document.createElement('p');
    alt.className = 'help';
    alt.append('Без закладки: на сторінці гри відкрийте консоль (F12), вставте код і натисніть Enter — ', copy, '.');
    resl.append(sum, steps, alt);

    box.append(legend, row, resl, report, input);
    panel.append(box);
    this.report = report;
  }

  private report: HTMLElement | null = null;

  /** shows what an import brought (the settings panel opens) */
  showReport(target: HTMLElement | null, r: ImportReport): void {
    const el = target ?? this.report;
    if (!el) return;
    el.replaceChildren();
    const line = (t: string) => {
      const p = document.createElement('p');
      p.textContent = t;
      el.append(p);
      return p;
    };
    if (r.saves.length) line(`Ігор: ${r.saves.length} — у меню Archive.`);
    if (r.records) {
      line(r.records.length ? 'Рекорди гравців:' : 'Таблиця рекордів порожня.');
      for (const e of r.records.slice(0, 8)) {
        const p = line(`${e.name}: рівень ${e.level} `);
        if (e.name === this.s.playerName) p.append('(це ви)');
        else {
          const b = document.createElement('button');
          b.textContent = 'грати як цей гравець';
          b.onclick = () => {
            this.s.playerName = e.name;
            this.cb.changed('playerName');
            const input = this.root.querySelector<HTMLInputElement>('input[name=playerName]');
            if (input) input.value = e.name;
            p.textContent = `${e.name}: рівень ${e.level} (це ви)`;
          };
          p.append(b);
        }
      }
    }
    if (r.skipped.length) line(`Пропущено (не файли гри): ${r.skipped.slice(0, 5).join(', ')}${r.skipped.length > 5 ? '…' : ''}`);
    if (!r.saves.length && !r.records) line('Не знайдено збережень гри.');
  }

  /** opens the panel (after files were dropped on the page) */
  open(): HTMLElement | null {
    const panel = this.root.querySelector<HTMLElement>('.settings');
    if (panel && panel.hidden) {
      panel.hidden = false;
      this.fill(panel);
    }
    return this.report;
  }
}
