import coffeescript from '/highlight.js/lib/languages/coffeescript.js';
import css from '/highlight.js/lib/languages/css.js';
import hljs from '/highlight.js/lib/core.js';
import javascript from '/highlight.js/lib/languages/javascript.js';
import json from '/highlight.js/lib/languages/json.js';
import less from '/highlight.js/lib/languages/less.js';
import scss from '/highlight.js/lib/languages/scss.js';
import shell from '/highlight.js/lib/languages/shell.js';
import showdown from '/showdown';
import typescript from '/highlight.js/lib/languages/typescript.js';
import xml from '/highlight.js/lib/languages/xml.js';

hljs.registerLanguage('coffeescript', coffeescript);
hljs.registerLanguage('css', css);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('json', json);
hljs.registerLanguage('less', less);
hljs.registerLanguage('scss', scss);
hljs.registerLanguage('shell', shell);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('xml', xml);

const [ , packageName, packageVersion ] = location.pathname.match(/-\/doc\/(.*)\/(.*)/);
const packageURL = `${window.location.origin}/${packageName}@${packageVersion}`;
const rawPackageURL = `${window.location.origin}/-/api/raw/${packageName}@${packageVersion}`;

const pause = timeout => new Promise(resolve => setTimeout(resolve, timeout));

const importLinkElement = document.querySelector('.import-link');
const importContainerElement = document.querySelector('.import-container');
importLinkElement.innerText = packageURL;
importContainerElement.addEventListener('click', async () => {
  importContainerElement.classList.add('import-container-copied');
  await navigator.clipboard.writeText(packageURL);
  await pause(1000);
  importContainerElement.classList.remove('import-container-copied');
});

const loader = document.querySelector('.container .loader');

const packageNameElement = document.querySelector('#package-name');
const packageDescriptionElement = document.querySelector('#package-description');
const packageWebsiteElement = document.querySelector('.package-website');
const packageGithubElement = document.querySelector('.package-github');
const packageNPMElement = document.querySelector('.package-npm');
const dependenciesAmountElement = document.querySelector('.package-dependencies-amount');
const dependenciesListElement = document.querySelector('.package-dependencies-list');
packageNameElement.innerText = packageName;
const fetchPackageJSON = async () => {
  const res = await fetch(`${packageURL}/package.json`);
  const packageJSON = await res.json();
  packageDescriptionElement.innerText = packageJSON.description;
  packageWebsiteElement.href = packageJSON.homepage;
  packageGithubElement.href = packageJSON.repository.url;
  packageNPMElement.href = `https://www.npmjs.com/package/${packageName}/v/${packageVersion}`;
  const deps = Object.keys(packageJSON.dependencies || []);
  dependenciesAmountElement.innerHTML = deps.length;
  for (const dep of deps) {
    const dependency = document.createElement('a');
    dependency.href = `${window.location.origin}/-/doc/${dep}`;
    dependency.classList.add('package-dependency');
    dependency.innerText = dep;
    dependenciesListElement.appendChild(dependency);
  }
};
fetchPackageJSON();

const dependenciescontainerElement = document.querySelector('.package-dependencies-amount-container');
dependenciescontainerElement.addEventListener('click', () => {
  dependenciescontainerElement.classList.toggle('package-dependencies-amount-container-expanded');
  dependenciesListElement.classList.toggle('package-dependencies-list-expanded');
});

const packageVersionsSelectElement = document.querySelector('#versions');
const fetchPackageVersions = async () => {
  const res = await fetch(`${window.location.origin}/-/api/info/${packageName}?path=versions`);
  const versions = await res.json();

  const sortedVersions = Object.keys(versions).sort((a, b) => {
    const [ majA, minA, patchA ] = a.split('.');
    const [ majB, minB, patchB ] = b.split('.');
    return (majA > majB) |
      (majA === majB) && (minA > minB) |
      (minA === minB) && patchA > patchB;
  });
  for (const version of sortedVersions) {
    const option = document.createElement('option');
    option.value = version;
    option.text = version;
    packageVersionsSelectElement.appendChild(option);
  }

  packageVersionsSelectElement.value = packageVersion;

  packageVersionsSelectElement.addEventListener('change', e => {
    window.location.href = `${window.location.origin}/-/doc/${packageName}/${e.target.value}`;
  });
};
fetchPackageVersions();

const fileNameElement = document.querySelector('.filename');
const fileTreeElement = document.querySelector('.filetree');
fileNameElement.addEventListener('click', () => {
  fileNameElement.classList.toggle('filename-expanded');
  fileTreeElement.classList.toggle('filetree-expanded');
});

fileTreeElement.addEventListener('click', e => {
  if (e.target.classList.contains('filetree-directory')) {
    e.target.classList.toggle('filetree-directory-opened');
    e.target.querySelector('ul').classList.toggle('filetree-directory-folded');
  } else if (e.target.classList.contains('filetree-file')) {
    fetchFile(e.target.dataset.path);
  } else if (e.target.parentNode && e.target.parentNode.classList.contains('filetree-file')) {
    fetchFile(e.target.parentNode.dataset.path);
  }
});

const getSize = size => {
  const kb = Math.round(size / 1024);
  if (kb === 0) return `0.${Math.round(size / 100) || 1} Kb`;
  const mb = Math.round(kb / 1024);
  if (mb === 0) return `${kb} Kb`;
  return `${mb} Mb`;
};

const createDirEl = (root, base) => {
  const dir = document.createElement('div');
  dir.classList.add('filetree-directory');
  dir.innerText = root.name;
  const ul = document.createElement('ul');
  ul.classList.add('filetree-directory-folded');
  for (const child of root.children) {
    const li = document.createElement('li');
    li.appendChild(createFileElement(child, `${base}${root.name}/`));
    ul.appendChild(li);
  }
  dir.appendChild(ul);
  return dir;
};

const createFileEl = (root, base) => {
  const file = document.createElement('div');
  file.dataset.path = `${base}${root.name}`;
  file.classList.add('filetree-file');
  const fileName = document.createElement('div');
  fileName.classList.add('filetree-file-name');
  fileName.innerText = root.name;
  const fileSize = document.createElement('div');
  fileSize.innerText = getSize(root.size);
  file.appendChild(fileName);
  file.appendChild(fileSize);
  if (root.name === 'README.md') file.classList.add('filetree-current');
  return file;
};

const createFileElement = (root, base = '') => root.children ? createDirEl(root, base) : createFileEl(root, base);

const fetchPackageFileTree = async () => {
  const res = await fetch(`${window.location.origin}/-/api/filetree/${packageName}@${packageVersion}`);
  const filetree = await res.json();
  for (const child of filetree.children) {
    const li = document.createElement('li');
    li.appendChild(createFileElement(child));
    fileTreeElement.appendChild(li);
  }
};
fetchPackageFileTree();

const extname = file => {
  const parts = file.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
};

const fetchMD = async file => {
  // TODO: add db cache
  const res = await fetch(`${rawPackageURL}/${file}`);
  const content = await res.text();

  fileContentElement.innerHTML = converter.makeHtml(content);
  for (const a of fileContentElement.querySelectorAll('a')) {
    if (a.href.startsWith(`${window.location.origin}/-/doc`)) a.classList.add('js-internal-link');
    a.target = '_blank';
    a.href = a.href.replace(`${window.location.origin}/-/doc`, window.location.origin);
  }
  for (const img of fileContentElement.querySelectorAll('img')) {
    img.src = img.src.replace(`${window.location.origin}/-/doc`, window.location.origin);
  }
  for (const block of fileContentElement.querySelectorAll('pre code')) {
    if (block.classList.contains('sh')) {
      block.classList.remove('sh');
      block.classList.remove('language-sh');
      block.classList.add('shell');
      block.classList.add('language-shell');
    }
    hljs.highlightBlock(block);
  }
  // generateCodeMirror();
};

const fetchCode = async (file, lang = 'nohighlight') => {
  // TODO: add db cache
  const res = await fetch(`${rawPackageURL}/${file}`);
  const content = await res.text();
  const block = `<code class="${lang} language-${lang}">${content}</code>`;
  fileContentElement.innerHTML = `<pre class="scrollable">${block}</pre>`;
  hljs.highlightBlock(fileContentElement.querySelector('pre code'));
};

const fetchImg = async file => {
  // TODO: add db cache
  const res = await fetch(`${rawPackageURL}/${file}`);
  const myBlob = await res.blob();
  const objectURL = URL.createObjectURL(myBlob);
  const bkg = document.createElement('div');
  bkg.classList.add('image-background');
  const img = document.createElement('img');
  img.src = objectURL;
  img.onload = () => {
    const sizeHint = document.createElement('div');
    sizeHint.innerText = `${img.width}x${img.height}`;
    sizeHint.classList.add('image-hint');
    bkg.appendChild(sizeHint);
  };
  bkg.appendChild(img);
  fileContentElement.innerHTML = '';
  fileContentElement.appendChild(bkg);
};

/* eslint-disable complexity */
const fileContentElement = document.querySelector('#file-content');
const converter = new showdown.Converter();
const fetchFile = async file => {
  const ext = extname(file);
  loader.classList.remove('hidden');
  fileContentElement.innerHTML = '';
  fileNameElement.innerText = file;
  const current = fileTreeElement.querySelector('.filetree-current');
  if (current) current.classList.remove('filetree-current');
  const next = fileTreeElement.querySelector(`.filetree-file[data-path="${file}"]`);
  if (next) next.classList.add('filetree-current');
  switch (ext) {
    case 'md': await fetchMD(file);
      break;
    case 'js':
    case 'mjs':
    case 'jsx': await fetchCode(file, 'js');
      break;
    case 'ts':
    case 'tsx': await fetchCode(file, 'ts');
      break;
    case 'coffee': await fetchCode(file, 'coffee');
      break;
    case 'css': await fetchCode(file, 'css');
      break;
    case 'sass': await fetchCode(file, 'sass');
      break;
    case 'scss': await fetchCode(file, 'scss');
      break;
    case 'less': await fetchCode(file, 'less');
      break;
    case 'eslintrc':
    case 'babelrc':
    case 'json': await fetchCode(file, 'json');
      break;
    case 'html': await fetchCode(file, 'html');
      break;
    case 'sh': await fetchCode(file, 'shell');
      break;
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'webp':
    case 'svg': await fetchImg(file);
      break;
    default: await fetchCode(file);
      break;
  }
  loader.classList.add('hidden');
};
/* eslint-enable complexity */
fetchFile('README.md');

document.addEventListener('click', e => {
  if (e.target.classList.contains('js-internal-link')) {
    e.preventDefault();
    const base = `${window.location.origin}/${packageName}`;
    const file = e.target.href.slice(base.length + 1);
    fetchFile(file);
  }
});
