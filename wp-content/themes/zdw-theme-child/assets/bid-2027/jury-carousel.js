const juryCarousel = document.querySelector('.zdw-bid-jury-carousel');
const juryTrack = juryCarousel?.querySelector('.zdw-bid-jury-track > .wp-block-group__inner-container');
const juryControls = juryCarousel?.querySelector('.zdw-bid-jury-controls');

if (juryTrack && juryControls && juryTrack.children.length > 1) {
  const previous = juryControls.querySelector('[data-direction="-1"]');
  const next = juryControls.querySelector('[data-direction="1"]');
  const arrowSvg = (dir) =>
    `<svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true" focusable="false"><path d="${
      dir < 0 ? 'M15 9H3M7.5 4.5 3 9l4.5 4.5' : 'M3 9h12M10.5 4.5 15 9l-4.5 4.5'
    }" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" stroke-linejoin="miter"/></svg>`;
  if (previous) previous.innerHTML = arrowSvg(-1);
  if (next) next.innerHTML = arrowSvg(1);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const updateControls = () => {
    const remaining = juryTrack.scrollWidth - juryTrack.clientWidth - juryTrack.scrollLeft;
    previous.disabled = juryTrack.scrollLeft <= 1;
    next.disabled = remaining <= 1;
  };
  const move = (direction) => {
    const [first, second] = juryTrack.children;
    const step = second.getBoundingClientRect().left - first.getBoundingClientRect().left;
    juryTrack.scrollBy({ left: direction * step, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
  };

  juryTrack.id = 'bid-jury-track';
  juryTrack.tabIndex = 0;
  juryTrack.setAttribute('role', 'group');
  juryTrack.setAttribute('aria-labelledby', 'judges');
  juryControls.hidden = false;
  previous.addEventListener('click', () => move(-1));
  next.addEventListener('click', () => move(1));
  juryTrack.addEventListener('keydown', (event) => {
    if (event.target !== juryTrack || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    move(event.key === 'ArrowLeft' ? -1 : 1);
  });
  juryTrack.addEventListener('scroll', updateControls, { passive: true });
  new ResizeObserver(updateControls).observe(juryTrack);
  updateControls();
}
