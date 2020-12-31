if (window.location.origin === 'https://pkg.hqjs.org') {
  const refs = document.querySelectorAll('.js-demo-warning');

  for (const ref of refs) {
    ref.classList.remove('demo-warning');
  }
}
