const commandInput = document.querySelector("#command");
const interpretButton = document.querySelector("#interpret");
const recordButton = document.querySelector("#record");
const confirmButton = document.querySelector("#confirm");
const cancelButton = document.querySelector("#cancel");
const clearMemoryButton = document.querySelector("#clear-memory");
const error = document.querySelector("#error");
const commandJson = document.querySelector("#command-json");
const confirmation = document.querySelector("#confirmation");
const status = document.querySelector("#status");
const memoryList = document.querySelector("#memory-list");
const recordingStatus = document.querySelector("#recording-status");

const memoryKey = "mnemarm-memory-v1";
let proposedAction = null;
let recorder = null;
let audioChunks = [];

const destinations = [
  { id: "green_marker", names: ["green marker", "green target", "green square", "green zone"] },
  { id: "zone_1", names: ["zone one", "zone 1", "left bin", "left"] },
  { id: "zone_2", names: ["zone two", "zone 2", "center bin", "centre bin", "center", "centre"] },
  { id: "zone_3", names: ["zone three", "zone 3", "right bin", "right"] },
];

function titleCaseZone(destination) {
  if (destination === "green_marker") return "the green marker";
  return destination.replace("zone_", "Zone ");
}

function parseCommand(raw) {
  const input = raw.toLowerCase().replace(/[.!?,]/g, " ").replace(/\s+/g, " ").trim();
  const hasMoveVerb = /\b(move|put|place|send)\b/.test(input);
  const objectMatch = input.match(/\b(blue\s+)?(block|cube|item|tool)\b/);
  const destination = destinations.find(({ names }) => names.some((name) => input.includes(name)));

  if (!hasMoveVerb || !objectMatch || !destination) {
    return null;
  }

  const object = objectMatch[1] ? "blue_block" : "block";

  return {
    intent: "move",
    object,
    destination: destination.id,
    policy: destination.id === "green_marker"
      ? "move_block_to_green_marker"
      : `pick_${object}_to_${destination.id}`,
  };
}

async function toggleRecording() {
  if (recorder?.state === "recording") {
    recorder.stop();
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    recorder = new MediaRecorder(stream);
    recorder.addEventListener("dataavailable", (event) => audioChunks.push(event.data));
    recorder.addEventListener("stop", async () => {
      stream.getTracks().forEach((track) => track.stop());
      recordButton.textContent = "Speak command";
      recordButton.classList.remove("active");
      recordingStatus.textContent = "Transcribing with ElevenLabs…";
      try {
        const audio = new Blob(audioChunks, { type: recorder.mimeType || "audio/webm" });
        const response = await fetch("/api/transcribe", {
          method: "POST",
          headers: { "Content-Type": audio.type },
          body: audio,
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error);
        commandInput.value = payload.text;
        recordingStatus.textContent = `Heard: “${payload.text}”`;
        interpret();
      } catch (caught) {
        recordingStatus.textContent = "Voice transcription is unavailable.";
        error.textContent = caught.message;
      }
    });
    recorder.start();
    recordButton.textContent = "Finish speaking";
    recordButton.classList.add("active");
    recordingStatus.textContent = "Listening… say a supported move command, then press Finish speaking.";
  } catch {
    recordingStatus.textContent = "Microphone access was not granted.";
    error.textContent = "Allow microphone access, then try again.";
  }
}

function updateStatus(text, className = "") {
  status.textContent = text;
  status.className = `pill ${className}`;
}

function getMemory() {
  return JSON.parse(localStorage.getItem(memoryKey) ?? "[]");
}

function saveMemory(entry) {
  const next = [entry, ...getMemory()].slice(0, 12);
  localStorage.setItem(memoryKey, JSON.stringify(next));
  renderMemory();
}

function renderMemory() {
  const entries = getMemory();
  memoryList.innerHTML = "";
  if (!entries.length) {
    memoryList.innerHTML = "<li>No commands remembered yet.</li>";
    return;
  }

  for (const entry of entries) {
    const item = document.createElement("li");
    const time = new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    item.innerHTML = `<strong>${entry.object.replace("_", " ")}</strong> → ${titleCaseZone(entry.destination)} <span>${entry.outcome} · ${time}</span>`;
    memoryList.append(item);
  }
}

async function speak(text) {
  try {
    const response = await fetch("/api/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (response.ok) {
      const audio = new Audio(URL.createObjectURL(await response.blob()));
      await audio.play();
      return;
    }
  } catch {
    // Browser speech is the intentional offline fallback.
  }

  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  }
}

function interpret() {
  proposedAction = parseCommand(commandInput.value);
  error.textContent = "";

  if (!proposedAction) {
    commandJson.textContent = "No supported command interpreted.";
    confirmation.textContent = "Use a move verb, ‘blue block,’ and Zone One/Two/Three (or left/center/right).";
    confirmButton.disabled = true;
    cancelButton.disabled = true;
    updateStatus("Needs clarification", "warning");
    error.textContent = "Example: Move the blue block to Zone One.";
    return;
  }

  commandJson.textContent = JSON.stringify(proposedAction, null, 2);
  confirmation.textContent = `I heard: Move ${proposedAction.object.replace("_", " ")} → ${titleCaseZone(proposedAction.destination)}.`;
  confirmButton.disabled = false;
  cancelButton.disabled = false;
  updateStatus("Awaiting confirmation", "waiting");
  speak(confirmation.textContent);
}

async function runMockAction() {
  if (!proposedAction) return;
  confirmButton.disabled = true;
  cancelButton.disabled = true;
  updateStatus("Robot running", "running");
  confirmation.textContent = `Running ${proposedAction.policy}.`;

  // Replace this delay with a POST to the future policy-router endpoint.
  await new Promise((resolve) => setTimeout(resolve, 1400));

  const result = `Visual verification: ${proposedAction.object.replace("_", " ")} placed at ${titleCaseZone(proposedAction.destination)}.`;
  confirmation.textContent = result;
  updateStatus("Verified", "verified");
  saveMemory({ ...proposedAction, outcome: "verified", timestamp: new Date().toISOString() });
  await speak(result);
  proposedAction = null;
}

interpretButton.addEventListener("click", interpret);
recordButton.addEventListener("click", toggleRecording);
commandInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") interpret();
});
confirmButton.addEventListener("click", runMockAction);
cancelButton.addEventListener("click", () => {
  proposedAction = null;
  commandJson.textContent = "Action cancelled.";
  confirmation.textContent = "No robot action was sent.";
  confirmButton.disabled = true;
  cancelButton.disabled = true;
  updateStatus("Cancelled");
});
clearMemoryButton.addEventListener("click", () => {
  localStorage.removeItem(memoryKey);
  renderMemory();
});

renderMemory();
