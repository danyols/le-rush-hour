// Shared client: WebSocket connection to the game server + the action buttons both pages use.

const RushHour = (() => {
  const listeners = [];
  let ws = null;
  let state = null;

  function connect() {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(`${proto}//${location.host}/ws`);
    ws.onmessage = (e) => {
      state = JSON.parse(e.data);
      listeners.forEach((fn) => fn(state));
    };
    ws.onclose = () => {
      listeners.forEach((fn) => fn(null));
      setTimeout(connect, 1000);
    };
  }

  function send(type, extra = {}) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type, ...extra }));
  }

  function onState(fn) {
    listeners.push(fn);
    if (state) fn(state);
  }

  const byId = (s, id) => s.buildings.find((b) => b.id === id);

  function fmtTime(s) {
    s = Math.ceil(s);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  // Fill `el` with the buttons that make sense for the current phase.
  function renderActions(el, s) {
    const key = s ? `${s.phase}|${s.mode}|${s.generator_at}` : "offline";
    if (el.dataset.key === key) return; // don't rebuild (and lose taps) every 100 ms
    el.dataset.key = key;
    el.innerHTML = "";
    const button = (label, onClick, cls = "") => {
      const b = document.createElement("button");
      b.className = `btn ${cls}`;
      b.textContent = label;
      b.onclick = onClick;
      el.appendChild(b);
      return b;
    };
    if (!s) return;
    if (s.phase === "lobby") button("Start shift", () => send("start"), "primary");
    if (s.phase === "over") button("Play again", () => send("start"), "primary");
    if (s.phase === "refuel") {
      if (s.mode === "choose") {
        s.buildings
          .filter((b) => b.id !== s.generator_at)
          .forEach((b) => {
            const btn = button(`⚡ Power ${b.name}`, () => send("refuel", { target: b.id }), "primary");
            btn.style.setProperty("--accent", b.color);
          });
      } else {
        button("⚡ Generator is back - Refuel", () => send("refuel"), "primary");
      }
    }
  }

  connect();
  return { onState, send, byId, fmtTime, renderActions };
})();
