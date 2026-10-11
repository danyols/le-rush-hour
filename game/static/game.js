// Shared client: WebSocket connection to the game server, plus helpers both pages use.

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
      state = null;
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

  // Short status for the phase chip.
  function phaseLabel(s) {
    if (!s) return "Offline";
    return {
      lobby: "Ready",
      starting: "Starting",
      dispatch: "Robot en route",
      charging: "Charging",
      refuel: s.mode === "choose" ? "Your move" : "Refuel",
      over: "Shift over",
    }[s.phase] || s.phase;
  }

  // Status of one building, for labels and cards.
  function buildingStatus(s, b) {
    if (b.charging) return "Charging";
    if (s.phase === "dispatch" && s.target === b.id) return "Incoming";
    if (b.energy <= 0) return "Offline";
    if (b.energy < 25) return "Low power";
    return "Powered";
  }

  // Fill `el` with the buttons that make sense for the current phase.
  function renderActions(el, s) {
    const canChoose = s && s.mode === "choose" && s.phase === "refuel" && !s.generator_at;
    const key = s ? `${s.phase}|${canChoose}` : "offline";
    if (el.dataset.key === key) return; // don't rebuild (and lose taps) on every update
    el.dataset.key = key;
    el.innerHTML = "";
    const button = (label, onClick, cls = "") => {
      const b = document.createElement("button");
      b.className = `btn ${cls}`;
      b.textContent = label;
      b.onclick = onClick;
      el.appendChild(b);
    };
    if (!s) return;
    if (s.phase === "lobby") button("Start shift", () => send("start"), "primary");
    if (s.phase === "over") button("Play again", () => send("start"), "primary");
    if (canChoose)
      s.buildings.forEach((b) => button(`Power the ${b.name}`, () => send("choose", { target: b.id })));
  }

  connect();
  return { onState, send, byId, fmtTime, phaseLabel, buildingStatus, renderActions };
})();
