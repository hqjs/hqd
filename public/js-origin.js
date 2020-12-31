const refs = document.querySelectorAll('.js-origin');

for (const ref of refs) {
  ref.innerText = ref.classList.contains('js-origin-rex') ?
    window.location.origin.replace(/\//g, '\\/') + ref.innerText :
    window.location.origin + ref.innerText;
}
