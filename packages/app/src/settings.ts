// Player settings (localStorage) and the toolbar: the player name (argv[1]
// of the original game: records and the start level), sound, shadows, the
// view mode and the fullscreen mode.
export type ViewMode = 'modern' | 'classic' | 'overlay';

export interface SettingsData {
  playerName: string;
  sound: boolean;
  shadows: boolean;
  view: ViewMode;
}

const KEY = 'shortline.settings';

export function loadSettings(): SettingsData {
  const def: SettingsData = { playerName: 'Unknown', sound: true, shadows: true, view: 'modern' };
  try {
    const legacy = localStorage.getItem('shortline.playerName');
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
    private readonly cb: { changed: (what: keyof SettingsData) => void; fullscreen: () => void; exportReplay: () => void },
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
    const replay = document.createElement('button');
    replay.textContent = 'Export replay (for a bug report)';
    replay.onclick = () => this.cb.exportReplay();
    panel.append(replay);
    const help = document.createElement('p');
    help.className = 'help';
    help.textContent =
      'Left click: switch / semaphore, next rail type. Right click: call the server / build. Both buttons or Space: mode. ' +
      '1/2/3: speed. Touch: tap = left, long tap = right, swipe = mode.';
    panel.append(help);
  }
}
