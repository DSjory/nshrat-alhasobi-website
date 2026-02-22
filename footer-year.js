// footer-year.js — populate .footer-year with the current year
document.addEventListener('DOMContentLoaded', function () {
  try {
    var y = new Date().getFullYear();
    document.querySelectorAll('.footer-year').forEach(function (el) { el.textContent = y; });
  } catch (e) {
    // noop
  }
});
