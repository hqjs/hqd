import Logo from './logo.js';
import hljs from '/highlight.js/lib/core.js';
import javascript from '/highlight.js/lib/languages/javascript.js';

hljs.registerLanguage('javascript', javascript);

const fixedHeader = document.querySelector('.fixed-header');
const [ mainSearch, fixedSearch ] = document.querySelectorAll('.search-field');
const toggleFixedHeader = () => {
  if (window.scrollY >= 420) {
    fixedHeader.classList.remove('collapsed');
    if (document.activeElement === mainSearch) fixedSearch.focus({ preventScroll: true });
  } else {
    fixedHeader.classList.add('collapsed');
    if (document.activeElement === fixedSearch) mainSearch.focus({ preventScroll: true });
  }
};
toggleFixedHeader();
document.addEventListener('scroll', toggleFixedHeader);

document.body.addEventListener('click', e => {
  if (e.target.classList.contains('code-fold') && e.target.nextElementSibling) {
    e.target.classList.toggle('code-fold-expanded');
    e.target.nextElementSibling.classList.toggle('code-collapsed');
  }
});

const pause = timeout => new Promise(resolve => setTimeout(resolve, timeout));

const codeBlock = document.querySelector('.copy-code');
codeBlock.addEventListener('click', async () => {
  codeBlock.classList.add('code-block-copied');
  await navigator.clipboard.writeText(codeBlock.innerText);
  await pause(1000);
  codeBlock.classList.remove('code-block-copied');
});

const logoEl = document.querySelector('.js-logo');
new Logo(logoEl);

for (const block of document.querySelectorAll('pre code')) {
  hljs.highlightBlock(block);
}
