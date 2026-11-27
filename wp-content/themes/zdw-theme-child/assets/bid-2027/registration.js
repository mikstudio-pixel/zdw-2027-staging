const bidForm = document.querySelector('.zdw-bid-registration form');

if (bidForm) {
  const refresh = () => {
    bidForm.querySelectorAll('[data-condition]').forEach((group) => {
      const trigger = bidForm.elements.namedItem(group.dataset.condition);
      const visible = trigger.value === group.dataset.value;
      group.hidden = !visible;
      group.querySelectorAll('input, textarea, select, button').forEach((input) => {
        input.disabled = !visible;
      });
    });
  };
  bidForm.addEventListener('change', refresh);
  refresh();

  const team = bidForm.querySelector('[data-team-members]');
  const add = team.querySelector('[data-add-member]');
  const template = bidForm.querySelector('template');
  let next = team.querySelectorAll('[data-member]').length;

  add.addEventListener('click', () => {
    const row = template.content.cloneNode(true);
    row.querySelectorAll('input').forEach((input) => {
      input.name = input.name.replace('INDEX', String(next));
    });
    next += 1;
    add.before(row);
    add.previousElementSibling.querySelector('input').focus();
  });

  team.addEventListener('click', (event) => {
    if (!event.target.matches('[data-remove-member]')) return;
    event.target.closest('[data-member]').remove();
    add.focus();
  });
}
