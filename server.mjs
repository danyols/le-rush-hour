import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const port = Number(process.env.PORT ?? 3000);
const publicDir = join(process.cwd(), "public");
const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
const elevenLabsVoice = process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM";

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

function send(response, status, body, headers = {}) {
  response.writeHead(status, { "Content-Length": body.length, ...headers });
  response.end(body);
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host}`);

  if (request.method === "POST" && url.pathname === "/api/speak") {
    let raw = "";
    for await (const chunk of request) raw += chunk;
    const text = JSON.parse(raw).text;

    if (!elevenLabsKey) {
      send(response, 503, Buffer.from(JSON.stringify({ error: "ElevenLabs is not configured." })), {
        "Content-Type": "application/json",
      });
      return;
    }

    try {
      const elevenResponse = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${elevenLabsVoice}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "xi-api-key": elevenLabsKey,
          },
          body: JSON.stringify({
            text,
            model_id: "eleven_multilingual_v2",
            voice_settings: { stability: 0.55, similarity_boost: 0.7 },
          }),
        },
      );

      if (!elevenResponse.ok) throw new Error(await elevenResponse.text());
      const audio = Buffer.from(await elevenResponse.arrayBuffer());
      send(response, 200, audio, { "Content-Type": "audio/mpeg" });
    } catch (error) {
      send(response, 502, Buffer.from(JSON.stringify({ error: "ElevenLabs request failed." })), {
        "Content-Type": "application/json",
      });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/transcribe") {
    if (!elevenLabsKey) {
      send(response, 503, Buffer.from(JSON.stringify({ error: "ElevenLabs is not configured. Add ELEVENLABS_API_KEY and restart." })), {
        "Content-Type": "application/json",
      });
      return;
    }

    try {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const audio = Buffer.concat(chunks);
      const form = new FormData();
      form.append("file", new Blob([audio], { type: request.headers["content-type"] ?? "audio/webm" }), "command.webm");
      form.append("model_id", "scribe_v2");
      form.append("language_code", "eng");

      const elevenResponse = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
        method: "POST",
        headers: { "xi-api-key": elevenLabsKey },
        body: form,
      });
      if (!elevenResponse.ok) throw new Error(await elevenResponse.text());
      const transcript = await elevenResponse.json();
      send(response, 200, Buffer.from(JSON.stringify({ text: transcript.text ?? "" })), {
        "Content-Type": "application/json",
      });
    } catch {
      send(response, 502, Buffer.from(JSON.stringify({ error: "ElevenLabs transcription failed. Check the API key and internet connection." })), {
        "Content-Type": "application/json",
      });
    }
    return;
  }

  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = normalize(join(publicDir, requested));
  if (!filePath.startsWith(publicDir)) {
    send(response, 403, Buffer.from("Forbidden"));
    return;
  }

  try {
    const content = await readFile(filePath);
    send(response, 200, content, { "Content-Type": mimeTypes[extname(filePath)] ?? "application/octet-stream" });
  } catch {
    send(response, 404, Buffer.from("Not found"));
  }
});

server.listen(port, () => {
  console.log(`MnemArm control panel: http://localhost:${port}`);
  console.log(elevenLabsKey ? "ElevenLabs TTS enabled." : "Browser speech fallback enabled.");
});
