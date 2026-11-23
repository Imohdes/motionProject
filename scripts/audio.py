"""Synthesised soundtrack for the video: a light 120 BPM corporate bed + SFX on animation cues.

usage: python3 scripts/audio.py <cues.json> <out.wav> [duration]
cues.json: [{"t": seconds, "type": "whoosh|key|tap|...", "v": gain}, ...] (exported by the composition)
"""
import json
import sys

import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 48000
BPM = 120
BEAT = 60 / BPM
rng = np.random.default_rng(3)

_data = json.load(open(sys.argv[1]))
cues, MK = (_data['cues'], _data['marks']) if isinstance(_data, dict) else (_data, {'steps': [3, 6, 9, 12, 15], 'sum': 18, 'end': 20, 'dur': 25})
OUT = sys.argv[2]
DUR = float(sys.argv[3]) if len(sys.argv) > 3 else float(MK['dur'])
ST, SUMT, ENDT = MK['steps'], MK['sum'], MK['end']
G0 = ST[0]            # groove start
FADE0 = DUR - 1.9     # music fade-out start
N = int(SR * (DUR + 0.5))

music = np.zeros((N, 2))
sfx = np.zeros((N, 2))
verb_send = np.zeros((N, 2))


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def tt(n):
    return np.arange(n) / SR


def put(buf, x, t0, gain=1.0, pan=0.0, send=0.0):
    """Add mono/stereo x at time t0 with constant-power pan."""
    i = int(round(t0 * SR))
    if i >= len(buf):
        return
    if x.ndim == 1:
        l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        x = np.stack([x * l, x * r], 1) * np.sqrt(2)
    j0 = max(0, -i)
    x = x[j0:]
    i = max(i, 0)
    n = min(len(x), len(buf) - i)
    buf[i:i + n] += x[:n] * gain
    if send:
        verb_send[i:i + n] += x[:n] * gain * send


def lp(x, fc, order=2):
    b, a = signal.butter(order, min(fc, SR / 2 - 100) / (SR / 2), 'low')
    return signal.lfilter(b, a, x, axis=0)


def hp(x, fc, order=2):
    b, a = signal.butter(order, fc / (SR / 2), 'high')
    return signal.lfilter(b, a, x, axis=0)


def bp(x, lo, hi, order=2):
    b, a = signal.butter(order, [lo / (SR / 2), min(hi, SR / 2 - 100) / (SR / 2)], 'band')
    return signal.lfilter(b, a, x, axis=0)


def sweep_bp(noise, f0, f1, q=2.0, steps=48):
    """Band-pass noise with a centre frequency sweeping f0 -> f1 (piecewise)."""
    out = np.zeros_like(noise)
    seg = int(np.ceil(len(noise) / steps))
    win = np.hanning(seg * 2)
    for k in range(steps):
        fc = f0 * (f1 / f0) ** (k / max(1, steps - 1))
        lo, hi = fc / (1 + 1 / q), fc * (1 + 1 / q)
        a = max(0, k * seg - seg // 2)
        b = min(len(noise), a + seg * 2)
        chunk = bp(noise[a:b], max(30, lo), hi)
        out[a:b] += chunk * win[: b - a]
    return out


def env_adsr(n, a=0.01, d=0.1, s=0.7, r=0.2):
    e = np.ones(n) * s
    na, nd, nr = int(a * SR), int(d * SR), int(r * SR)
    na = min(na, n)
    e[:na] = np.linspace(0, 1, na, endpoint=False)
    if nd:
        e[na:na + nd] = np.linspace(1, s, min(nd, max(0, n - na)), endpoint=False)[: max(0, min(nd, n - na))]
    if nr and n > nr:
        e[-nr:] *= np.linspace(1, 0, nr)
    return e


# ------------------------------------------------------------------ instruments
def saw(f, n, detune=0.0):
    ph = np.cumsum(np.full(n, f * 2 ** (detune / 1200) / SR)) + rng.random()
    return 2 * (ph % 1) - 1


def pad_note(m, dur, bright=1800):
    n = int(dur * SR)
    f = mtof(m)
    x = sum(saw(f, n, d) for d in (-9, -3, 4, 10)) / 4
    x = lp(x, bright, 2)
    return x * env_adsr(n, a=0.5, d=0.4, s=0.85, r=0.7)


def pluck(m, dur=0.35):
    n = int(dur * SR)
    t = tt(n)
    f = mtof(m)
    x = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(4 * np.pi * f * t) + 0.12 * np.sin(6 * np.pi * f * t)
    return x * np.exp(-t / 0.11) * np.minimum(1, t / 0.003)


def bass_note(m, dur):
    n = int(dur * SR)
    t = tt(n)
    f = mtof(m)
    x = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t)
    return x * env_adsr(n, a=0.008, d=0.12, s=0.6, r=0.06)


def kick(g=1.0):
    n = int(0.45 * SR)
    t = tt(n)
    f = 45 + 95 * np.exp(-t / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph) * np.exp(-t / 0.18)
    click = lp(rng.standard_normal(n), 3000) * np.exp(-t / 0.004) * 0.25
    return (x + click) * g


def hat(g=1.0, open_=False):
    n = int((0.25 if open_ else 0.07) * SR)
    t = tt(n)
    x = hp(rng.standard_normal(n), 7000) * np.exp(-t / (0.08 if open_ else 0.018))
    return x * g


def clap(g=1.0):
    n = int(0.3 * SR)
    t = tt(n)
    nz = bp(rng.standard_normal(n), 900, 4000)
    e = np.exp(-t / 0.11)
    for d in (0.0, 0.011, 0.022):
        e += 0.6 * np.exp(-np.maximum(0, t - d) / 0.006) * (t >= d)
    return nz * e * 0.5 * g


def bell(f, dur=0.8, tau=0.25):
    n = int(dur * SR)
    t = tt(n)
    x = np.sin(2 * np.pi * f * t) + 0.4 * np.sin(2 * np.pi * f * 2.0 * t) * np.exp(-t / 0.08) + 0.2 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t / 0.05)
    return x * np.exp(-t / tau) * np.minimum(1, t / 0.002)


# ------------------------------------------------------------------ arrangement
CH = {  # pad voicing, bass root
    'Am': ([57, 60, 64, 69], 45), 'F': ([57, 60, 65, 69], 41), 'C': ([55, 60, 64, 67], 48),
    'G': ([55, 59, 62, 67], 43), 'Cend': ([55, 60, 64, 67, 72], 36),
}
_b = [0] + list(ST) + [SUMT, ENDT, DUR]
SECTIONS = [(_b[i], _b[i + 1], n) for i, n in enumerate(['Am', 'F', 'C', 'G', 'Am', 'F', 'G', 'Cend'])]

for a, b, name in SECTIONS:
    notes, root = CH[name]
    dur = (b - a) + 0.8
    bright = 1100 if a < G0 else (2600 if name == 'Cend' else 1800)
    for k, m in enumerate(notes):
        put(music, pad_note(m, dur, bright), a - 0.05, 0.10, pan=(k / (len(notes) - 1) - 0.5) * 0.8, send=0.5)
    # bass in 8ths (groove sections)
    if G0 <= a < ENDT:
        for i in range(int(round((b - a) / (BEAT / 2)))):
            t0 = a + i * BEAT / 2
            put(music, bass_note(root, BEAT / 2 * 0.9), t0, 0.22 if i % 2 == 0 else 0.15)
    if name == 'Cend':
        put(music, bass_note(root, 4.5) * np.exp(-tt(int(4.5 * SR)) / 1.6), a, 0.32)
    # arpeggio 16ths
    if G0 <= a < ENDT or name == 'Cend':
        pat = [0, 1, 2, 3, 2, 1, 3, 2]
        steps = int(round((min(b, FADE0) - a) / (BEAT / 4)))
        for i in range(steps):
            m = notes[pat[i % len(pat)] % len(notes)] + 12
            g = 0.075 * (1.0 if i % 4 == 0 else 0.7)
            if name == 'Cend':
                g *= max(0, 1 - i / steps) * 0.9
            put(music, pluck(m), a + i * BEAT / 4, g, pan=0.35 * np.sin(i * 1.3), send=0.35)

# drums
def beat_range(a, b, step):
    t = a
    while t < b - 1e-6:
        yield t
        t += step

for t0 in beat_range(G0, ENDT - 1, BEAT):
    bi = round((t0 - G0) / BEAT)
    put(music, kick(), t0, 0.40)
    if bi % 4 in (1, 3) and t0 < SUMT:
        put(music, clap(), t0, 0.20, send=0.25)
for t0 in beat_range(G0 + BEAT / 2, SUMT, BEAT):
    put(music, hat(), t0, 0.11, pan=0.25)
for t0 in beat_range(G0 + BEAT / 4, SUMT, BEAT / 2):
    put(music, hat(), t0, 0.04, pan=-0.3)
for t0 in beat_range(SUMT + BEAT / 2, ENDT - 1, BEAT):
    put(music, hat(open_=True), t0, 0.08)
# snare roll build into the end card
roll = list(beat_range(ENDT - 1, ENDT - 0.5, BEAT / 4)) + list(beat_range(ENDT - 0.5, ENDT, BEAT / 8))
for k, t0 in enumerate(roll):
    put(music, clap(), t0, 0.06 + 0.22 * k / len(roll), send=0.2)
# end groove (soft) + fade
_len = FADE0 - (ENDT + 1)
for t0 in beat_range(ENDT + BEAT * 2, FADE0, BEAT):
    put(music, kick(), t0, 0.28 * (1 - (t0 - ENDT - 1) / _len))
for t0 in beat_range(ENDT + BEAT * 2.5, FADE0, BEAT):
    put(music, hat(), t0, 0.08 * (1 - (t0 - ENDT - 1) / _len), pan=0.25)

# ------------------------------------------------------------------ SFX
def whoosh(dur=0.45, f0=500, f1=3500, g=1.0):
    n = int(dur * SR)
    t = tt(n)
    x = sweep_bp(rng.standard_normal(n), f0, f1, q=1.6, steps=24)
    e = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 2
    return x * e * g


def sfx_for(c):
    k, v = c['type'], c.get('v', 1)
    t0 = c['t']
    if k == 'lighton':
        n = int(0.5 * SR); t = tt(n)
        x = np.sin(2 * np.pi * 70 * t) * np.exp(-t / 0.12) + lp(rng.standard_normal(n), 900) * np.exp(-t / 0.03) * 0.5
        put(sfx, x, t0, 0.45 * v, send=0.4)
    elif k == 'notif':
        for i, m in enumerate([88, 95]):
            put(sfx, bell(mtof(m), 0.9, 0.22), t0 + i * 0.11, 0.16 * v, pan=0.1, send=0.4)
    elif k == 'open':
        put(sfx, whoosh(0.45, 300, 2400), t0, 0.28 * v, send=0.2)
    elif k == 'kb':
        put(sfx, whoosh(0.28, 1800, 600), t0, 0.16 * v)
    elif k == 'scroll':
        put(sfx, whoosh(0.5, 900, 300), t0, 0.14 * v)
    elif k == 'toast':
        put(sfx, bell(mtof(91), 0.6, 0.15), t0, 0.12 * v, send=0.4)
        put(sfx, bell(mtof(96), 0.6, 0.15), t0 + 0.08, 0.10 * v, send=0.4)
    elif k == 'rise':
        put(sfx, whoosh(0.9, 200, 2200), t0, 0.35 * v, send=0.3)
    elif k == 'whoosh':
        put(sfx, whoosh(0.42, 2600, 500), t0 - 0.12, 0.30 * v, pan=0.2, send=0.25)
    elif k == 'swoosh':
        put(sfx, whoosh(0.7, 400, 5000), t0, 0.4 * v, pan=-0.2, send=0.2)
    elif k == 'key':
        n = int(0.03 * SR); t = tt(n)
        x = hp(rng.standard_normal(n), 2500) * np.exp(-t / 0.004) + 0.3 * np.sin(2 * np.pi * 3200 * t) * np.exp(-t / 0.006)
        put(sfx, x, t0, 0.10 * v, pan=rng.uniform(-0.3, 0.3))
    elif k == 'tap':
        n = int(0.06 * SR); t = tt(n)
        x = np.sin(2 * np.pi * 1700 * t) * np.exp(-t / 0.01) + hp(rng.standard_normal(n), 3000) * np.exp(-t / 0.003) * 0.6
        put(sfx, x, t0, 0.32 * v, send=0.15)
    elif k == 'success':
        for i, m in enumerate([84, 88, 91, 96]):
            put(sfx, bell(mtof(m), 1.2, 0.35), t0 + i * 0.07, 0.11 * v, pan=(i - 1.5) * 0.25, send=0.5)
    elif k == 'check':
        n = int(0.09 * SR); t = tt(n)
        f = 600 + 900 * (t / t[-1])
        x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.03)
        put(sfx, x, t0, 0.22 * v)
        put(sfx, bell(mtof(91), 0.6, 0.18), t0 + 0.03, 0.12 * v, send=0.4)
    elif k == 'pop':
        n = int(0.08 * SR); t = tt(n)
        f = 280 + 700 * np.minimum(1, t / 0.04)
        x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.025)
        put(sfx, x, t0, 0.22 * v, pan=rng.uniform(-0.4, 0.4), send=0.2)
    elif k == 'paper':
        n = int(0.22 * SR); t = tt(n)
        crack = (rng.random(n) < 0.02).astype(float)
        crack = np.convolve(crack, np.ones(80) / 80, 'same')
        x = bp(rng.standard_normal(n), 1800, 7000) * (0.25 + 4 * crack) * np.sin(np.pi * t / t[-1])
        put(sfx, x, t0, 0.20 * v, pan=rng.uniform(-0.5, 0.5))
    elif k == 'scratch':
        for i in range(2):
            n = int(0.16 * SR); t = tt(n)
            am = 0.6 + 0.4 * np.sin(2 * np.pi * 38 * t)
            x = bp(rng.standard_normal(n), 1500, 5000) * am * np.sin(np.pi * t / t[-1])
            put(sfx, x, t0 + i * 0.12, 0.18 * v)
    elif k == 'drop':
        n = int(0.14 * SR); t = tt(n)
        f = 380 + 900 * np.exp(-t / 0.025)
        x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.05)
        put(sfx, x, t0, 0.25 * v, send=0.35)
    elif k == 'blip':
        idx = sum(1 for c2 in cues if c2['type'] == 'blip' and c2['t'] < t0)
        m = [84, 86, 88, 91, 93][idx % 5]
        put(sfx, bell(mtof(m), 0.4, 0.09), t0, 0.12 * v, pan=(idx - 2) * 0.2, send=0.35)
    elif k == 'sparkle':
        for i in range(10):
            put(sfx, bell(rng.uniform(2500, 5200), 0.5, 0.07), t0 + i * 0.045 + rng.uniform(0, 0.02), 0.05, pan=rng.uniform(-0.8, 0.8), send=0.6)
    elif k == 'riser':
        dur = 1.0; n = int(dur * SR); t = tt(n)
        x = sweep_bp(rng.standard_normal(n), 300, 7000, q=1.4, steps=40) * (t / dur) ** 2
        tone = np.sin(2 * np.pi * np.cumsum(220 * 2 ** (2 * t / dur)) / SR) * (t / dur) ** 3 * 0.15
        put(sfx, x + tone, t0, 0.45 * v, send=0.3)
    elif k == 'impact':
        n = int(2.5 * SR); t = tt(n)
        boom = np.sin(2 * np.pi * np.cumsum(38 + 70 * np.exp(-t / 0.06)) / SR) * np.exp(-t / 0.7)
        crash = lp(hp(rng.standard_normal(n), 2500), 9000) * np.exp(-t / 0.9) * 0.35
        put(sfx, boom, t0, 0.55 * v)
        put(sfx, crash, t0, 0.35 * v, send=0.5)


for c in cues:
    sfx_for(c)

# ------------------------------------------------------------------ reverb + master
ir_n = int(1.6 * SR)
irt = tt(ir_n)
ir = rng.standard_normal((ir_n, 2)) * np.exp(-irt / 0.45)[:, None]
ir = lp(ir, 5000)
ir /= np.sqrt((ir ** 2).sum(0))
wet = np.stack([signal.fftconvolve(verb_send[:, i], ir[:, i])[:N] for i in range(2)], 1)

mix = music * 0.9 + sfx * 1.0 + wet * 0.35
mix = hp(mix, 28)
# fade in/out
fi = int(0.05 * SR)
mix[:fi] *= np.linspace(0, 1, fi)[:, None]
fo0, fo1 = int(FADE0 * SR), int(DUR * SR)
mix[fo0:fo1] *= np.linspace(1, 0, fo1 - fo0)[:, None] ** 1.5
mix[fo1:] = 0
# normalise (RMS target) + soft limit
rms = np.sqrt(np.mean(mix[: int((DUR - 2.5) * SR)] ** 2))
mix *= 0.16 / max(rms, 1e-9)
mix = np.tanh(mix * 1.1) / np.tanh(1.1)
mix *= 0.89 / max(1e-9, np.abs(mix).max())
wavfile.write(OUT, SR, (mix[: int(DUR * SR)] * 32767).astype(np.int16))
print('wrote', OUT, f'{DUR}s')
