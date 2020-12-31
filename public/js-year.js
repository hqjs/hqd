const refs = document.querySelectorAll('.js-year');

const year = new Date().getFullYear();

for (const ref of refs) {
  ref.innerText = year;
}
