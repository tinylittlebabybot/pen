// tests i know the answers to. open index.html?test and read the page's title, or window.penTest.
// everything is rendered with the same book() the page plays with, into a context nobody hears.
(async function () {
  const P = window.pen, SR = 48000, out = {}, bad = [];
  async function render(strokes, seconds) {
    const c = new OfflineAudioContext(1, Math.ceil(seconds * SR), SR);
    const w = P.waveFor(c), dest = c.createGain(); dest.connect(c.destination);
    let n = 0;
    for (const s of strokes) for (const r of P.runs(s)) n += P.book(c, dest, w, r, 0, 0).length;
    const buf = await c.startRendering();
    return { x: buf.getChannelData(0), voices: n };
  }
  function goertzel(x, a, b, f) { let s1 = 0, s2 = 0; const k = 2 * Math.cos(2 * Math.PI * f / SR); for (let i = a; i < b; i++) { const s0 = x[i] + k * s1 - s2; s2 = s1; s1 = s0; } return s1 * s1 + s2 * s2 - k * s1 * s2; }
  function peak(x, t0, t1, lo, hi, step) { let best = 0, bf = 0; for (let f = lo; f <= hi; f += step) { const p = goertzel(x, Math.floor(t0 * SR), Math.floor(t1 * SR), f); if (p > best) { best = p; bf = f; } } return bf; }
  function rms(x, t0, t1) { let s = 0; const a = Math.floor(t0 * SR), b = Math.floor(t1 * SR); for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / (b - a)); }
  const near = (name, got, want, tol) => { if (!(Math.abs(got - want) <= tol)) bad.push(name + ": got " + got + ", wanted " + want); };
  const yes = (name, ok) => { if (!ok) bad.push(name); };

  // 1. a level line is one held note, where it's drawn and only there
  let r = await render([[[0.1, P.yOf(375)], [0.35, P.yOf(375)]]], 4);
  out.t1 = { voices: r.voices, hz: peak(r.x, 1.0, 2.6, 300, 450, 0.5), before: rms(r.x, 0, 0.75), after: rms(r.x, 2.95, 4) };
  near("1 held note", out.t1.hz, 375, 0.5); yes("1 one voice", r.voices === 1); yes("1 quiet outside", out.t1.before === 0 && out.t1.after < 1e-6);

  // 2. a leaning line: half way along, it's half way up in pitch (187.5 -> 750 goes through 375)
  r = await render([[[0.1, P.yOf(187.5)], [0.6, P.yOf(750)]]], 6);
  out.t2 = { early: peak(r.x, 1.0, 1.1, 150, 300, 1), mid: peak(r.x, 2.75, 2.85, 250, 500, 1), late: peak(r.x, 4.5, 4.6, 500, 900, 1) };
  near("2 early", out.t2.early, 187.5 * Math.pow(4, 0.0625), 4); near("2 middle", out.t2.mid, 375, 4); near("2 late", out.t2.late, 187.5 * Math.pow(4, 0.9375), 8);

  // 3. a loop is two voices: its top and its bottom, at the same time
  const loop = []; for (let i = 0; i <= 40; i++) { const a = 2 * Math.PI * i / 40; loop.push([0.3 + 0.1 * Math.cos(a), 0.5 + 0.1 * Math.sin(a)]); }
  r = await render([loop], 4);
  out.t3 = { runs: P.runs(loop).length, top: peak(r.x, 2.36, 2.44, 560, 900, 2), bottom: peak(r.x, 2.36, 2.44, 300, 500, 2) };
  yes("3 two runs", out.t3.runs === 2); near("3 top of the loop", out.t3.top, 750, 6); near("3 bottom of the loop", out.t3.bottom, 375, 6);

  // 4. straight down is a strike: all of it inside a twentieth of a second, and nothing anywhere else
  r = await render([[[0.25, 0.3], [0.25, 0.7]]], 3);
  out.t4 = { inside: rms(r.x, 1.99, 2.07), outside: Math.max(rms(r.x, 0, 1.98), rms(r.x, 2.1, 3)) };
  yes("4 a strike is short", out.t4.inside > 0.05 && out.t4.outside < 1e-6);

  // 5. a tap is a grain at its own pitch
  r = await render([[[0.25, P.yOf(750)]]], 3);
  out.t5 = { hz: peak(r.x, 2.0, 2.03, 600, 900, 2), outside: Math.max(rms(r.x, 0, 1.99), rms(r.x, 2.05, 3)) };
  near("5 grain", out.t5.hz, 750, 12); yes("5 grain is short", out.t5.outside < 1e-6);

  // 6. a page survives being a link
  const f = P.fence(), back = P.decode(P.encode(f));
  let worst = 0; f.forEach((s, i) => s.forEach((p, j) => { worst = Math.max(worst, Math.abs(p[0] - back[i][j][0]), Math.abs(p[1] - back[i][j][1])); }));
  out.t6 = { strokes: f.length, back: back.length, worst, chars: P.encode(f).length };
  yes("6 link", back.length === f.length && worst < 1 / 4000);

  // 7. the fence: the rail is my 81/16, and at a knuckle (2.0 s in: 0.25 of the way across) wires 0 and 1 are one note: 281.25
  r = await render(f, 8.2);
  out.t7 = { voices: r.voices, rail: peak(r.x, 3.0, 3.6, 930, 970, 0.5), knuckle: peak(r.x, 0.24 + 0.94 * 0.25 * 8 - 0.03, 0.24 + 0.94 * 0.25 * 8 + 0.03, 240, 330, 1) };
  near("7 rail", out.t7.rail, 949.2, 1); near("7 knuckle", out.t7.knuckle, 281.25, 12);

  // 8. a zigzag that never turns back is one voice; one that doubles back is two
  yes("8 zigzag", P.runs([[0.1, 0.2], [0.2, 0.6], [0.3, 0.2], [0.4, 0.6]]).length === 1 && P.runs([[0.1, 0.2], [0.3, 0.4], [0.2, 0.6]]).length === 2);

  // 9. a full page doesn't clip: the fence three times over, through the same squeeze the page uses
  {
    const c = new OfflineAudioContext(1, Math.ceil(8.3 * SR), SR), w = P.waveFor(c), dest = P.chain(c);
    for (let k = 0; k < 3; k++) for (const s of f) for (const r2 of P.runs(s.map(p => [p[0], Math.min(1, p[1] + 0.04 * k)]))) P.book(c, dest, w, r2, 0, 0);
    const x = (await c.startRendering()).getChannelData(0);
    let top = 0; for (let i = 0; i < x.length; i++) top = Math.max(top, Math.abs(x[i]));
    out.t9 = { top };
    yes("9 no clipping (" + top.toFixed(2) + ")", top < 1.0);
  }

  // 10. the same line drawn high is played softer than drawn low (an ear takes high notes as louder)
  {
    const lo = await render([[[0.1, P.yOf(187.5)], [0.35, P.yOf(187.5)]]], 4), hi = await render([[[0.1, P.yOf(1500)], [0.35, P.yOf(1500)]]], 4);
    out.t10 = { low: rms(lo.x, 1.2, 2.4), high: rms(hi.x, 1.2, 2.4) };
    near("10 high lines are softer", out.t10.low / out.t10.high, P.tilt(187.5) / P.tilt(1500), 0.05);
    yes("10 by about a half", out.t10.low / out.t10.high > 1.8 && out.t10.low / out.t10.high < 3);
  }

  out.bad = bad;
  window.penTest = out;
  document.title = bad.length ? "FAILED: " + bad.join(" | ") : "all 10 ok";
})();
