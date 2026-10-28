/* ==========================================================================
   Punchline audio (host screens only): generated music + sound effects.
   Web Audio API, no files, no dependencies. Global: window.PunchlineAudio

   PunchlineAudio.start("lobby")          from a user gesture (unlocks audio, shows the controls)
   PunchlineAudio.setPhase(name, [secs])  lobby | countdown | answering | reveal | scores | null
                                          (countdown: optional seconds until the question shows)
   PunchlineAudio.setUrgent(true)         last seconds of the answering phase
   PunchlineAudio.sfx(name, [n])          tick | urgentTick | go | pop | ding (n = votes) | fanfare | join

   Custom tracks: audio files in public/music/<phase>/ replace the generated
   music of that phase (listed by GET /api/music, see public/music/README.md).
   Settings (volume, mute, effects) are kept in localStorage for every page.
   ========================================================================== */
(function () {
	"use strict";

	var STORE_KEY = "punchline.audio";
	var LOOKAHEAD = 0.3; // seconds of music scheduled ahead
	var TICK_MS = 80; // scheduler period
	var TRACK_XFADE = 3; // seconds of crossfade between two custom tracks
	var AC = window.AudioContext || window.webkitAudioContext;

	var settings = loadSettings();
	var ctx = null;
	var bus = null; // master graph
	var noiseBuffer = null;
	var phase = null; // requested phase
	var phaseOpts = null;
	var current = null; // music player of the current phase
	var fading = []; // players fading out
	var customTracks = null; // { phase: [url] } from /api/music
	var wanted = false; // this page asked for sound
	var gestureUnlocks = false;
	var ui = null;

	/* ---------- Settings (shared by every page) ---------- */

	function loadSettings() {
		var s = { volume: 0.6, muted: false, sfx: true };
		try {
			var saved = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
			if (typeof saved.volume === "number" && saved.volume >= 0 && saved.volume <= 1) s.volume = saved.volume;
			if (typeof saved.muted === "boolean") s.muted = saved.muted;
			if (typeof saved.sfx === "boolean") s.sfx = saved.sfx;
		} catch (e) {}
		return s;
	}

	function saveSettings() {
		try {
			localStorage.setItem(STORE_KEY, JSON.stringify(settings));
		} catch (e) {}
	}

	/* ---------- Audio graph ---------- */

	function isRunning() {
		return !!ctx && ctx.state === "running";
	}

	function ensureContext() {
		if (ctx || !AC) return ctx;
		try {
			ctx = new AC({ latencyHint: "playback" });
		} catch (e) {
			try {
				ctx = new AC();
			} catch (e2) {
				AC = null;
				return null;
			}
		}

		// master: music + effects -> soft tone -> glue compressor -> limiter -> speakers
		var master = gain(settings.muted ? 0 : 1);
		var music = gain(musicLevel());
		var sfx = gain(sfxLevel());
		var tone = ctx.createBiquadFilter();
		tone.type = "lowpass";
		tone.frequency.value = 13000;
		tone.Q.value = 0.5;
		var glue = compressor(-20, 12, 2.5, 0.015, 0.25);
		var limiter = compressor(-3, 0, 20, 0.002, 0.1);
		var out = gain(0.9);

		// shared reverb (generated impulse), fed by the music and the effects
		var reverb = ctx.createConvolver();
		reverb.buffer = impulse(2.2);
		var musicVerb = gain(musicLevel());
		var sfxVerb = gain(sfxLevel());
		var verbOut = gain(0.32);

		music.connect(master);
		sfx.connect(master);
		musicVerb.connect(reverb);
		sfxVerb.connect(reverb);
		reverb.connect(verbOut);
		verbOut.connect(master);
		master.connect(tone);
		tone.connect(glue);
		glue.connect(limiter);
		limiter.connect(out);
		out.connect(ctx.destination);

		bus = { master: master, music: music, sfx: sfx, musicVerb: musicVerb, sfxVerb: sfxVerb, out: out };

		noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
		var data = noiseBuffer.getChannelData(0);
		for (var i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

		ctx.addEventListener("statechange", onStateChange);
		if (settings.muted && ctx.state === "running") ctx.suspend().catch(function () {});
		setInterval(scheduler, TICK_MS);
		loadCustomTracks();
		return ctx;
	}

	function musicLevel() {
		return settings.volume * settings.volume * 0.85;
	}

	function sfxLevel() {
		return settings.sfx ? 0.75 : 0;
	}

	function applySettings() {
		if (!bus) return;
		var t = ctx.currentTime;
		bus.master.gain.setTargetAtTime(settings.muted ? 0 : 1, t, 0.04);
		bus.music.gain.setTargetAtTime(musicLevel(), t, 0.05);
		bus.musicVerb.gain.setTargetAtTime(musicLevel(), t, 0.05);
		bus.sfx.gain.setTargetAtTime(sfxLevel(), t, 0.03);
		bus.sfxVerb.gain.setTargetAtTime(sfxLevel(), t, 0.03);
	}

	function gain(value) {
		var g = ctx.createGain();
		g.gain.value = value;
		return g;
	}

	function compressor(threshold, knee, ratio, attack, release) {
		var c = ctx.createDynamicsCompressor();
		c.threshold.value = threshold;
		c.knee.value = knee;
		c.ratio.value = ratio;
		c.attack.value = attack;
		c.release.value = release;
		return c;
	}

	function filter(type, frequency, q) {
		var f = ctx.createBiquadFilter();
		f.type = type;
		f.frequency.value = frequency;
		if (q !== undefined) f.Q.value = q;
		return f;
	}

	function impulse(seconds) {
		var rate = ctx.sampleRate;
		var length = Math.floor(rate * seconds);
		var buffer = ctx.createBuffer(2, length, rate);
		for (var c = 0; c < 2; c++) {
			var d = buffer.getChannelData(c);
			var smooth = 0;
			for (var i = 0; i < length; i++) {
				// low-passed noise with an exponential tail: a soft room
				smooth = smooth * 0.6 + (Math.random() * 2 - 1) * 0.4;
				d[i] = smooth * Math.pow(1 - i / length, 3.2) * (i < rate * 0.01 ? i / (rate * 0.01) : 1);
			}
		}
		return buffer;
	}

	function mtof(m) {
		return 440 * Math.pow(2, (m - 69) / 12);
	}

	function osc(type, frequency, t) {
		var o = ctx.createOscillator();
		o.type = type;
		o.frequency.setValueAtTime(frequency, t);
		return o;
	}

	function noise(t, duration, loop) {
		var s = ctx.createBufferSource();
		s.buffer = noiseBuffer;
		if (loop) {
			s.loop = true;
			s.start(t, Math.random());
			s.stop(t + duration);
		} else {
			s.start(t, Math.random() * 1.5, duration);
		}
		return s;
	}

	// disconnect every node of a voice once its source has stopped (no memory growth)
	function cleanup(source, nodes) {
		source.onended = function () {
			for (var i = 0; i < nodes.length; i++) {
				try {
					nodes[i].disconnect();
				} catch (e) {}
			}
		};
	}

	// click-free percussive envelope
	function perc(g, t, peak, attack, decay) {
		g.gain.setValueAtTime(0.0001, t);
		g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
		g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
	}

	// attack / decay to sustain / release, all smooth
	function adsr(g, t, peak, attack, decay, sustain, duration, release) {
		g.gain.setValueAtTime(0, t);
		g.gain.linearRampToValueAtTime(peak, t + attack);
		g.gain.setTargetAtTime(peak * sustain, t + attack, decay);
		g.gain.setTargetAtTime(0, t + Math.max(duration, attack), release / 4);
	}

	function rampTo(param, value, t, duration) {
		if (param.cancelAndHoldAtTime) {
			param.cancelAndHoldAtTime(t);
		} else {
			param.cancelScheduledValues(t);
			param.setValueAtTime(param.value, t);
		}
		param.linearRampToValueAtTime(value, t + duration);
	}

	/* ---------- Instruments (each returns after scheduling one short voice) ---------- */

	function kick(dest, t, v) {
		var o = osc("sine", 150, t);
		var g = gain(0);
		o.frequency.exponentialRampToValueAtTime(46, t + 0.11);
		perc(g, t, 0.95 * v, 0.004, 0.36);
		o.connect(g).connect(dest);
		o.start(t);
		o.stop(t + 0.42);
		cleanup(o, [o, g]);
	}

	function snare(dest, t, v) {
		var n = noise(t, 0.22);
		var f = filter("bandpass", 1900, 0.7);
		var g = gain(0);
		perc(g, t, 0.42 * v, 0.002, 0.17);
		n.connect(f).connect(g).connect(dest);
		var o = osc("triangle", 200, t);
		var og = gain(0);
		o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
		perc(og, t, 0.3 * v, 0.002, 0.09);
		o.connect(og).connect(dest);
		o.start(t);
		o.stop(t + 0.12);
		cleanup(n, [n, f, g]);
		cleanup(o, [o, og]);
	}

	function rim(dest, t, v) {
		var o = osc("triangle", 1650, t);
		var g = gain(0);
		perc(g, t, 0.22 * v, 0.001, 0.045);
		o.connect(g).connect(dest);
		o.start(t);
		o.stop(t + 0.06);
		cleanup(o, [o, g]);
		var n = noise(t, 0.04);
		var f = filter("highpass", 2500);
		var ng = gain(0);
		perc(ng, t, 0.18 * v, 0.001, 0.03);
		n.connect(f).connect(ng).connect(dest);
		cleanup(n, [n, f, ng]);
	}

	function clap(dest, t, v) {
		var n = noise(t, 0.26);
		var f = filter("bandpass", 1350, 1.1);
		var g = gain(0);
		g.gain.setValueAtTime(0.0001, t);
		for (var i = 0; i < 3; i++) {
			var b = t + i * 0.011;
			g.gain.exponentialRampToValueAtTime(0.5 * v, b + 0.002);
			g.gain.exponentialRampToValueAtTime(0.08 * v, b + 0.01);
		}
		g.gain.exponentialRampToValueAtTime(0.42 * v, t + 0.036);
		g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
		n.connect(f).connect(g).connect(dest);
		cleanup(n, [n, f, g]);
	}

	function hat(dest, t, v, open) {
		var decay = open ? 0.24 : 0.04;
		var n = noise(t, decay + 0.02);
		var f = filter("highpass", 7200);
		var g = gain(0);
		perc(g, t, 0.2 * v, 0.002, decay);
		n.connect(f).connect(g).connect(dest);
		cleanup(n, [n, f, g]);
	}

	function shaker(dest, t, v) {
		var n = noise(t, 0.1);
		var f = filter("bandpass", 5800, 1);
		var g = gain(0);
		perc(g, t, 0.13 * v, 0.014, 0.065);
		n.connect(f).connect(g).connect(dest);
		cleanup(n, [n, f, g]);
	}

	function cymbal(dest, t, v) {
		var n = noise(t, 1.6);
		var f = filter("highpass", 6000);
		var g = gain(0);
		perc(g, t, 0.16 * v, 0.004, 1.5);
		n.connect(f).connect(g).connect(dest);
		cleanup(n, [n, f, g]);
	}

	function bass(dest, t, m, duration, v) {
		var fr = mtof(m);
		var o1 = osc("triangle", fr, t);
		var o2 = osc("sine", fr, t);
		var lp = filter("lowpass", 1400, 1);
		var g = gain(0);
		lp.frequency.setValueAtTime(1500, t);
		lp.frequency.setTargetAtTime(520, t, 0.07);
		adsr(g, t, 0.4 * v, 0.008, 0.12, 0.65, duration, 0.08);
		o1.connect(lp);
		o2.connect(lp);
		lp.connect(g).connect(dest);
		var end = t + duration + 0.12;
		o1.start(t);
		o2.start(t);
		o1.stop(end);
		o2.stop(end);
		cleanup(o2, [o1, o2, lp, g]);
	}

	// FM electric piano: bright tine on the attack, mellow body after
	function keys(dest, t, notes, duration, v, brightness) {
		var b = brightness || 1;
		var level = (0.13 * v) / Math.sqrt(notes.length / 3);
		notes.forEach(function (m) {
			var fr = mtof(m);
			var car = osc("sine", fr, t);
			var mod = osc("sine", fr, t);
			var idx = gain(0);
			var g = gain(0);
			car.detune.value = Math.random() * 8 - 4;
			idx.gain.setValueAtTime(fr * 1.6 * b, t);
			idx.gain.setTargetAtTime(fr * 0.18, t, 0.12);
			adsr(g, t, level, 0.006, 0.45, 0.45, duration, 0.2);
			mod.connect(idx).connect(car.frequency);
			car.connect(g).connect(dest);
			var end = t + duration + 0.3;
			car.start(t);
			mod.start(t);
			car.stop(end);
			mod.stop(end);
			cleanup(car, [car, mod, idx, g]);
		});
	}

	function pad(dest, t, notes, duration, v) {
		var level = (0.07 * v) / Math.sqrt(notes.length / 3);
		notes.forEach(function (m) {
			var fr = mtof(m);
			var o1 = osc("sawtooth", fr, t);
			var o2 = osc("sawtooth", fr, t);
			var g = gain(0);
			o1.detune.value = -9;
			o2.detune.value = 9;
			adsr(g, t, level, Math.min(0.4, duration / 3), 1, 0.85, duration, 0.6);
			o1.connect(g);
			o2.connect(g);
			g.connect(dest);
			var end = t + duration + 0.7;
			o1.start(t);
			o2.start(t);
			o1.stop(end);
			o2.stop(end);
			cleanup(o2, [o1, o2, g]);
		});
	}

	// short brassy stab (scores, fanfare)
	function brass(dest, t, notes, duration, v) {
		var level = (0.09 * v) / Math.sqrt(notes.length / 3);
		notes.forEach(function (m) {
			var fr = mtof(m);
			var o1 = osc("sawtooth", fr, t);
			var o2 = osc("sawtooth", fr * 1.004, t);
			var lp = filter("lowpass", 500, 2);
			var g = gain(0);
			lp.frequency.setValueAtTime(500, t);
			lp.frequency.linearRampToValueAtTime(2800, t + 0.04);
			lp.frequency.setTargetAtTime(1100, t + 0.04, 0.12);
			adsr(g, t, level, 0.02, 0.15, 0.7, duration, 0.12);
			o1.connect(lp);
			o2.connect(lp);
			lp.connect(g).connect(dest);
			var end = t + duration + 0.2;
			o1.start(t);
			o2.start(t);
			o1.stop(end);
			o2.stop(end);
			cleanup(o2, [o1, o2, lp, g]);
		});
	}

	function pluck(dest, t, m, duration, v) {
		var fr = mtof(m);
		var o1 = osc("triangle", fr, t);
		var o2 = osc("sine", fr * 2, t);
		var g = gain(0);
		var g2 = gain(0.25);
		perc(g, t, 0.2 * v, 0.004, duration);
		o1.connect(g);
		o2.connect(g2).connect(g);
		g.connect(dest);
		o1.start(t);
		o2.start(t);
		o1.stop(t + duration + 0.05);
		o2.stop(t + duration + 0.05);
		cleanup(o1, [o1, o2, g, g2]);
	}

	function bell(dest, t, m, v, duration) {
		var d = duration || 1.1;
		var fr = mtof(m);
		var car = osc("sine", fr, t);
		var mod = osc("sine", fr * 3.5, t);
		var idx = gain(0);
		var g = gain(0);
		idx.gain.setValueAtTime(fr * 1.1, t);
		idx.gain.exponentialRampToValueAtTime(fr * 0.05, t + d * 0.6);
		perc(g, t, 0.16 * v, 0.003, d);
		mod.connect(idx).connect(car.frequency);
		car.connect(g).connect(dest);
		car.start(t);
		mod.start(t);
		car.stop(t + d + 0.05);
		mod.stop(t + d + 0.05);
		cleanup(car, [car, mod, idx, g]);
	}

	// rising filtered noise (tension)
	function riser(dest, t, duration, v) {
		var n = noise(t, duration + 0.2, true);
		var f = filter("bandpass", 400, 2.5);
		var g = gain(0);
		f.frequency.setValueAtTime(350, t);
		f.frequency.exponentialRampToValueAtTime(6000, t + duration);
		g.gain.setValueAtTime(0, t);
		g.gain.linearRampToValueAtTime(0.1 * v, t + duration);
		g.gain.linearRampToValueAtTime(0, t + duration + 0.15);
		n.connect(f).connect(g).connect(dest);
		cleanup(n, [n, f, g]);
	}

	function pick(list) {
		return list[Math.floor(Math.random() * list.length)];
	}

	/* ---------- Songs: one 4-bar loop per phase (16 steps per bar) ---------- */

	var SONGS = {
		// F major, lazy swung lo-fi groove: Fmaj9 | Dm9 | Gm9 | C13
		lobby: {
			bpm: 88,
			swing: 0.16,
			cutoff: 1700,
			lfo: 650,
			chords: [[57, 60, 64, 67], [53, 57, 60, 64], [58, 62, 65, 69], [58, 62, 64, 69]],
			roots: [41, 38, 43, 48],
			step: function (p, bar, s, t, sd) {
				var c = this.chords[bar];
				var r = this.roots[bar];
				var next = this.roots[(bar + 1) % 4];
				if (s === 0) kick(p.out, t, 0.85);
				if (s === 7) kick(p.out, t, 0.45);
				if (s === 10) kick(p.out, t, 0.7);
				if (s === 4 || s === 12) snare(p.out, t, 0.42);
				if (s % 2 === 0) hat(p.out, t, s % 4 === 0 ? 0.5 : 0.3);
				else if (Math.random() < 0.25) hat(p.out, t, 0.14);
				if (bar === 3 && s === 14) hat(p.out, t, 0.32, true);
				if (s === 0) bass(p.out, t, r, sd * 5, 0.9);
				if (s === 7) bass(p.out, t, r + 12, sd * 1.4, 0.5);
				if (s === 10) bass(p.out, t, r + 7, sd * 3, 0.7);
				if (s === 14) bass(p.out, t, next + 2, sd * 1.4, 0.5);
				if (s === 0) keys(p.filter, t, c, sd * 6, 0.85);
				if (s === 11) keys(p.filter, t, c, sd * 4, 0.45);
				if (s === 0) pad(p.filter, t, c, sd * 15, 0.35);
				if ((s === 2 || s === 6 || s === 9 || s === 13) && Math.random() < 0.2) {
					bell(p.send, t, pick(c) + 12, 0.45);
				}
			},
		},

		// A minor, pulsing build that opens up until the question shows: Am | F | Dm | E
		countdown: {
			bpm: 120,
			swing: 0,
			cutoff: 380,
			lfo: 0,
			chords: [[57, 60, 64, 71], [57, 60, 65, 69], [57, 62, 65, 69], [56, 59, 64, 68]],
			roots: [45, 41, 38, 40],
			start: function (p, t) {
				var d = p.duration();
				p.filter.frequency.setValueAtTime(380, t);
				p.filter.frequency.exponentialRampToValueAtTime(4200, t + d);
				riser(p.send, t, d, 1);
			},
			step: function (p, bar, s, t, sd) {
				var c = this.chords[bar];
				var r = this.roots[bar];
				var d = p.duration();
				var el = t - p.t0;
				var k = Math.min(1, el / d);
				if (s % 2 === 0) bass(p.out, t, r + (s % 4 === 2 ? 12 : 0), sd * 1.5, 0.55 + 0.35 * k);
				if (s % 4 === 0 && k > 0.15) kick(p.out, t, 0.5 + 0.4 * k);
				if (s % 2 === 0 || k > 0.45) hat(p.out, t, (s % 2 === 0 ? 0.2 : 0.12) + 0.25 * k);
				if (k >= 1 && (s === 4 || s === 12)) clap(p.out, t, 0.6);
				// snare roll in the last quarter, getting denser and louder
				if (k > 0.75 && k < 1 && s % (k > 0.9 ? 1 : 2) === 0) snare(p.out, t, 0.2 + 0.5 * (k - 0.75) * 4);
				if (s === 0) pad(p.filter, t, c, sd * 16, 0.8);
				if (s === 0 || s === 8) keys(p.filter, t, c, sd * 3, 0.35 + 0.4 * k, 1.3);
			},
		},

		// D major, light and focused, "thinking" arpeggio: Gmaj9 | F#m7 | Em9 | A13
		answering: {
			bpm: 98,
			swing: 0.1,
			cutoff: 1500,
			lfo: 450,
			chords: [[59, 62, 66, 69], [57, 61, 64, 66], [55, 59, 62, 66], [55, 59, 61, 66]],
			roots: [43, 42, 40, 45],
			step: function (p, bar, s, t, sd) {
				var c = this.chords[bar];
				var r = this.roots[bar];
				var next = this.roots[(bar + 1) % 4];
				var u = p.urgent;
				if (s === 0) kick(p.out, t, 0.7);
				if (s === 10) kick(p.out, t, 0.45);
				if (u && (s === 4 || s === 12)) kick(p.out, t, 0.45);
				if (s === 8) rim(p.out, t, 0.6);
				if (u && s === 15) rim(p.out, t, 0.3);
				if (s % 2 === 0) hat(p.out, t, s % 4 === 0 ? 0.32 : 0.22);
				else if (u) hat(p.out, t, 0.18);
				else shaker(p.out, t, 0.35);
				if (u) {
					if (s % 2 === 0) bass(p.out, t, r + (s % 8 === 6 ? 12 : 0), sd * 1.4, 0.7);
				} else {
					if (s === 0) bass(p.out, t, r, sd * 7, 0.85);
					if (s === 8) bass(p.out, t, r + 7, sd * 4, 0.6);
					if (s === 14) bass(p.out, t, next + 2, sd * 1.4, 0.45);
				}
				var shape = [0, 1, 2, 3, 2, 1, 2, 3];
				if (u || s % 2 === 0) {
					var i = u ? s % 8 : (s / 2) % 8;
					pluck(p.send, t, c[shape[i]] + (u && s >= 8 ? 12 : 0) + 12, 0.28, u ? 0.32 : 0.42);
				}
				if (s === 0) pad(p.filter, t, c, sd * 15, 0.4);
			},
		},

		// Bb major, bouncy funk with octave bass and clav stabs: Bbmaj9 | Gm9 | Cm9 | F13
		reveal: {
			bpm: 112,
			swing: 0.12,
			cutoff: 2600,
			lfo: 900,
			chords: [[62, 65, 69, 72], [58, 62, 65, 69], [58, 62, 63, 67], [57, 62, 63, 67]],
			roots: [46, 43, 48, 41],
			bassLine: { 0: 0, 3: 12, 6: 0, 7: 12, 8: 0, 10: 7, 11: 12, 14: 7 },
			step: function (p, bar, s, t, sd) {
				var c = this.chords[bar];
				var r = this.roots[bar];
				if (s === 0) kick(p.out, t, 0.9);
				if (s === 6) kick(p.out, t, 0.55);
				if (s === 8) kick(p.out, t, 0.75);
				if (s === 11) kick(p.out, t, 0.5);
				if (s === 4 || s === 12) clap(p.out, t, 0.75);
				if (s === 14) hat(p.out, t, 0.3, true);
				else hat(p.out, t, s % 2 === 0 ? 0.32 : 0.15);
				if (s in this.bassLine) bass(p.out, t, r + this.bassLine[s], sd * (s === 0 ? 2.5 : 1.3), 0.8);
				if (s === 2 || s === 7 || s === 10 || s === 13) keys(p.filter, t, c, sd * 0.9, 0.6, 2.6);
				if (bar % 2 === 1 && (s === 0 || s === 2 || s === 4 || s === 7)) {
					pluck(p.send, t, c[[0, 1, 2, 3][[0, 2, 4, 7].indexOf(s)]] + 12, 0.22, 0.5);
				}
			},
		},

		// C major, four on the floor, brass stabs and a hook: Fmaj9 | G6 | Em7 | Am9
		scores: {
			bpm: 118,
			swing: 0,
			cutoff: 3200,
			lfo: 800,
			chords: [[57, 60, 64, 67], [59, 62, 64, 67], [55, 59, 62, 64], [55, 60, 64, 71]],
			roots: [41, 43, 40, 45],
			melody: [
				{ 0: 81, 2: 79, 4: 76, 6: 72, 10: 76, 12: 79 },
				{ 0: 79, 2: 81, 4: 83, 8: 86, 12: 83 },
				{ 0: 79, 3: 76, 6: 71, 8: 74, 10: 76, 12: 79 },
				{ 0: 76, 2: 79, 4: 81, 7: 84, 10: 83, 12: 81 },
			],
			step: function (p, bar, s, t, sd) {
				var c = this.chords[bar];
				var r = this.roots[bar];
				if (s % 4 === 0) kick(p.out, t, 0.85);
				if (s === 4 || s === 12) clap(p.out, t, 0.7);
				if (s % 4 === 2) hat(p.out, t, 0.28, true);
				else hat(p.out, t, 0.14);
				if (bar === 0 && s === 0) cymbal(p.out, t, 0.8);
				if (s % 2 === 0) bass(p.out, t, r + (s % 4 === 2 ? 12 : 0), sd * 1.5, 0.75);
				if (s === 0) brass(p.send, t, c, sd * 3, 0.55);
				if (s === 6 || s === 10) brass(p.send, t, c, sd * 1.6, 0.4);
				if (s === 0) pad(p.filter, t, c, sd * 15, 0.3);
				var m = this.melody[bar][s];
				if (m) {
					pluck(p.send, t, m, 0.35, 0.55);
					bell(p.send, t, m, 0.25, 0.6);
				}
			},
		},
	};

	/* ---------- Players: generated music ---------- */

	function SynthPlayer(name, song, opts) {
		this.name = name;
		this.song = song;
		this.opts = opts;
		this.urgent = false;
		this.out = gain(0); // dry (drums, bass)
		this.fx = gain(0); // reverb send
		this.send = gain(1); // dry + reverb (keys, leads)
		this.filter = filter("lowpass", song.cutoff, 0.8); // keys and pads
		this.send.connect(this.out);
		this.send.connect(this.fx);
		this.filter.connect(this.send);
		this.out.connect(bus.music);
		this.fx.connect(bus.musicVerb);
		if (song.lfo) {
			this.lfo = osc("sine", 0.06, ctx.currentTime);
			this.lfoDepth = gain(song.lfo);
			this.lfo.connect(this.lfoDepth).connect(this.filter.frequency);
		}
		this.stepIndex = 0;
		this.bar = 0;
	}

	SynthPlayer.prototype.duration = function () {
		return typeof this.opts === "number" && this.opts > 0.5 ? this.opts : 5;
	};

	SynthPlayer.prototype.start = function (t, fade) {
		this.t0 = t;
		this.nextTime = t;
		this.out.gain.setValueAtTime(0, t);
		this.out.gain.linearRampToValueAtTime(1, t + fade);
		this.fx.gain.setValueAtTime(0, t);
		this.fx.gain.linearRampToValueAtTime(1, t + fade);
		if (this.lfo) this.lfo.start(t);
		if (this.song.start) this.song.start(this, t);
	};

	SynthPlayer.prototype.schedule = function (until) {
		var now = ctx.currentTime;
		var sd = 60 / this.song.bpm / 4;
		// after a stall (e.g. a frozen tab), skip ahead instead of firing a burst of notes
		if (this.nextTime < now - 0.1) this.nextTime = now + 0.03;
		while (this.nextTime < until) {
			if (this.stopAt && this.nextTime >= this.stopAt) return;
			var t = this.nextTime + (this.stepIndex % 2 ? this.song.swing * sd : 0);
			try {
				this.song.step(this, this.bar, this.stepIndex, t, sd);
			} catch (e) {}
			this.nextTime += sd;
			this.stepIndex++;
			if (this.stepIndex === 16) {
				this.stepIndex = 0;
				this.bar = (this.bar + 1) % this.song.chords.length;
			}
		}
	};

	SynthPlayer.prototype.setUrgent = function (on) {
		if (this.urgent === on) return;
		this.urgent = on;
		rampTo(this.filter.frequency, this.song.cutoff * (on ? 1.8 : 1), ctx.currentTime, 1);
	};

	SynthPlayer.prototype.stop = function (t, fade) {
		this.stopAt = t + fade;
		this.endAt = this.stopAt + 1.5; // let the last notes and the reverb ring
		rampTo(this.out.gain, 0, t, fade);
		rampTo(this.fx.gain, 0, t, fade);
	};

	SynthPlayer.prototype.pause = function () {};
	SynthPlayer.prototype.resume = function () {};

	SynthPlayer.prototype.dispose = function () {
		try {
			if (this.lfo) this.lfo.stop();
		} catch (e) {}
		[this.lfo, this.lfoDepth, this.filter, this.send, this.out, this.fx].forEach(function (n) {
			try {
				if (n) n.disconnect();
			} catch (e) {}
		});
	};

	/* ---------- Players: custom tracks (shuffled looping playlist, crossfaded) ---------- */

	function shuffle(list) {
		var a = list.slice();
		for (var i = a.length - 1; i > 0; i--) {
			var j = Math.floor(Math.random() * (i + 1));
			var tmp = a[i];
			a[i] = a[j];
			a[j] = tmp;
		}
		return a;
	}

	function TrackPlayer(name, urls) {
		this.name = name;
		this.urls = urls;
		this.queue = [];
		this.decks = [];
		this.errors = 0;
		this.out = gain(0);
		this.out.connect(bus.music);
	}

	TrackPlayer.prototype.start = function (t, fade) {
		this.out.gain.setValueAtTime(0, t);
		this.out.gain.linearRampToValueAtTime(1, t + fade);
		this.next(0);
	};

	TrackPlayer.prototype.next = function (fadeIn) {
		if (this.stopped) return;
		if (this.queue.length === 0) this.queue = shuffle(this.urls);
		var self = this;
		var el = new Audio();
		el.preload = "auto";
		el.loop = this.urls.length === 1;
		el.src = this.queue.shift();
		var deck = { el: el, source: ctx.createMediaElementSource(el), gain: gain(fadeIn ? 0 : 1) };
		deck.source.connect(deck.gain).connect(this.out);
		if (fadeIn) deck.gain.gain.linearRampToValueAtTime(1, ctx.currentTime + fadeIn);
		var advance = function () {
			if (deck.done) return;
			deck.done = true;
			self.next(TRACK_XFADE);
			rampTo(deck.gain.gain, 0, ctx.currentTime, TRACK_XFADE);
			setTimeout(function () {
				self.drop(deck);
			}, TRACK_XFADE * 1000 + 500);
		};
		el.addEventListener("timeupdate", function () {
			if (!el.loop && el.duration > TRACK_XFADE * 2 && el.duration - el.currentTime < TRACK_XFADE) advance();
		});
		el.addEventListener("ended", advance);
		el.addEventListener("error", function () {
			deck.done = true;
			self.drop(deck);
			self.errors++;
			if (self.errors >= self.urls.length) {
				// no playable file: fall back to the generated music of this phase
				if (customTracks) customTracks[self.name] = [];
				if (current === self) switchPhase(1);
			} else {
				self.next(0);
			}
		});
		el.addEventListener("playing", function () {
			self.errors = 0;
		});
		this.decks.push(deck);
		if (isRunning()) el.play().catch(function () {});
	};

	TrackPlayer.prototype.drop = function (deck) {
		var i = this.decks.indexOf(deck);
		if (i >= 0) this.decks.splice(i, 1);
		try {
			deck.el.pause();
			deck.el.removeAttribute("src");
			deck.el.load();
			deck.source.disconnect();
			deck.gain.disconnect();
		} catch (e) {}
	};

	TrackPlayer.prototype.schedule = function () {};
	TrackPlayer.prototype.setUrgent = function () {};

	TrackPlayer.prototype.stop = function (t, fade) {
		this.stopped = true;
		this.endAt = t + fade + 0.2;
		rampTo(this.out.gain, 0, t, fade);
	};

	TrackPlayer.prototype.pause = function () {
		this.decks.forEach(function (d) {
			d.el.pause();
		});
	};

	TrackPlayer.prototype.resume = function () {
		this.decks.forEach(function (d) {
			if (!d.done) d.el.play().catch(function () {});
		});
	};

	TrackPlayer.prototype.dispose = function () {
		var self = this;
		this.decks.slice().forEach(function (d) {
			self.drop(d);
		});
		try {
			this.out.disconnect();
		} catch (e) {}
	};

	function loadCustomTracks() {
		if (!window.fetch) return;
		fetch("/api/music", { cache: "no-store" })
			.then(function (r) {
				return r.ok ? r.json() : {};
			})
			.then(function (data) {
				customTracks = {};
				Object.keys(SONGS).forEach(function (name) {
					customTracks[name] = Array.isArray(data[name]) ? data[name].filter(function (u) {
						return typeof u === "string" && u.indexOf("/music/" + name + "/") === 0;
					}) : [];
				});
				// a generated loop already plays for a phase that has custom tracks: swap
				if (current && current instanceof SynthPlayer && customTracks[current.name].length) switchPhase(1.5);
			})
			.catch(function () {});
	}

	/* ---------- Phases ---------- */

	function makePlayer(name, opts) {
		var tracks = customTracks && customTracks[name];
		if (tracks && tracks.length) return new TrackPlayer(name, tracks);
		return new SynthPlayer(name, SONGS[name], opts);
	}

	// crossfade from the current music to the requested phase
	function switchPhase(fade) {
		if (!isRunning()) return;
		var t = ctx.currentTime + 0.05;
		var from = current && current.name;
		if (current) {
			current.stop(t, from === "countdown" ? 0.35 : Math.min(fade, 1));
			fading.push(current);
			current = null;
		}
		if (phase && SONGS[phase]) {
			current = makePlayer(phase, phaseOpts);
			current.start(t + (from ? 0.1 : 0), from === "countdown" ? 0.4 : fade);
			if (phase === "answering" && phaseOpts === "urgent") current.setUrgent(true);
		}
		scheduler();
	}

	function scheduler() {
		if (!isRunning()) return;
		var now = ctx.currentTime;
		var until = now + LOOKAHEAD;
		if (current) current.schedule(until);
		fading = fading.filter(function (p) {
			p.schedule(until);
			if (now > p.endAt) {
				p.dispose();
				return false;
			}
			return true;
		});
	}

	function onStateChange() {
		if (isRunning() && pendingFanfare) {
			// the winner was announced before the first tap: celebrate now (if not too late)
			if (Date.now() - pendingFanfare < 60000) setTimeout(function () { playSfx("fanfare"); }, 300);
			pendingFanfare = 0;
		}
		if (isRunning()) {
			if (current && current.name === phase) {
				current.resume();
			} else {
				switchPhase(1.2);
			}
		} else if (current) {
			current.pause();
		}
		updateUI();
	}

	/* ---------- Unlock (autoplay policy), visibility, mute ---------- */

	function resume() {
		if (!ctx || settings.muted || document.hidden || ctx.state === "running") return;
		try {
			ctx.resume().catch(function () {});
			// iOS: playing a silent buffer inside the gesture unlocks the output
			var s = ctx.createBufferSource();
			s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
			s.connect(ctx.destination);
			s.start(0);
		} catch (e) {}
	}

	function onGesture(e) {
		var locked = wanted && ctx && !settings.muted && ctx.state !== "running";
		// remember if this gesture started while the sound was locked (its click must not mute)
		if (e.type !== "click") gestureUnlocks = !!locked;
		if (locked) resume();
	}

	["pointerdown", "touchend", "click", "keydown"].forEach(function (type) {
		document.addEventListener(type, onGesture, { capture: true, passive: true });
	});

	document.addEventListener("visibilitychange", function () {
		if (!ctx) return;
		if (document.hidden) {
			if (ctx.state === "running") ctx.suspend().catch(function () {});
		} else {
			resume();
		}
	});

	function setMuted(muted) {
		settings.muted = !!muted;
		saveSettings();
		applySettings();
		if (ctx) {
			if (settings.muted) {
				// fade out, then stop the clock (no CPU while muted)
				setTimeout(function () {
					if (settings.muted && ctx.state === "running") ctx.suspend().catch(function () {});
				}, 250);
			} else {
				resume();
			}
		}
		updateUI();
	}

	window.addEventListener("storage", function (e) {
		if (e.key !== STORE_KEY) return;
		var wasMuted = settings.muted;
		settings = loadSettings();
		if (wasMuted !== settings.muted) setMuted(settings.muted);
		else applySettings();
		updateUI();
	});

	/* ---------- Sound effects ---------- */

	var SFX = {
		// soft wooden tock for the countdown
		tick: function (d, t) {
			bell(d.dry, t, 84, 0.9, 0.08);
			var o = osc("sine", 1050, t);
			var g = gain(0);
			perc(g, t, 0.35, 0.002, 0.07);
			o.connect(g).connect(d.dry);
			o.start(t);
			o.stop(t + 0.1);
			cleanup(o, [o, g]);
		},
		// brighter double tick for the last seconds
		urgentTick: function (d, t) {
			[1568, 784].forEach(function (f, i) {
				var o = osc(i ? "triangle" : "sine", f, t);
				var g = gain(0);
				perc(g, t, i ? 0.2 : 0.38, 0.002, 0.09);
				o.connect(g).connect(d.dry);
				o.start(t);
				o.stop(t + 0.12);
				cleanup(o, [o, g]);
			});
			rim(d.dry, t + 0.12, 0.6);
		},
		// question on screen: quick D major sparkle with a whoosh
		go: function (d, t) {
			[62, 66, 69, 74].forEach(function (m, i) {
				pluck(d.wet, t + i * 0.045, m + 12, 0.4, 1.2);
			});
			bell(d.wet, t + 0.18, 86, 1, 1.2);
			var n = noise(t, 0.45);
			var f = filter("bandpass", 800, 1.5);
			var g = gain(0);
			f.frequency.setValueAtTime(600, t);
			f.frequency.exponentialRampToValueAtTime(5000, t + 0.35);
			g.gain.setValueAtTime(0, t);
			g.gain.linearRampToValueAtTime(0.12, t + 0.25);
			g.gain.linearRampToValueAtTime(0, t + 0.42);
			n.connect(f).connect(g).connect(d.dry);
			cleanup(n, [n, f, g]);
		},
		// an answer pops on screen
		pop: function (d, t) {
			var o = osc("sine", 380, t);
			var g = gain(0);
			o.frequency.exponentialRampToValueAtTime(1050, t + 0.06);
			perc(g, t, 0.55, 0.002, 0.13);
			o.connect(g).connect(d.wet);
			o.start(t);
			o.stop(t + 0.16);
			cleanup(o, [o, g]);
			var n = noise(t, 0.04);
			var f = filter("bandpass", 2200, 1);
			var ng = gain(0);
			perc(ng, t, 0.2, 0.001, 0.03);
			n.connect(f).connect(ng).connect(d.dry);
			cleanup(n, [n, f, ng]);
		},
		// one ding per vote (up to 6), climbing a Bb major arpeggio
		ding: function (d, t, count) {
			var n = Math.max(1, Math.min(6, Math.round(Number(count) || 1)));
			var notes = [82, 86, 89, 94, 98, 101];
			for (var i = 0; i < n; i++) {
				bell(d.wet, t + i * 0.13, notes[i], 1.15, 0.9);
				pluck(d.dry, t + i * 0.13, notes[i], 0.2, 0.7);
			}
		},
		// the winner: brass arpeggio into a big C major chord
		fanfare: function (d, t) {
			[67, 72, 76].forEach(function (m, i) {
				brass(d.wet, t + i * 0.11, [m, m - 12], 0.09, 1.6);
			});
			brass(d.wet, t + 0.33, [72, 76, 79, 84], 1.3, 1.8);
			brass(d.wet, t + 0.33, [48, 60], 1.3, 1.2);
			kick(d.dry, t + 0.33, 0.8);
			cymbal(d.dry, t + 0.33, 1.3);
			[84, 88, 91, 96].forEach(function (m, i) {
				bell(d.wet, t + 0.45 + i * 0.08, m, 0.7, 1.2);
			});
		},
		// a player joined the lobby
		join: function (d, t) {
			var pair = pick([[81, 88], [79, 86], [76, 84]]);
			pluck(d.wet, t, pair[0], 0.14, 1.1);
			pluck(d.wet, t + 0.07, pair[1], 0.22, 1.1);
		},
	};

	var sfxDest = null;

	var pendingFanfare = 0;

	function playSfx(name, arg) {
		if (name === "fanfare" && !isRunning() && wanted && !settings.muted) pendingFanfare = Date.now();
		if (!SFX[name] || !isRunning() || !settings.sfx || settings.muted) return;
		if (!sfxDest) {
			var wet = gain(1);
			wet.connect(bus.sfx);
			wet.connect(bus.sfxVerb);
			sfxDest = { dry: bus.sfx, wet: wet };
		}
		try {
			SFX[name](sfxDest, ctx.currentTime + 0.015, arg);
		} catch (e) {}
	}

	/* ---------- Controls (top bar of the host screens) ---------- */

	var ICON_ON =
		'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="M15.5 9.2a4 4 0 0 1 0 5.6" /><path d="M18.3 6.5a7.8 7.8 0 0 1 0 11" /></svg>';
	var ICON_OFF =
		'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="M16 9.5l5 5M21 9.5l-5 5" /></svg>';
	var ICON_SFX =
		'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2" /></svg>';
	var ICON_SFX_OFF =
		'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3" /><path d="M5 5l14 14" /></svg>';

	function mountControls() {
		var root = document.getElementById("soundControls");
		if (!root || ui) return;
		if (!AC) {
			root.classList.add("hidden");
			return;
		}
		root.innerHTML =
			'<button type="button" class="icon-btn sound-sfx" data-sound="sfx"></button>' +
			'<input type="range" min="0" max="100" step="1" class="range sound-range" data-sound="volume" aria-label="Music volume" />' +
			'<button type="button" class="sound-unlock" data-sound="unlock">Tap to enable sound</button>' +
			'<button type="button" class="icon-btn sound-btn" data-sound="toggle"></button>';
		ui = {
			root: root,
			sfx: root.querySelector('[data-sound="sfx"]'),
			volume: root.querySelector('[data-sound="volume"]'),
			unlock: root.querySelector('[data-sound="unlock"]'),
			toggle: root.querySelector('[data-sound="toggle"]'),
		};
		ui.toggle.addEventListener("click", function () {
			if (gestureUnlocks || !isRunning()) {
				// locked by the browser or muted: this click turns the sound on
				gestureUnlocks = false;
				ensureContext();
				if (settings.muted) setMuted(false);
				else resume();
				return;
			}
			setMuted(!settings.muted);
		});
		ui.unlock.addEventListener("click", function () {
			ensureContext();
			if (settings.muted) setMuted(false);
			else resume();
		});
		ui.sfx.addEventListener("click", function () {
			settings.sfx = !settings.sfx;
			saveSettings();
			applySettings();
			updateUI();
		});
		ui.volume.addEventListener("input", function () {
			settings.volume = Math.max(0, Math.min(1, ui.volume.value / 100));
			saveSettings();
			applySettings();
		});
		// host pages reached by a redirect: the sound is expected, show "tap to enable" until a gesture
		if (root.hasAttribute("data-autostart")) {
			wanted = true;
			ensureContext();
		}
		updateUI();
	}

	function updateUI() {
		if (!ui) return;
		var locked = wanted && !settings.muted && !isRunning() && !document.hidden;
		var state = locked ? "locked" : settings.muted ? "muted" : "on";
		ui.root.dataset.state = state;
		ui.toggle.innerHTML = state === "on" ? ICON_ON : ICON_OFF;
		ui.toggle.setAttribute("aria-label", locked ? "Enable sound" : settings.muted ? "Unmute" : "Mute");
		ui.toggle.setAttribute("title", locked ? "Tap to enable sound" : settings.muted ? "Unmute" : "Mute");
		ui.sfx.innerHTML = settings.sfx ? ICON_SFX : ICON_SFX_OFF;
		ui.sfx.setAttribute("aria-pressed", settings.sfx ? "true" : "false");
		ui.sfx.setAttribute("aria-label", "Sound effects");
		ui.sfx.setAttribute("title", settings.sfx ? "Sound effects on" : "Sound effects off");
		ui.volume.value = Math.round(settings.volume * 100);
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", mountControls);
	} else {
		mountControls();
	}

	/* ---------- Public API ---------- */

	window.PunchlineAudio = {
		// from a user gesture: unlock the audio, show the controls, play a phase
		start: function (name, opts) {
			mountControls();
			if (ui) ui.root.classList.remove("hidden");
			this.setPhase(name, opts);
			resume();
		},
		setPhase: function (name, opts) {
			wanted = true;
			if (!ensureContext()) return;
			var same = name === phase && current && current.name === name;
			phase = name || null;
			phaseOpts = opts === undefined ? null : opts;
			if (!same || name === "countdown") switchPhase(name === "answering" ? 0.6 : 1.2);
			if (ctx.state !== "running") resume();
			updateUI();
		},
		setUrgent: function (on) {
			if (current && current.name === "answering") current.setUrgent(on !== false);
		},
		sfx: playSfx,
		stop: function () {
			this.setPhase(null);
		},
		setVolume: function (v) {
			settings.volume = Math.max(0, Math.min(1, Number(v) || 0));
			saveSettings();
			applySettings();
			updateUI();
		},
		setMuted: setMuted,
		setSfx: function (on) {
			settings.sfx = !!on;
			saveSettings();
			applySettings();
			updateUI();
		},
		getState: function () {
			return {
				supported: !!AC,
				context: ctx ? ctx.state : "none",
				phase: phase,
				volume: settings.volume,
				muted: settings.muted,
				sfx: settings.sfx,
				custom: !!(current && current instanceof TrackPlayer),
				voices: fading.length + (current ? 1 : 0),
			};
		},
		// for tests: the context and the final node before the speakers
		_debug: {
			context: function () {
				return ctx;
			},
			output: function () {
				return bus && bus.out;
			},
		},
	};
})();
