// URL & kunci Supabase ada di config.js (SUPABASE_URL, SUPABASE_ANON_KEY)

// Semua query otomatis diarahkan ke schema saas_kos
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  db: { schema: 'saas_kos' },
});

const $ = (id) => document.getElementById(id);
let ownerSaatIni = null;
let kostTerpilih = null;
let kamarUntukDiisi = null;

function tampilkan(bagian) {
  for (const id of ['auth', 'onboarding', 'dashboard', 'kamar']) {
    $(id).classList.toggle('hidden', id !== bagian);
  }
  $('btn-keluar').classList.toggle('hidden', bagian === 'auth');
}

function pesan(teks) {
  $('pesan').textContent = teks || '';
}

function rupiah(angka) {
  return 'Rp ' + Number(angka).toLocaleString('id-ID');
}

// Tanggal hari ini (jam lokal perangkat), format YYYY-MM-DD
function hariIni() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

// ---------- Login / Daftar / Keluar ----------
$('btn-daftar').onclick = async () => {
  pesan('');
  const { error } = await db.auth.signUp({
    email: $('email').value,
    password: $('password').value,
  });
  if (error) return pesan(error.message);
  pesan('Akun dibuat. Kalau belum otomatis masuk, klik "Masuk".');
};

$('btn-masuk').onclick = async () => {
  pesan('');
  const { error } = await db.auth.signInWithPassword({
    email: $('email').value,
    password: $('password').value,
  });
  if (error) pesan(error.message);
};

$('btn-keluar').onclick = () => db.auth.signOut();

// ---------- Cek status setelah login ----------
async function mulai(session) {
  if (!session) {
    ownerSaatIni = null;
    kostTerpilih = null;
    return tampilkan('auth');
  }
  const { data, error } = await db
    .from('owners')
    .select('*')
    .eq('user_id', session.user.id)
    .maybeSingle();
  if (error) return pesan(error.message);

  if (!data) return tampilkan('onboarding');

  ownerSaatIni = data;
  $('judul-bisnis').textContent = data.nama_bisnis;
  tampilkan('dashboard');
  muatKost();
}

db.auth.onAuthStateChange((_event, session) => {
  mulai(session);
});

// ---------- Onboarding: buat owner lewat fungsi daftar_owner ----------
$('btn-buat-owner').onclick = async () => {
  pesan('');
  const nama = $('nama-bisnis').value.trim();
  if (!nama) return pesan('Isi nama bisnis dulu.');
  const { error } = await db.rpc('daftar_owner', { p_nama_bisnis: nama });
  if (error) return pesan(error.message);
  const { data } = await db.auth.getSession();
  mulai(data.session);
};

// ---------- Kost: tambah & tampilkan ----------
$('btn-tambah-kost').onclick = async () => {
  pesan('');
  const nama = $('kost-nama').value.trim();
  if (!nama) return pesan('Nama kost wajib diisi.');
  const { error } = await db.from('kosts').insert({
    owner_id: ownerSaatIni.id,
    nama,
    kota: $('kost-kota').value.trim() || null,
  });
  if (error) return pesan(error.message);
  $('kost-nama').value = '';
  $('kost-kota').value = '';
  muatKost();
};

async function muatKost() {
  const { data, error } = await db
    .from('kosts')
    .select('*')
    .eq('owner_id', ownerSaatIni.id)
    .order('nama');
  if (error) return pesan(error.message);
  const wadah = $('daftar-kost');
  wadah.innerHTML = '';
  if (!data.length) {
    wadah.textContent = 'Belum ada kost.';
    return;
  }
  for (const k of data) {
    const div = document.createElement('div');
    div.className = 'card';

    const judul = document.createElement('div');
    judul.textContent = k.nama + (k.kota ? ' — ' + k.kota : '');

    const tombol = document.createElement('button');
    tombol.textContent = 'Kelola kamar';
    tombol.onclick = () => bukaKamar(k);

    div.append(judul, tombol);
    wadah.appendChild(div);
  }
}

// ---------- Kamar: tampilkan & tambah ----------
function bukaKamar(kost) {
  pesan('');
  kostTerpilih = kost;
  $('judul-kost').textContent = kost.nama;
  tutupFormPenghuni();
  tampilkan('kamar');
  muatKamar();
}

$('btn-kembali').onclick = () => {
  pesan('');
  kostTerpilih = null;
  tutupFormPenghuni();
  tampilkan('dashboard');
  muatKost();
};

$('btn-tambah-kamar').onclick = async () => {
  pesan('');
  const nomor = $('kamar-nomor').value.trim();
  const harga = Number($('kamar-harga').value);
  if (!nomor) return pesan('Nomor kamar wajib diisi.');
  if (!(harga >= 0) || $('kamar-harga').value === '') {
    return pesan('Isi harga kamar (boleh 0).');
  }

  const { error } = await db.from('kamars').insert({
    owner_id: ownerSaatIni.id,
    kost_id: kostTerpilih.id,
    nomor,
    harga,
  });
  if (error) {
    // 23505 = nomor kamar sudah dipakai di kost ini
    return pesan(
      error.code === '23505'
        ? 'Nomor kamar ' + nomor + ' sudah ada di kost ini.'
        : error.message
    );
  }
  $('kamar-nomor').value = '';
  $('kamar-harga').value = '';
  muatKamar();
};

async function muatKamar() {
  // Ambil kamar (dengan status terhitung) dan penghuni aktif sekaligus
  const [resKamar, resHuni] = await Promise.all([
    db
      .from('v_kamars')
      .select('id, nomor, harga, status_efektif')
      .eq('kost_id', kostTerpilih.id)
      .order('nomor'),
    db
      .from('penghunis')
      .select('id, kamar_id, nama, no_wa, tgl_masuk')
      .eq('owner_id', ownerSaatIni.id)
      .is('tgl_keluar', null),
  ]);
  if (resKamar.error) return pesan(resKamar.error.message);
  if (resHuni.error) return pesan(resHuni.error.message);

  const huniPerKamar = new Map(resHuni.data.map((h) => [h.kamar_id, h]));

  const wadah = $('daftar-kamar');
  wadah.innerHTML = '';
  if (!resKamar.data.length) {
    wadah.textContent = 'Belum ada kamar.';
    return;
  }

  for (const k of resKamar.data) {
    const div = document.createElement('div');
    div.className = 'card';

    const teks = document.createElement('span');
    teks.textContent = 'Kamar ' + k.nomor + ' — ' + rupiah(k.harga) + ' ';
    const badge = document.createElement('span');
    badge.className = 'badge ' + k.status_efektif;
    badge.textContent = k.status_efektif;
    div.append(teks, badge);

    const huni = huniPerKamar.get(k.id);
    if (huni) {
      const info = document.createElement('div');
      info.className = 'kecil';
      info.textContent =
        'Penghuni: ' + huni.nama +
        (huni.no_wa ? ' (' + huni.no_wa + ')' : '') +
        ' · masuk ' + huni.tgl_masuk;
      const btnKeluar = document.createElement('button');
      btnKeluar.textContent = 'Penghuni keluar';
      btnKeluar.onclick = () => penghuniKeluar(huni, k.nomor);
      div.append(info, btnKeluar);
    } else if (k.status_efektif === 'tersedia') {
      const btnIsi = document.createElement('button');
      btnIsi.textContent = 'Isi penghuni';
      btnIsi.onclick = () => bukaFormPenghuni(k);
      div.append(btnIsi);
    }

    wadah.appendChild(div);
  }
}

// ---------- Penghuni: masuk & keluar ----------
function bukaFormPenghuni(kamar) {
  pesan('');
  kamarUntukDiisi = kamar;
  $('judul-form-penghuni').textContent = 'Isi penghuni — Kamar ' + kamar.nomor;
  $('huni-nama').value = '';
  $('huni-wa').value = '';
  $('huni-masuk').value = hariIni();
  $('huni-harga').value = kamar.harga;
  $('huni-deposit').value = 0;
  $('form-penghuni').classList.remove('hidden');
  $('form-penghuni').scrollIntoView({ behavior: 'smooth' });
}

function tutupFormPenghuni() {
  kamarUntukDiisi = null;
  $('form-penghuni').classList.add('hidden');
}

$('btn-batal-penghuni').onclick = tutupFormPenghuni;

$('btn-simpan-penghuni').onclick = async () => {
  pesan('');
  const nama = $('huni-nama').value.trim();
  const harga = Number($('huni-harga').value);
  const deposit = Number($('huni-deposit').value) || 0;
  if (!nama) return pesan('Nama penghuni wajib diisi.');
  if (!$('huni-masuk').value) return pesan('Isi tanggal masuk.');
  if (!(harga >= 0) || $('huni-harga').value === '') {
    return pesan('Isi harga sewa (boleh 0).');
  }

  const { error } = await db.from('penghunis').insert({
    owner_id: ownerSaatIni.id,
    kamar_id: kamarUntukDiisi.id,
    nama,
    no_wa: $('huni-wa').value.trim() || null,
    tgl_masuk: $('huni-masuk').value,
    harga_sewa: harga,
    deposit,
  });
  if (error) {
    // 23505 = kamar ini sudah punya penghuni aktif
    return pesan(
      error.code === '23505'
        ? 'Kamar ini sudah punya penghuni aktif.'
        : error.message
    );
  }
  tutupFormPenghuni();
  muatKamar();
};

async function penghuniKeluar(huni, nomorKamar) {
  pesan('');
  if (!confirm('Tandai ' + huni.nama + ' sudah keluar dari kamar ' + nomorKamar + '?')) {
    return;
  }
  // Data penghuni TIDAK dihapus, hanya diisi tanggal keluar (riwayat tetap ada)
  const { error } = await db
    .from('penghunis')
    .update({ tgl_keluar: hariIni() })
    .eq('id', huni.id);
  if (error) {
    return pesan(
      error.code === '23514'
        ? 'Tanggal keluar tidak boleh sebelum tanggal masuk.'
        : error.message
    );
  }
  muatKamar();
}

// Saat halaman dibuka, cek apakah sudah login sebelumnya
db.auth.getSession().then(({ data }) => mulai(data.session));
