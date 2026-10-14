/* ============================================================
   Kartu Ucapan Ulang Tahun — script.js
   Bagian: 1 Data · 2 Helper · 3 Pemutar musik · 4 Confetti
           5 Dekorasi & balon pecah · 6 Tiup lilin
           7 Mesin ketik · 8 Alur halaman · 9 Init
   ============================================================ */

/* ----------------------------------------------------------
   1. Data
   ---------------------------------------------------------- */

/**
 * Daftar lagu. Format: { t: judul, a: artis, s: nama file }
 * Simpan file .mp3 di folder yang sama dengan file ini.
 */
const PLAYLIST = [
  { t: 'Happy Birthday', a: 'sub_clair', s: 'sub_clair-happy-birthday-578363.mp3' },
  { t: 'You', a: 'Lany', s: 'BEOMGYU (TXT) - you! (Original LANY).mp3' },
];

const WISHES = [
  'Semoga selalu diberi kesehatan dan kebahagiaan! 💖',
  'Semoga semua impianmu menjadi kenyataan! ✨',
  'Panjang umur, murah rezeki, dan sukses selalu! 🚀',
  'Semoga tahun ini lebih baik dari tahun sebelumnya! 🌟',
  'Tetaplah menjadi penuh cinta dan kebaikan! 💕',
];

const CONFETTI_COUNT = 120;
const CONFETTI_COLORS = ['#ef4444', '#dc2626', '#f87171', '#b91c1c', '#ff5252', '#fca5a5', '#7f1d1d'];

/**
 * PIN pembuka kartu (angka saja, panjang bebas). Ganti sesuai keinginan.
 * Catatan: ini kunci "iseng" — PIN tersimpan di file ini sehingga bisa
 * dilihat siapa pun yang membuka kode sumber.
 */
const PIN = '1111'; // mis. "1111" (tanggal lahir ddmm)
const PIN_HINT = 'Masukkan PIN untuk membukanya'; // mis. "Tanggal lahirmu (ddmm)"

const BALLOON_COUNT = 6;
const BALLOON_COLORS = ['#ef4444', '#dc2626', '#f87171', '#b91c1c', '#ff5252', '#fca5a5'];
const BG_CONFETTI_COUNT = 19;
const BG_CONFETTI_COLORS = ['#ef4444', '#dc2626', '#f87171', '#b91c1c', '#fca5a5', '#ff5252', '#7f1d1d'];
const POP_TEXTS = ['Pop! 🎈', 'Dor! 💥', 'Yeay! 🎉', 'Selamat! 💖', 'Hore! ✨'];

/** Ambang suara untuk deteksi tiupan (0–1) dan lama minimal (frame ≈ 1/60 detik). */
const BLOW_THRESHOLD = 0.1;
const BLOW_FRAMES = 12;

/** Kecepatan mesin ketik (ms per huruf). */
const TYPE_SPEED = 38;

/** Mode ulang: 0 = mati, 1 = ulangi daftar, 2 = ulangi satu lagu. */
const REPEAT_MODES = [
  { icon: '🔁', label: 'Ulangi: mati' },
  { icon: '🔁', label: 'Ulangi daftar' },
  { icon: '🔂', label: 'Ulangi satu lagu' },
];

/* ----------------------------------------------------------
   2. Helper
   ---------------------------------------------------------- */

const $ = (id) => document.getElementById(id);

/** Buat elemen + opsional class dan teks (aman dari HTML injection). */
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** 83.4 -> "1:23" */
const formatTime = (seconds) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${minutes}:${String(rest).padStart(2, '0')}`;
};

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const between = (min, max) => min + Math.random() * (max - min);
const clamp01 = (value) => Math.min(1, Math.max(0, value));

/* ----------------------------------------------------------
   3. Pemutar musik
   ---------------------------------------------------------- */

const player = (() => {
  const audio = new Audio();

  const ui = {
    list: $('mpList'),
    count: $('mpCount'),
    bar: $('mpBar'),
    play: $('mpPlay'),
    prev: $('mpPrev'),
    next: $('mpNext'),
    playAll: $('mpPlayAll'),
    shuffle: $('mpShuffleBtn'),
    repeat: $('mpRepeatBtn'),
    mute: $('mpMute'),
    vol: $('mpVol'),
    track: $('mpTrackbar'),
    fill: $('mpFill'),
    knob: $('mpKnob'),
    cur: $('mpCur'),
    dur: $('mpDur'),
    curTitle: $('mpCurTitle'),
    curArtist: $('mpCurArtist'),
  };

  const durations = new Map(); // index -> detik
  const broken = new Set();    // index -> file gagal dimuat

  let index = 0;
  let repeatMode = 1;
  let shuffle = false;
  let awaitGesture = false; // autoplay diblokir -> butuh 1 ketukan pengguna

  /* --- Tampilan daftar & status --- */

  const renderRows = () => {
    const playing = !audio.paused;

    [...ui.list.children].forEach((row, i) => {
      const active = i === index;
      row.classList.toggle('is-active', active);
      row.classList.toggle('is-playing', active && playing);
      if (active) row.setAttribute('aria-current', 'true');
      else row.removeAttribute('aria-current');

      const dur = row.querySelector('.mp-dur');
      dur.classList.toggle('is-error', broken.has(i));
      dur.textContent = broken.has(i)
        ? 'file hilang'
        : durations.has(i)
          ? formatTime(durations.get(i))
          : '';
    });
  };

  const setPlaying = (on) => {
    ui.bar.classList.toggle('is-playing', on);
    ui.play.textContent = on ? '❚❚' : '▶';
    ui.play.setAttribute('aria-label', on ? 'Jeda' : 'Putar');
    renderRows();
  };

  const renderRepeat = () => {
    const { icon, label } = REPEAT_MODES[repeatMode];
    ui.repeat.textContent = icon;
    ui.repeat.title = label;
    ui.repeat.setAttribute('aria-label', label);
    ui.repeat.classList.toggle('is-on', repeatMode !== 0);
  };

  const renderMute = () => {
    ui.mute.textContent = audio.muted ? '🔇' : '🔊';
    ui.mute.setAttribute('aria-label', audio.muted ? 'Aktifkan suara' : 'Bisukan');
  };

  /* --- Navigasi --- */

  let failureHandled = false;

  const allBroken = () => PLAYLIST.every((_, i) => broken.has(i));

  /** Indeks pertama setelah `from` yang file-nya masih ada; -1 bila tidak ada. */
  const nextPlayable = (from) => {
    for (let step = 1; step <= PLAYLIST.length; step++) {
      const i = (from + step) % PLAYLIST.length;
      if (!broken.has(i)) return i;
    }
    return -1;
  };

  const handleFailure = () => {
    if (failureHandled) return;
    failureHandled = true;
    setPlaying(false);
    broken.add(index);

    ui.curArtist.textContent = allBroken()
      ? 'Semua file lagu tidak ditemukan'
      : `File "${PLAYLIST[index].s}" tidak ditemukan — pindah ke lagu lain…`;
    renderRows();

    const target = nextPlayable(index);
    if (target === -1) return;
    setTimeout(() => playAt(target), 600);
  };

  const handlePlayError = (error) => {
    if (error && error.name === 'NotAllowedError') {
      setPlaying(false);
      awaitGesture = true;
      ui.play.classList.add('is-attention');
      ui.curArtist.textContent = 'Musik belum bisa mulai otomatis — klik tombol ▶ atau di mana saja di kartu';
      return;
    }
    handleFailure();
  };

  const safePlay = () => audio.play().catch(handlePlayError);

  /** Indeks acak, dijamin beda dari `from` (selama playlist > 1 lagu). */
  const randomIndex = (from) =>
    PLAYLIST.length < 2 ? 0 : (from + 1 + Math.floor(Math.random() * (PLAYLIST.length - 1))) % PLAYLIST.length;

  const playAt = (i) => {
    index = (i + PLAYLIST.length) % PLAYLIST.length;
    const track = PLAYLIST[index];

    broken.delete(index);
    failureHandled = false;
    awaitGesture = false;
    ui.play.classList.remove('is-attention');
    audio.src = track.s;
    audio.currentTime = 0;
    ui.curTitle.textContent = track.t;
    ui.curArtist.textContent = track.a;

    setPlaying(true);
    audio.play().catch(handlePlayError);
  };

  /** Lanjut ke lagu berikutnya. `fromEnded` true saat dipicu event "ended". */
  const advance = (fromEnded) => {
    if (repeatMode === 2 && fromEnded && !broken.has(index)) {
      audio.currentTime = 0;
      safePlay();
      return;
    }

    const wanted = shuffle ? randomIndex(index) : index + 1;
    const target = broken.has(wanted) ? nextPlayable(wanted) : wanted;

    if (target === -1) {
      setPlaying(false);
      ui.curArtist.textContent = 'Semua file lagu tidak ditemukan';
      return;
    }
    playAt(target);
  };

  const toggle = () => (audio.paused ? safePlay() : audio.pause());

  /** Mulai dari lagu pertama yang file-nya ada — dipanggil setelah klik pengguna. */
  const start = () => {
    const target = nextPlayable(-1);
    if (target === -1) {
      ui.curArtist.textContent = 'Semua file lagu tidak ditemukan';
      return;
    }
    playAt(target);
  };

  /* --- Membangun daftar lagu --- */

  const buildList = () => {
    const rows = PLAYLIST.map((track, i) => {
      const row = el('li', 'mp-row');
      row.dataset.index = String(i);

      const eq = el('span', 'mp-eq');
      eq.append(el('span'), el('span'), el('span'));

      const info = el('span', 'mp-tinfo');
      info.append(el('div', 'mp-trow', track.t), el('div', 'mp-arow', track.a));

      row.append(el('span', 'mp-idx', String(i + 1)), eq, info, el('span', 'mp-dur'));
      return row;
    });

    ui.list.replaceChildren(...rows);
    ui.count.textContent = `${PLAYLIST.length} lagu`;
  };

  /* --- Event audio --- */

  audio.addEventListener('play', () => setPlaying(true));
  audio.addEventListener('pause', () => setPlaying(false));

  audio.addEventListener('loadedmetadata', () => {
    durations.set(index, audio.duration);
    ui.dur.textContent = formatTime(audio.duration);
    renderRows();
  });

  audio.addEventListener('timeupdate', () => {
    const progress = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
    const current = formatTime(audio.currentTime);

    ui.cur.textContent = current;
    ui.dur.textContent = formatTime(audio.duration);
    ui.fill.style.width = `${progress}%`;
    ui.knob.style.left = `${progress}%`;
    ui.track.setAttribute('aria-valuenow', String(Math.round(progress)));
    ui.track.setAttribute('aria-valuetext', current);
  });

  audio.addEventListener('ended', () => advance(true));

  audio.addEventListener('error', handleFailure);

  /* --- Kontrol --- */

  ui.list.addEventListener('click', (e) => {
    const row = e.target.closest('.mp-row');
    if (!row) return;
    const i = Number(row.dataset.index);
    if (i === index) toggle();
    else playAt(i);
  });

  ui.playAll.addEventListener('click', start);
  ui.play.addEventListener('click', toggle);
  ui.prev.addEventListener('click', () => playAt(shuffle ? randomIndex(index) : index - 1));
  ui.next.addEventListener('click', () => advance(false));

  ui.shuffle.addEventListener('click', () => {
    shuffle = !shuffle;
    ui.shuffle.classList.toggle('is-on', shuffle);
    ui.shuffle.setAttribute('aria-pressed', String(shuffle));
  });

  ui.repeat.addEventListener('click', () => {
    repeatMode = (repeatMode + 1) % REPEAT_MODES.length;
    renderRepeat();
  });

  ui.track.addEventListener('click', (e) => {
    if (!audio.duration) return;
    const rect = ui.track.getBoundingClientRect();
    audio.currentTime = clamp01((e.clientX - rect.left) / rect.width) * audio.duration;
  });

  // Slider posisi: panah kiri/kanan untuk mundur/maju 5 detik
  ui.track.addEventListener('keydown', (e) => {
    const step = { ArrowLeft: -5, ArrowRight: 5, ArrowDown: -5, ArrowUp: 5 }[e.key];
    if (step === undefined || !audio.duration) return;
    e.preventDefault();
    e.stopPropagation();
    audio.currentTime = Math.min(audio.duration, Math.max(0, audio.currentTime + step));
  });

  ui.vol.addEventListener('input', (e) => {
    audio.volume = e.target.valueAsNumber / 100;
  });

  ui.mute.addEventListener('click', () => {
    audio.muted = !audio.muted;
    renderMute();
  });

  // Pintasan keyboard — hanya aktif saat halaman ucapan tampil
  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    const tag = (e.target && e.target.tagName) || '';
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;
    if ($('page2').classList.contains('is-hidden')) return;

    // Space tidak boleh dicuri saat fokus berada di tombol lain
    if (e.code === 'Space' && tag !== 'BUTTON') {
      e.preventDefault();
      toggle();
    }
    if (e.code === 'ArrowRight' && audio.duration) {
      audio.currentTime = Math.min(audio.duration, audio.currentTime + 10);
    }
    if (e.code === 'ArrowLeft') {
      audio.currentTime = Math.max(0, audio.currentTime - 10);
    }
  });

  // Jika autoplay sempat diblokir, satu ketukan di mana pun di halaman
  // ucapan langsung menghidupkan musik (pakai capture supaya kena duluan).
  document.addEventListener('pointerdown', () => {
    if (!awaitGesture) return;
    if ($('page2').classList.contains('is-hidden')) return;
    awaitGesture = false;
    start();
  }, true);

  /* --- Init --- */

  audio.preload = 'auto';
  audio.volume = ui.vol.valueAsNumber / 100;
  ui.curTitle.textContent = PLAYLIST[0].t;

  buildList();
  renderRows();
  renderRepeat();
  renderMute();

  return { start };
})();

/* ----------------------------------------------------------
   4. Confetti
   ---------------------------------------------------------- */

const burstConfetti = () => {
  const layer = $('confettiLayer');

  for (let i = 0; i < CONFETTI_COUNT; i++) {
    setTimeout(() => {
      const fallMs = between(2000, 5000);
      const piece = el('div', 'confetti-piece');

      piece.style.left = `${between(0, 100)}vw`;
      piece.style.background = pick(CONFETTI_COLORS);
      piece.style.width = `${between(5, 13)}px`;
      piece.style.height = `${between(5, 13)}px`;
      piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
      piece.style.animationDuration = `${fallMs}ms`;

      layer.appendChild(piece);
      setTimeout(() => piece.remove(), fallMs + 100);
    }, i * 30);
  }
};

/* ----------------------------------------------------------
   5. Dekorasi & balon yang bisa dipecahkan
   ---------------------------------------------------------- */

/** Suara "pop" singkat dari noise yang meredam cepat (tanpa file audio). */
const popSound = (() => {
  let ctx = null;
  return () => {
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      const length = Math.floor(ctx.sampleRate * 0.08);
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3);
      }
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      gain.gain.value = 0.35;
      source.buffer = buffer;
      source.connect(gain).connect(ctx.destination);
      source.start();
    } catch (_) { /* audio tidak tersedia: abaikan */ }
  };
})();

const spawnBalloon = (initial = false) => {
  const balloon = el('div', 'balloon');
  const duration = between(16, 24);
  const color = pick(BALLOON_COLORS);

  balloon.style.setProperty('--left', `${between(4, 90)}%`);
  balloon.style.setProperty('--dur', `${duration.toFixed(1)}s`);
  balloon.style.setProperty('--bcolor', color);
  // Balon awal disebar di ketinggian berbeda; balon pengganti mulai dari bawah.
  if (initial) balloon.style.setProperty('--delay', `-${between(0, duration).toFixed(1)}s`);
  balloon.dataset.color = color;

  $('balloons').append(balloon);
};

const popBalloon = (balloon) => {
  const rect = balloon.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const color = balloon.dataset.color || '#ef4444';
  const layer = $('confettiLayer');

  balloon.remove();
  popSound();

  // Serpihan balon
  for (let i = 0; i < 14; i++) {
    const shard = el('div', 'pop-shard');
    const angle = Math.random() * Math.PI * 2;
    const distance = between(40, 110);
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance + between(20, 60); // sedikit jatuh

    shard.style.left = `${cx}px`;
    shard.style.top = `${cy}px`;
    shard.style.background = i % 3 === 0 ? '#fff' : color;
    layer.append(shard);

    shard.animate(
      [
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) scale(.2)`, opacity: 0 },
      ],
      { duration: between(500, 900), easing: 'cubic-bezier(.2,.7,.4,1)' }
    ).onfinish = () => shard.remove();
  }

  // Teks "Pop!" melayang naik
  const label = el('div', 'pop-text', pick(POP_TEXTS));
  label.style.left = `${cx - 30}px`;
  label.style.top = `${cy - 10}px`;
  layer.append(label);
  label.animate(
    [
      { transform: 'translateY(0) scale(.6)', opacity: 0 },
      { transform: 'translateY(-18px) scale(1.15)', opacity: 1, offset: 0.25 },
      { transform: 'translateY(-60px) scale(1)', opacity: 0 },
    ],
    { duration: 900, easing: 'ease-out' }
  ).onfinish = () => label.remove();

  // Balon baru muncul lagi dari bawah
  setTimeout(() => spawnBalloon(), between(1500, 4000));
};

const buildDecorations = () => {
  for (let i = 0; i < BALLOON_COUNT; i++) spawnBalloon(true);

  const bg = $('confettiBg');
  for (let i = 0; i < BG_CONFETTI_COUNT; i++) {
    const piece = el('span');
    piece.style.setProperty('--x', `${between(3, 97).toFixed(0)}%`);
    piece.style.setProperty('--fall', `${between(5, 8).toFixed(1)}s`);
    piece.style.setProperty('--color', pick(BG_CONFETTI_COLORS));
    piece.style.animationDelay = `-${between(0, 6).toFixed(1)}s`;
    bg.append(piece);
  }

  // pointerdown: respons langsung di layar sentuh
  $('balloons').addEventListener('pointerdown', (e) => {
    const balloon = e.target.closest('.balloon');
    if (balloon) popBalloon(balloon);
  });
};

/* ----------------------------------------------------------
   6. Tiup lilin
   ---------------------------------------------------------- */

const candleGame = (() => {
  const scene = $('cakeScene');
  const candles = [...scene.querySelectorAll('.candle')];
  const title = $('candleTitle');
  const hint = $('candleHint');
  const micBtn = $('micBtn');
  const blowBtn = $('blowBtn');

  let onDone = null;
  let finished = false;
  let mic = null; // { stream, ctx, raf }

  const setLean = (value) => scene.style.setProperty('--blow', value.toFixed(2));

  const stopMic = () => {
    if (!mic) return;
    cancelAnimationFrame(mic.raf);
    mic.stream.getTracks().forEach((track) => track.stop());
    mic.ctx.close().catch(() => {});
    mic = null;
    setLean(0);
  };

  const finish = () => {
    if (finished) return;
    finished = true;
    stopMic();

    title.textContent = 'Yeay! 🎉';
    hint.textContent = 'Semoga permohonanmu terkabul!';
    micBtn.disabled = true;
    blowBtn.disabled = true;

    burstConfetti();
    // Bila lilin ditiup lewat klik, ini masih dalam "gesture" pengguna sehingga
    // musik boleh langsung diputar. Kalau diblokir, pemutar punya cadangan sendiri.
    player.start();
    setTimeout(() => onDone && onDone(), 1900);
  };

  const blowOut = (candle) => {
    if (finished || candle.classList.contains('is-out')) return;
    candle.classList.add('is-out');
    if (candles.every((c) => c.classList.contains('is-out'))) finish();
  };

  const blowAll = () => {
    candles.forEach((candle, i) => setTimeout(() => blowOut(candle), i * 120));
  };

  const startMic = async () => {
    if (mic || finished) return;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      hint.textContent = 'Mikrofon tidak tersedia di sini — klik lilinnya saja ya 😊';
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      await ctx.resume();

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);

      const samples = new Uint8Array(analyser.fftSize);
      let loudFrames = 0;
      mic = { stream, ctx, raf: 0 };

      micBtn.disabled = true;
      micBtn.textContent = '🎤 Mendengarkan…';
      hint.textContent = 'Tiup kencang ke arah mikrofon 💨';

      const tick = () => {
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (const v of samples) {
          const n = (v - 128) / 128;
          sum += n * n;
        }
        const level = Math.sqrt(sum / samples.length);

        setLean(clamp01(level * 4)); // api ikut meliuk
        loudFrames = level > BLOW_THRESHOLD ? loudFrames + 1 : Math.max(0, loudFrames - 1);

        if (loudFrames >= BLOW_FRAMES) {
          blowAll();
          return;
        }
        mic.raf = requestAnimationFrame(tick);
      };
      tick();
    } catch (_) {
      hint.textContent = 'Izin mikrofon ditolak — klik lilinnya saja ya 😊';
    }
  };

  candles.forEach((candle) => candle.addEventListener('click', () => blowOut(candle)));
  blowBtn.addEventListener('click', blowAll);
  micBtn.addEventListener('click', startMic);

  /** Siapkan halaman lilin untuk `name`; panggil `done` setelah semua lilin padam. */
  const open = (name, done) => {
    onDone = done;
    finished = false;
    candles.forEach((c) => c.classList.remove('is-out'));
    title.textContent = `Tiup Lilinnya, ${name}!`;
    hint.textContent = 'Buat permohonan dulu, lalu tiup lilinnya 🕯️';
    micBtn.disabled = false;
    micBtn.textContent = '🎤 Tiup lewat mikrofon';
    blowBtn.disabled = false;
  };

  return { open };
})();

/* ----------------------------------------------------------
   7. Mesin ketik
   ---------------------------------------------------------- */

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const typing = { run: 0, skip: false };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Ketik `text` huruf demi huruf. Bagian yang belum diketik tetap ada di DOM
 * (disembunyikan) supaya tinggi kartu tidak berubah-ubah.
 */
const typeInto = (typed, rest, text, run) => new Promise((resolve) => {
  const chars = Array.from(text); // Array.from menjaga emoji tidak terpotong
  let i = 0;

  const step = () => {
    if (run !== typing.run) return resolve();

    i = typing.skip ? chars.length : i + 1;
    typed.textContent = chars.slice(0, i).join('');
    rest.textContent = chars.slice(i).join('');
    if (i >= chars.length) return resolve();

    const pause = ',.!?'.includes(chars[i - 1]) ? 140 : 0; // jeda di tanda baca
    setTimeout(step, TYPE_SPEED + pause);
  };
  step();
});

const typeWishes = async () => {
  const run = ++typing.run;
  typing.skip = reduceMotion;

  const rows = WISHES.map((wish) => {
    const p = el('p');
    const typed = el('span', 'tw-typed');
    const rest = el('span', 'tw-rest', wish);
    p.append(typed, rest);
    return { p, typed, rest, wish };
  });
  $('wishesList').replaceChildren(...rows.map((row) => row.p));

  if (!typing.skip) await sleep(500);

  for (const { p, typed, rest, wish } of rows) {
    if (run !== typing.run) return;
    p.classList.add('is-typing');
    await typeInto(typed, rest, wish, run);
    p.classList.remove('is-typing');
    if (!typing.skip) await sleep(250);
  }
};

/* ----------------------------------------------------------
   8. Alur halaman: nama -> lilin -> ucapan
   ---------------------------------------------------------- */

const goToCandle = () => {
  const input = $('nameInput');
  const name = input.value.trim();

  if (!name) {
    input.classList.add('is-invalid');
    input.focus();
    return;
  }

  input.classList.remove('is-invalid');
  $('page1').classList.add('is-hidden');
  $('pageCandle').classList.remove('is-hidden');

  candleGame.open(name, () => showWishes(name));
};

const showWishes = (name) => {
  $('pageCandle').classList.add('is-hidden');
  $('page2').classList.remove('is-hidden');
  $('greeting').textContent = `Happy Birthday, ${name}! 🎂`;

  typeWishes();
};

/* ----------------------------------------------------------
   8b. Kunci PIN
   ---------------------------------------------------------- */

const pinLock = (() => {
  const page = $('pagePin');
  const dotsBox = $('pinDots');
  const hint = $('pinHint');
  const icon = $('pinIcon');

  const dots = Array.from({ length: PIN.length }, () => el('span', 'pin-dot'));
  dotsBox.replaceChildren(...dots);
  hint.textContent = PIN_HINT;

  let value = '';
  let busy = false;

  const render = () => dots.forEach((dot, i) => dot.classList.toggle('is-filled', i < value.length));

  const unlock = () => {
    busy = true;
    icon.textContent = '🔓';
    dotsBox.classList.add('is-ok');
    hint.textContent = 'PIN benar! 🎉';

    setTimeout(() => {
      page.classList.add('is-hidden');
      $('page1').classList.remove('is-hidden');
      $('nameInput').focus();
    }, 700);
  };

  const wrong = () => {
    busy = true;
    dotsBox.classList.add('is-wrong');
    hint.textContent = 'PIN salah, coba lagi';

    setTimeout(() => {
      value = '';
      render();
      dotsBox.classList.remove('is-wrong');
      hint.textContent = PIN_HINT;
      busy = false;
    }, 700);
  };

  const press = (digit) => {
    if (busy || value.length >= PIN.length) return;
    value += digit;
    render();
  };

  /** Dipanggil saat tombol ✓ atau Enter ditekan. */
  const submit = () => {
    if (busy) return;
    if (value.length === 0) return;
    if (value === PIN) unlock();
    else wrong();
  };

  const back = () => {
    if (busy) return;
    value = value.slice(0, -1);
    render();
  };

  $('keypad').addEventListener('click', (e) => {
    const key = e.target.closest('.key');
    if (!key) return;
    if (key.dataset.key === 'back') back();
    else if (key.dataset.key === 'ok') submit();
    else press(key.dataset.key);
  });

  // Keyboard fisik: angka dan Backspace
  window.addEventListener('keydown', (e) => {
    if (page.classList.contains('is-hidden') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^\d$/.test(e.key)) press(e.key);
    else if (e.key === 'Backspace') back();
    else if (e.key === 'Enter') submit();
  });
})();


/* ----------------------------------------------------------
   9. Init
   ---------------------------------------------------------- */

buildDecorations();

$('nameForm').addEventListener('submit', (e) => {
  e.preventDefault();
  goToCandle();
});

$('nameInput').addEventListener('input', (e) => {
  e.target.classList.remove('is-invalid');
});

// Klik teks ucapan = lewati animasi ketik
$('wishesList').addEventListener('click', () => { typing.skip = true; });

$('restartBtn').addEventListener('click', () => window.location.reload());
