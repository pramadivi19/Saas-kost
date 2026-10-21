// ====== ISI 2 BARIS INI (Supabase > Project Settings > API) ======
const SUPABASE_URL = 'https://hoechukcnqtdehbgyxqs.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhvZWNodWtjbnF0ZGVoYmd5eHFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1NjU5MjEsImV4cCI6MjEwODE0MTkyMX0.OZN7x6PKCi5oZWLml-eRl0czHU_4xifqQkpPl5CaMkc';
// JANGAN PERNAH pakai service_role / secret key di file ini.
// ================================================================

// Semua query otomatis diarahkan ke schema saas_kos
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  db: { schema: 'saas_kos' },
});

const $ = (id) => document.getElementById(id);
let ownerSaatIni = null;
let kostTerpilih = null;

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
  // RLS menjamin kita hanya melihat owner milik sendiri
  const { data, error } = await db.from('owners').select('*').maybeSingle();
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
  const { data, error } = await db.from('kosts').select('*').order('nama');
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
  tampilkan('kamar');
  muatKamar();
}

$('btn-kembali').onclick = () => {
  pesan('');
  kostTerpilih = null;
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
  // v_kamars menghitung status "terisi" dari penghuni aktif
  const { data, error } = await db
    .from('v_kamars')
    .select('id, nomor, harga, status_efektif')
    .eq('kost_id', kostTerpilih.id)
    .order('nomor');
  if (error) return pesan(error.message);

  const wadah = $('daftar-kamar');
  wadah.innerHTML = '';
  if (!data.length) {
    wadah.textContent = 'Belum ada kamar.';
    return;
  }
  for (const k of data) {
    const div = document.createElement('div');
    div.className = 'card';

    const teks = document.createElement('span');
    teks.textContent = 'Kamar ' + k.nomor + ' — ' + rupiah(k.harga) + ' ';

    const badge = document.createElement('span');
    badge.className = 'badge ' + k.status_efektif;
    badge.textContent = k.status_efektif;

    div.append(teks, badge);
    wadah.appendChild(div);
  }
}

// Saat halaman dibuka, cek apakah sudah login sebelumnya
db.auth.getSession().then(({ data }) => mulai(data.session));