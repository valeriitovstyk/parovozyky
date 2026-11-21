// ui/components/status_bar.cpp
import { i8 } from '../core/ints';
import { G } from '../game/globals';

/* 12ba:0003 */
export function showStatusMessage(msg: string, yOffset = 0): void {
  G.statusHook(msg);
  G.footerMessageTimeout = 7;
  G.emit({ type: 'status', text: msg, yOffset });
}

/* 12ba:005c */
export function updateStatusBar(): void {
  if (!G.footerMessageTimeout) return;
  G.footerMessageTimeout = i8(G.footerMessageTimeout - 1);
  if (G.footerMessageTimeout === 0) G.emit({ type: 'statusClear' });
}
