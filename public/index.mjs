import Logo from './logo.js';
import hljs from '/highlight.js/lib/core.js';
import javascript from '/highlight.js/lib/languages/javascript.js';

hljs.registerLanguage('javascript', javascript);

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
