document.getElementById("toggle").addEventListener("click", () => {
  document.getElementById("details").hidden = false;
});
document.getElementById("nav").addEventListener("click", (event) => {
  event.preventDefault();
  history.pushState({}, "", "/second");
  document.querySelector("h1").textContent += " (second)";
});
