import md5 from './md5.mjs';

const searchFields = document.querySelectorAll('.search-field');
const info = document.querySelector('#info');
const results = document.querySelector('#results');
const loader = document.querySelector('.loader');
const table = document.querySelector('#search-results');
const packageTemplate = document.querySelector('#package-template');


document.addEventListener('click', async e => {
  if (!e.target.classList.contains('package-keyword')) return;
  for (const searchField of searchFields) {
    searchField.value = e.target.innerText;
  }
  const query = e.target.innerText.trim();
  await makeSearch(query);
});

document.addEventListener('input', e => {
  if (e.target.classList.contains('search-field')) {
    for (const searchField of searchFields) {
      if (searchField !== e.target) searchField.value = e.target.value;
    }
    const query = e.target.value.trim();
    if (query !== '') return;
    loader.classList.add('hidden');
    results.hidden = true;
    info.hidden = false;
    table.innerHTML = '';
  }
});

for (const searchField of searchFields) {
  searchField.addEventListener('keypress', async event => {
    if (event.key !== 'Enter') return;
    const query = searchField.value.trim();
    await makeSearch(query);
  });
}

const makeSearch = async query => {
  if (query === '') return;
  table.innerHTML = '';
  info.hidden = true;
  loader.classList.remove('hidden');
  const res = await fetch(`${window.location.origin}/-/api/search?query=${query}`);
  loader.classList.add('hidden');
  results.hidden = false;
  const { objects } = await res.json();
  for (const { package: pkg } of objects) {
    const tr = createTableRow(pkg);
    table.appendChild(tr);
  }
};

/* eslint-disable max-statements */
const createTableRow = pkg => {
  const {
    date,
    description,
    keywords,
    links: { homepage, npm, repository },
    name,
    version,
    publisher: { email, username },
  } = pkg;
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 1000 / 60 / 60 / 24);
  const grhash = md5(email.trim().toLowerCase());

  const packageNode = packageTemplate.content.cloneNode(true);

  packageNode.querySelector('.package-link').href = `${window.location.origin}/-/doc/${name}/${version}`;
  packageNode.querySelector('.package-avatar').src = `https://s.gravatar.com/avatar/${grhash}?size=32&default=retro`;
  packageNode.querySelector('.package-name').innerHTML = name;
  packageNode.querySelector('.package-version').innerHTML = version;
  packageNode.querySelector('.package-description').innerHTML = description;
  packageNode.querySelector('.package-website').href = homepage;
  packageNode.querySelector('.package-github').href = repository;
  packageNode.querySelector('.package-npm').href = npm;

  const packageKeywords = packageNode.querySelector('.package-keywords');
  if (Array.isArray(keywords)) {
    for (const keyword of keywords) {
      const div = document.createElement('div');
      div.classList.add('package-keyword');
      div.innerHTML = keyword.trim().replace(/\s+/g, '&nbsp;');
      packageKeywords.appendChild(div);
    }
  }

  packageNode.querySelector('.package-username').innerHTML = username;
  packageNode.querySelector('.package-date').innerHTML = days;

  return packageNode;
};
/* eslint-enable max-statements */
