// Runs before hydration so an invite code survives even an immediate language switch.
export const localeSwitchScript = `(function () {
  document.addEventListener("click", function (event) {
    var target = event.target;
    if (!(target instanceof Element)) return;
    var link = target.closest("a[data-locale-switch]");
    if (!link) return;
    var destination = new URL(link.href);
    destination.search = location.search;
    destination.hash = location.hash;
    link.href = destination.href;
  }, true);
})();`;
