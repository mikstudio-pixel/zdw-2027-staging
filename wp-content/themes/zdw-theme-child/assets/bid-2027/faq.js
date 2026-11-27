document.querySelectorAll('.zdw-bid-faq details').forEach((details) => {
	const summary = details.querySelector('summary');
	if (!summary || !details.animate) return;

	const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
	let expanded = details.open;
	let animation = null;

	summary.addEventListener('click', (event) => {
		event.preventDefault();
		const from = details.getBoundingClientRect().height;
		expanded = !expanded;
		animation?.cancel();
		details.classList.toggle('is-closing', !expanded);

		const finish = () => {
			details.open = expanded;
			details.classList.remove('is-closing');
			details.style.removeProperty('overflow');
			animation = null;
		};

		if (reducedMotion.matches) {
			finish();
			return;
		}

		details.open = true;
		details.style.overflow = 'hidden';
		const style = getComputedStyle(details);
		const borders = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
		const to = expanded
			? details.getBoundingClientRect().height
			: summary.getBoundingClientRect().height + borders;

		animation = details.animate(
			[{ height: `${from}px` }, { height: `${to}px` }],
			{ duration: 260, easing: 'cubic-bezier(.2, 0, 0, 1)' }
		);
		animation.onfinish = finish;
	});
});
