// Finds the red / green / yellow table markers in a camera frame by color.
//
// Each pixel is classified by hue (with minimum saturation/brightness), same-color pixels are
// grouped into connected blobs, and for every color the largest blob that looks like a solid
// patch (not a thin or ragged shape) wins. The blob's position and orientation come from its
// pixel covariance, which gives a rotated rectangle we can draw the building's floor tile on.
//
// Works on any {width, height, data: RGBA bytes} object, so it runs in the browser and in Node tests.

const ColorTrack = (() => {
  const COLORS = ["red", "green", "yellow"];

  // h = hue center in degrees, tol = +- hue window, smin/vmin = minimum saturation/value (0..1).
  // Tuned on the team's rings under the hackathon lights: red ~354, teal-green ~166, lime "yellow" ~70
  // (which washes out to very low saturation from far away), wood table ~12 with saturation 0.2.
  // Phone cameras differ, so the AR page lets players re-tune these by tapping each ring.
  const DEFAULTS = {
    red: { h: 355, tol: 16, smin: 0.4, vmin: 0.25 },
    green: { h: 155, tol: 28, smin: 0.3, vmin: 0.18 },
    yellow: { h: 68, tol: 16, smin: 0.12, vmin: 0.45 },
  };

  const MIN_AREA = 0.0008; // share of the frame a marker must cover
  const MAX_AREA = 0.25;
  const MIN_FILL = 0.55;   // blob pixels / its rectangle's area; rejects ragged shapes
  const MAX_ASPECT = 4;    // long side / short side

  function rgbToHsv(r, g, b) {
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return { h, s: max ? d / max : 0, v: max / 255 };
  }

  const hueDist = (a, b) => {
    const d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
  };

  // Per-pixel class: 0 = none, 1..3 = index into COLORS + 1.
  function classify(image, profiles) {
    const { width, height, data } = image;
    const cls = new Uint8Array(width * height);
    const p = COLORS.map((c) => profiles[c]);
    for (let i = 0, j = 0; i < cls.length; i++, j += 4) {
      const r = data[j], g = data[j + 1], b = data[j + 2];
      const max = Math.max(r, g, b);
      if (max < 40) continue; // too dark for any profile; skip the hsv math
      const hsv = rgbToHsv(r, g, b);
      for (let k = 0; k < 3; k++) {
        const q = p[k];
        if (hsv.s >= q.smin && hsv.v >= q.vmin && hueDist(hsv.h, q.h) <= q.tol) {
          cls[i] = k + 1;
          break;
        }
      }
    }
    return cls;
  }

  // Connected components (4-neighbour) with running moments, per color class.
  function blobs(cls, width, height) {
    const label = new Int32Array(cls.length);
    const stack = new Int32Array(cls.length);
    const out = [];
    for (let start = 0; start < cls.length; start++) {
      const k = cls[start];
      if (!k || label[start]) continue;
      const id = out.length + 1;
      let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, top = 0;
      stack[top++] = start;
      label[start] = id;
      while (top) {
        const i = stack[--top];
        const x = i % width, y = (i / width) | 0;
        n++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
        if (x > 0 && cls[i - 1] === k && !label[i - 1]) { label[i - 1] = id; stack[top++] = i - 1; }
        if (x < width - 1 && cls[i + 1] === k && !label[i + 1]) { label[i + 1] = id; stack[top++] = i + 1; }
        if (y > 0 && cls[i - width] === k && !label[i - width]) { label[i - width] = id; stack[top++] = i - width; }
        if (y < height - 1 && cls[i + width] === k && !label[i + width]) { label[i + width] = id; stack[top++] = i + width; }
      }
      out.push({ color: COLORS[k - 1], n, sx, sy, sxx, syy, sxy });
    }
    return out;
  }

  // Rotated rectangle from second moments: a uniform rectangle of side L has variance L^2 / 12.
  function toRect(b) {
    const cx = b.sx / b.n, cy = b.sy / b.n;
    const vxx = b.sxx / b.n - cx * cx, vyy = b.syy / b.n - cy * cy, vxy = b.sxy / b.n - cx * cy;
    const tr = vxx + vyy, det = vxx * vyy - vxy * vxy;
    const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
    const l1 = tr / 2 + disc, l2 = Math.max(tr / 2 - disc, 1e-6);
    const angle = 0.5 * Math.atan2(2 * vxy, vxx - vyy);
    const hu = Math.sqrt(3 * l1), hv = Math.sqrt(3 * l2); // half side lengths
    const ux = Math.cos(angle) * hu, uy = Math.sin(angle) * hu;
    const vx = -Math.sin(angle) * hv, vy = Math.cos(angle) * hv;
    const corners = [
      { x: cx - ux - vx, y: cy - uy - vy },
      { x: cx + ux - vx, y: cy + uy - vy },
      { x: cx + ux + vx, y: cy + uy + vy },
      { x: cx - ux + vx, y: cy - uy + vy },
    ];
    // clockwise on screen (y down), starting from the corner with the smallest angle
    corners.sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
    // angle = major axis direction (radians, screen coords); hu/hv = half lengths along major/minor axes.
    // A circle on a tilted table shows up as an ellipse with hv/hu = sin(viewing elevation).
    return { cx, cy, corners, angle, hu, hv, fill: b.n / (4 * hu * hv), aspect: hu / hv };
  }

  // Returns { red: {corners, cx, cy, area, fill} | null, green: ..., yellow: ... } in image pixels.
  // If `mask` (RGBA Uint8ClampedArray of the same size) is given, classified pixels are painted into it.
  function detect(image, profiles = DEFAULTS, mask = null) {
    const { width, height } = image;
    const cls = classify(image, profiles);
    const total = width * height;
    const found = { red: null, green: null, yellow: null };
    for (const b of blobs(cls, width, height)) {
      const area = b.n / total;
      if (area < MIN_AREA || area > MAX_AREA) continue;
      if (found[b.color] && found[b.color].n >= b.n) continue;
      const r = toRect(b);
      if (r.fill < MIN_FILL || r.aspect > MAX_ASPECT) continue;
      found[b.color] = { ...r, area, n: b.n };
    }
    if (mask) {
      const tint = { 1: [255, 60, 80], 2: [60, 230, 130], 3: [255, 215, 60] };
      for (let i = 0, j = 0; i < cls.length; i++, j += 4) {
        const t = tint[cls[i]];
        if (t) { mask[j] = t[0]; mask[j + 1] = t[1]; mask[j + 2] = t[2]; mask[j + 3] = 170; }
        else mask[j + 3] = 0;
      }
    }
    return found;
  }

  // Median HSV of a small square around (x, y) - used by tap-to-calibrate.
  function sample(image, x, y, r = 3) {
    const hs = [], ss = [], vs = [];
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const px = Math.round(x + dx), py = Math.round(y + dy);
        if (px < 0 || py < 0 || px >= image.width || py >= image.height) continue;
        const j = (py * image.width + px) * 4;
        const hsv = rgbToHsv(image.data[j], image.data[j + 1], image.data[j + 2]);
        hs.push(hsv.h); ss.push(hsv.s); vs.push(hsv.v);
      }
    const med = (a) => a.sort((p, q) => p - q)[a.length >> 1];
    // circular median-ish for hue: rotate so the first sample is at 180 before taking the median
    const ref = hs[0];
    const h = (med(hs.map((v) => (v - ref + 540) % 360)) + ref + 180) % 360;
    return { h, s: med(ss), v: med(vs) };
  }

  function profileFromSample(color, s) {
    return { h: s.h, tol: 16, smin: Math.max(0.1, s.s * 0.55), vmin: Math.max(0.12, s.v * 0.5) };
  }

  // Reorder `next` corners (cyclic shift) to line up with `prev`, so smoothing doesn't spin the tile.
  function align(prev, next) {
    let best = next, bestD = Infinity;
    for (let s = 0; s < 4; s++) {
      const cand = next.map((_, i) => next[(i + s) % 4]);
      const d = cand.reduce((a, p, i) => a + Math.hypot(p.x - prev[i].x, p.y - prev[i].y), 0);
      if (d < bestD) { bestD = d; best = cand; }
    }
    return best;
  }

  return { COLORS, DEFAULTS, detect, sample, profileFromSample, align, rgbToHsv };
})();

if (typeof module !== "undefined") module.exports = ColorTrack;
