/**
 * Opens a map's credit while a mouse is over it; a finger taps it. The credit is a <details> on
 * both maps. The class is the one MapLibre's own control opens with.
 */
export function openCreditOnHover(credit: HTMLElement): void {
  const set = (open: boolean) => (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return;
    credit.classList.toggle('maplibregl-compact-show', open);
    credit.toggleAttribute('open', open);
  };
  credit.addEventListener('pointerenter', set(true));
  credit.addEventListener('pointerleave', set(false));
}
