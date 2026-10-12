/* =========================================================
   Task Tracker Kuliah v2 — tersambung ke REST API (Minggu 6)
   Data hidup di server (Mock API Kampus), bukan localStorage.
   Pola: state → render() — UI hanya digambar dari state.
   ========================================================= */

// ---------- Referensi elemen DOM ----------
const taskForm = document.getElementById("taskForm");
const taskInput = document.getElementById("taskInput");
const categorySelect = document.getElementById("categorySelect");
const deadlineInput = document.getElementById("deadlineInput");
const addBtn = document.getElementById("addBtn");
const errorMessage = document.getElementById("errorMessage");
const searchInput = document.getElementById("searchInput");
const filterSection = document.querySelector(".filter-section");
const filterButtons = document.querySelectorAll(".filter-btn");
const taskCounter = document.getElementById("taskCounter");
const statusInfo = document.getElementById("statusInfo");
const taskList = document.getElementById("taskList");
const toast = document.getElementById("toast");

// ---------- Satu sumber kebenaran ----------
const state = {
    status: "loading",  // "loading" | "success" | "error"
    tugas: [],          // data dari GET /api/tugas
    matkul: [],         // data dari GET /api/matkul (untuk <select>)
    error: null,        // pesan error saat memuat
    filter: "all",      // "all" | "active" | "completed"
    q: "",              // kata kunci pencarian (sudah di-debounce)
    mengirim: false,    // true selama POST berjalan
    proses: new Set()   // id tugas yang sedang di-PATCH / DELETE
};

let muatController = null; // AbortController untuk request muat()

/* ---------------------------------------------------------
   Helper api(): satu pintu untuk semua request.
   - body otomatis di-JSON.stringify + header Content-Type
   - cek res.ok → lempar Error berisi pesan dari server
   - bedakan gangguan jaringan (TypeError) vs error HTTP
   --------------------------------------------------------- */
async function api(url, opsi = {}) {
    const init = { method: opsi.method || "GET", signal: opsi.signal };

    if (opsi.body !== undefined) {
        init.headers = { "Content-Type": "application/json" };
        init.body = JSON.stringify(opsi.body);
    }

    let res;
    try {
        res = await fetch(url, init);
    } catch (err) {
        if (err.name === "AbortError") throw err; // dibatalkan sengaja, teruskan apa adanya
        // fetch hanya reject saat jaringan gagal (offline, DNS, CORS)
        throw new Error("Tidak dapat terhubung ke server. Periksa koneksi internet.");
    }

    if (!res.ok) {
        // 4xx / 5xx tetap "resolve" → harus dicek manual
        const data = await res.json().catch(() => ({}));
        const error = new Error(data.error || `HTTP ${res.status} ${res.statusText}`);
        error.status = res.status;
        throw error;
    }

    return res.status === 204 ? null : res.json(); // 204 No Content tidak punya body
}

// ---------- Utilitas kecil ----------
function formatTanggal(iso) {
    const [tahun, bulan, hari] = iso.split("-").map(Number);
    return new Date(tahun, bulan - 1, hari).toLocaleDateString("id-ID", {
        day: "numeric", month: "short", year: "numeric"
    });
}

function hariIni() {
    const d = new Date();
    const pad = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

let toastTimer = null;
function tampilkanToast(pesan) {
    toast.textContent = pesan;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 3500);
}

function debounce(fn, ms) {
    let timer = null;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), ms);
    };
}

/* ---------------------------------------------------------
   render(): menggambar ulang UI dari state
   --------------------------------------------------------- */
function render() {
    renderMatkul();
    renderForm();

    taskList.replaceChildren();
    statusInfo.className = "status-info";
    statusInfo.replaceChildren();

    // Counter hanya bermakna jika data sudah ada
    const aktif = state.tugas.filter(t => !t.selesai).length;
    taskCounter.textContent = state.status === "success" ? `${aktif} tugas aktif` : "";

    // --- state: loading → skeleton ---
    if (state.status === "loading") {
        statusInfo.textContent = "⏳ Memuat tugas dari server…";
        for (let i = 0; i < 3; i++) {
            const skel = document.createElement("li");
            skel.className = "skeleton";
            taskList.append(skel);
        }
        return;
    }

    // --- state: error → pesan + tombol coba lagi ---
    if (state.status === "error") {
        statusInfo.classList.add("is-error");
        statusInfo.append(`Gagal memuat: ${state.error}`);

        const retry = document.createElement("button");
        retry.type = "button";
        retry.id = "retryBtn";
        retry.className = "retry-btn";
        retry.textContent = "↻ Coba lagi";
        statusInfo.append(retry);
        return;
    }

    // --- state: success → filter + cari + urut deadline ---
    const q = state.q.toLowerCase();
    const data = state.tugas
        .filter(t => {
            if (state.filter === "active") return !t.selesai;
            if (state.filter === "completed") return t.selesai;
            return true;
        })
        .filter(t => !q || t.judul.toLowerCase().includes(q) || t.matkul.toLowerCase().includes(q))
        .sort((a, b) => a.deadline.localeCompare(b.deadline));

    // --- state: empty ---
    if (data.length === 0) {
        const kosong = document.createElement("li");
        kosong.className = "empty-message";
        if (q) kosong.textContent = `Tidak ada tugas yang cocok dengan "${state.q}".`;
        else if (state.tugas.length === 0) kosong.textContent = "Belum ada tugas. Tambahkan tugas pertamamu! ✨";
        else kosong.textContent = "Tidak ada tugas di sini 🎉";
        taskList.append(kosong);
        return;
    }

    const today = hariIni();
    data.forEach(task => taskList.append(buatItem(task, today)));
}

function buatItem(task, today) {
    const li = document.createElement("li");
    li.className = "task-item";
    li.dataset.id = task.id;
    if (task.selesai) li.classList.add("completed");
    if (state.proses.has(task.id)) li.classList.add("is-processing");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "task-checkbox";
    checkbox.checked = task.selesai;
    checkbox.setAttribute("aria-label", `Tandai "${task.judul}" selesai`);

    const info = document.createElement("div");
    info.className = "task-info";

    const title = document.createElement("div");
    title.className = "task-title";
    title.textContent = task.judul; // textContent → aman dari XSS

    const meta = document.createElement("div");
    meta.className = "task-meta";
    meta.textContent = `${task.matkul} · deadline ${formatTanggal(task.deadline)}`;

    if (!task.selesai && task.deadline < today) {
        const badge = document.createElement("span");
        badge.className = "badge-late";
        badge.textContent = "terlambat";
        meta.append(" ", badge);
    }

    info.append(title, meta);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "delete-btn";
    deleteBtn.textContent = "×";
    deleteBtn.setAttribute("aria-label", `Hapus "${task.judul}"`);

    li.append(checkbox, info, deleteBtn);
    return li;
}

function renderMatkul() {
    // Isi <select> sekali saja setelah daftar matkul datang
    if (categorySelect.dataset.terisi === "1" || state.matkul.length === 0) return;

    categorySelect.replaceChildren(new Option("Pilih Mata Kuliah", ""));
    state.matkul.forEach(m => categorySelect.append(new Option(m.nama, m.nama)));
    categorySelect.dataset.terisi = "1";
}

function renderForm() {
    // Form hanya bisa dipakai jika data sudah termuat & tidak sedang mengirim
    const siap = state.status === "success";
    addBtn.disabled = !siap || state.mengirim;
    addBtn.textContent = state.mengirim ? "Menyimpan…" : "Tambah";
    categorySelect.disabled = !siap;
}

/* ---------------------------------------------------------
   1) GET — muat tugas & matkul secara PARALEL (Promise.all)
   --------------------------------------------------------- */
async function muat() {
    // Batalkan request muat sebelumnya bila user menekan "coba lagi" berulang kali
    if (muatController) muatController.abort();
    const controller = new AbortController();
    muatController = controller;

    state.status = "loading";
    state.error = null;
    render();

    try {
        const [tugas, matkul] = await Promise.all([
            api("/api/tugas", { signal: controller.signal }),
            api("/api/matkul", { signal: controller.signal })
        ]);
        state.tugas = tugas;
        state.matkul = matkul;
        state.status = "success";
    } catch (err) {
        if (err.name === "AbortError") return; // diganti request yang lebih baru
        state.status = "error";
        state.error = err.message;
    } finally {
        if (muatController === controller) muatController = null;
    }

    render();
}

/* ---------------------------------------------------------
   2) POST — tambah tugas
   --------------------------------------------------------- */
taskForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (state.mengirim) return;

    const judul = taskInput.value.trim();
    const matkul = categorySelect.value;
    const deadline = deadlineInput.value;

    // Validasi sisi klien (server tetap memvalidasi ulang → 400)
    if (judul.length < 3) return tampilkanError("Judul tugas minimal 3 karakter.", taskInput);
    if (!matkul) return tampilkanError("Silakan pilih mata kuliah.", categorySelect);
    if (!deadline) return tampilkanError("Silakan pilih deadline.", deadlineInput);

    errorMessage.textContent = "";
    state.mengirim = true;
    renderForm();

    try {
        const baru = await api("/api/tugas", {
            method: "POST",
            body: { judul, matkul, deadline }
        });
        state.tugas.push(baru); // pakai objek dari server (sudah punya id)
        taskForm.reset();
        categorySelect.value = "";
        tampilkanToast(`Tugas "${baru.judul}" ditambahkan.`);
    } catch (err) {
        // Pesan 400 dari server ditampilkan apa adanya
        errorMessage.textContent = `Gagal menyimpan: ${err.message}`;
    } finally {
        state.mengirim = false;
        render();
        taskInput.focus();
    }
});

function tampilkanError(pesan, elemen) {
    errorMessage.textContent = pesan;
    elemen.focus();
}

/* ---------------------------------------------------------
   3) PATCH & DELETE — lewat event delegation pada <ul>
   --------------------------------------------------------- */
taskList.addEventListener("click", function (event) {
    const item = event.target.closest(".task-item");
    if (!item) return;

    const id = Number(item.dataset.id);
    if (state.proses.has(id)) return; // cegah klik ganda

    if (event.target.closest(".task-checkbox")) toggleSelesai(id);
    else if (event.target.closest(".delete-btn")) hapusTugas(id);
});

// PATCH dengan optimistic update: tampilan berubah dulu, dibatalkan jika server gagal
async function toggleSelesai(id) {
    const task = state.tugas.find(t => t.id === id);
    if (!task) return;

    const nilaiLama = task.selesai;
    task.selesai = !nilaiLama;   // optimistic
    state.proses.add(id);
    render();

    try {
        const dariServer = await api(`/api/tugas/${id}`, {
            method: "PATCH",
            body: { selesai: task.selesai }
        });
        Object.assign(task, dariServer); // sinkronkan dengan respons server
    } catch (err) {
        task.selesai = nilaiLama;    // rollback
        tampilkanToast(`Gagal memperbarui: ${err.message}`);
        if (err.status === 404) state.tugas = state.tugas.filter(t => t.id !== id);
    } finally {
        state.proses.delete(id);
        render();
    }
}

// DELETE: tunggu konfirmasi server (204) baru dihapus dari state
async function hapusTugas(id) {
    const task = state.tugas.find(t => t.id === id);
    if (!task) return;
    if (!confirm(`Hapus tugas "${task.judul}"?`)) return;

    state.proses.add(id);
    render();

    try {
        await api(`/api/tugas/${id}`, { method: "DELETE" });
        state.tugas = state.tugas.filter(t => t.id !== id);
        tampilkanToast(`Tugas "${task.judul}" dihapus.`);
    } catch (err) {
        if (err.status === 404) state.tugas = state.tugas.filter(t => t.id !== id); // sudah tidak ada di server
        tampilkanToast(`Gagal menghapus: ${err.message}`);
    } finally {
        state.proses.delete(id);
        render();
    }
}

/* ---------------------------------------------------------
   Filter, pencarian (debounce), dan coba lagi
   --------------------------------------------------------- */
filterSection.addEventListener("click", function (event) {
    const button = event.target.closest(".filter-btn");
    if (!button) return;

    state.filter = button.dataset.filter;
    filterButtons.forEach(btn => btn.classList.toggle("active", btn === button));
    render();
});

// render baru dijalankan 300 ms setelah user BERHENTI mengetik
const cariDebounced = debounce(function (nilai) {
    state.q = nilai;
    render();
}, 300);

searchInput.addEventListener("input", function () {
    cariDebounced(searchInput.value.trim());
});

statusInfo.addEventListener("click", function (event) {
    if (event.target.id === "retryBtn") muat();
});

/* ---------------------------------------------------------
   Panel simulasi jaringan (untuk demo saat Asistensi)
   --------------------------------------------------------- */
const netPanel = document.getElementById("netPanel");
netPanel.addEventListener("click", function (event) {
    const button = event.target.closest("[data-mode]");
    if (!button || !window.__API) return;

    window.__API.setMode(button.dataset.mode);
    netPanel.querySelectorAll("[data-mode]").forEach(b => b.classList.toggle("active", b === button));
});

// ---------- Mulai ----------
render();
muat();
