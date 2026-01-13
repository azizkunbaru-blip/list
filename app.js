// app.js
const fmtIDR = (n) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

const fmtDate = (iso) => {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });
};

const daysDiff = (iso) => {
  const now = new Date();
  const due = new Date(iso + "T00:00:00");
  const ms = due.setHours(0, 0, 0, 0) - new Date(now.setHours(0, 0, 0, 0));
  return Math.round(ms / (1000 * 60 * 60 * 24));
};

const dueClass = (iso) => {
  const d = daysDiff(iso);
  if (d < 0) return "bad";
  if (d <= 3) return "warn";
  return "ok";
};

const getParam = (k) => new URLSearchParams(location.search).get(k);

function sum(items) {
  return items.reduce((s, x) => s + x.amount, 0);
}

// Tetap dipakai (tanpa paid/lunas), agar hasil sebelumnya (stat-box dll) tetap aman:
function sumUnpaid(items) {
  return items.reduce((s, x) => s + x.amount, 0);
}
function sumPaid(items) {
  return 0;
}

function uniqBanks(data) {
  const set = new Set();
  data.forEach((p) => p.items.forEach((i) => set.add(i.bank)));
  return [...set].sort((a, b) => a.localeCompare(b, "id"));
}

/* =======================
   PAGE: INDEX
======================= */
function initIndex() {
  const data = window.DEBT_DATA;
  const qEl = document.getElementById("q");
  const bankEl = document.getElementById("bankFilter");
  const sortEl = document.getElementById("sortBy");
  const listEl = document.getElementById("list");
  const countEl = document.getElementById("countPill");
  const todayEl = document.getElementById("todayText");

  todayEl.textContent =
    "Hari ini: " +
    new Date().toLocaleDateString("id-ID", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

  uniqBanks(data).forEach((b) => {
    const opt = document.createElement("option");
    opt.value = b;
    opt.textContent = b;
    bankEl.appendChild(opt);
  });

  function minNextDue(items) {
    let best = null;
    for (const it of items) {
      const dd = daysDiff(it.due);
      if (best === null || dd < best) best = dd;
    }
    return best ?? 99999;
  }

  function render() {
    const q = qEl.value.trim().toLowerCase();
    const bf = bankEl.value;

    let arr = data.map((p) => ({
      ...p,
      _banks: [...new Set(p.items.map((i) => i.bank))],
      _nextDue: minNextDue(p.items),
      _unpaid: sumUnpaid(p.items), // total semua item (karena belum ada fitur lunas)
    }));

    arr = arr.filter((p) => {
      const matchQ = !q || p.name.toLowerCase().includes(q) || p._banks.some((b) => b.toLowerCase().includes(q));
      const matchB = bf === "ALL" || p._banks.includes(bf);
      return matchQ && matchB;
    });

    if (sortEl.value === "NAME") arr.sort((a, b) => a.name.localeCompare(b.name, "id"));
    if (sortEl.value === "SISA_DESC") arr.sort((a, b) => b._unpaid - a._unpaid);
    if (sortEl.value === "NEXT_DUE_ASC") arr.sort((a, b) => a._nextDue - b._nextDue);

    countEl.textContent = `${arr.length} orang`;
    listEl.innerHTML = "";

    if (!arr.length) {
      listEl.innerHTML = `<div class="empty">Tidak ada hasil.</div>`;
      return;
    }

    for (const p of arr) {
      const next = p.items
        .map((it) => ({ due: it.due, d: daysDiff(it.due) }))
        .sort((a, b) => a.d - b.d)[0];

      let statusLabel = "Aman",
        status = "ok";
      if (next) {
        if (next.d < 0) {
          statusLabel = "Overdue";
          status = "bad";
        } else if (next.d <= 3) {
          statusLabel = "Mepet";
          status = "warn";
        }
      }

      const a = document.createElement("a");
      a.className = "rowLink";
      a.href = `detail.html?name=${encodeURIComponent(p.name)}`;

      a.innerHTML = `
        <div class="row">
          <div>
            <div class="name">${p.name}</div>
            <div class="mini">${p._banks.join(" • ")}</div>
          </div>
          <div class="meta">
            <span class="chip ${status}">${statusLabel}</span>
            <span class="chip amount">Belum lunas: ${fmtIDR(p._unpaid)}</span>
          </div>
        </div>
      `;
      listEl.appendChild(a);
    }
  }

  document.getElementById("resetBtn").addEventListener("click", () => {
    qEl.value = "";
    bankEl.value = "ALL";
    sortEl.value = "NAME";
    render();
  });

  [qEl, bankEl, sortEl].forEach((el) => el.addEventListener("input", render));
  render();
}

/* =======================
   PAGE: DETAIL
======================= */
function initDetail() {
  const data = window.DEBT_DATA;
  const name = getParam("name");
  const p = data.find((x) => x.name === name);

  const titleEl = document.getElementById("detailTitle");
  const backEl = document.getElementById("backName");
  const boxEl = document.getElementById("detailBox");
  const todayEl = document.getElementById("todayText");

  todayEl.textContent =
    "Hari ini: " +
    new Date().toLocaleDateString("id-ID", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

  if (!p) {
    titleEl.textContent = "Data tidak ditemukan";
    boxEl.innerHTML = `<div class="empty">Nama tidak valid. Kembali ke <a href="index.html">index</a>.</div>`;
    return;
  }

  titleEl.textContent = p.name;
  backEl.textContent = p.name;

  function render() {
    const total = sum(p.items);

// Ambil dari data jika tersedia
const unpaid = (typeof p.sisa === "number") ? p.sisa : Math.max(0, total - (p.nyicil || 0));

// Sudah lunas tampilkan "paid_real" jika ada, kalau tidak pakai nyicil
const paid = (typeof p.paid_real === "number") ? p.paid_real : (p.nyicil || 0);

    const nextDue = p.items
      .map((it) => ({ iso: it.due, d: daysDiff(it.due) }))
      .sort((a, b) => a.d - b.d)[0]?.iso ?? "-";

    const rows = p.items
      .slice()
      .sort((a, b) => new Date(a.due) - new Date(b.due))
      .map((it) => {
        const cls = dueClass(it.due);
        const d = daysDiff(it.due);
        const label = d < 0 ? `(${Math.abs(d)} hari lewat)` : d === 0 ? "(hari ini)" : `(${d} hari lagi)`;

        // ✅ GANTI tombol interaktif jadi badge statis tidak bisa diklik
        return `
          <tr>
            <td class="bank">${it.bank}</td>
            <td class="amount">${fmtIDR(it.amount)}</td>
            <td class="due ${cls}">${fmtDate(it.due)} <span class="muted">${label}</span></td>
            <td>
  ${
    unpaid === 0
      ? `<span class="status-badge lunas" aria-disabled="true">LUNAS</span>`
      : `<span class="status-badge belum" aria-disabled="true">BELUM LUNAS</span>`
  }
</td>
          </tr>
        `;
      })
      .join("");

    boxEl.innerHTML = `
      <div class="stats">
        <div class="stat">
          <div class="k">NYICIL</div>
          <div class="v amount">${fmtIDR(p.nyicil)}</div>
        </div>
        <div class="stat">
          <div class="k">Total item</div>
          <div class="v">${p.items.length} transaksi</div>
        </div>
        <div class="stat">
          <div class="k">Next due</div>
          <div class="v">${nextDue === "-" ? "-" : fmtDate(nextDue)}</div>
        </div>
        <div class="stat">
          <div class="k">Total nominal</div>
          <div class="v amount">${fmtIDR(total)}</div>
        </div>
        <div class="stat">
          <div class="k">Sudah lunas</div>
          <div class="v amount">${fmtIDR(paid)}</div>
        </div>
        <div class="stat">
          <div class="k">Belum lunas</div>
          <div class="v amount">${fmtIDR(unpaid)}</div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Bank / Pinjol</th>
            <th>Nominal</th>
            <th>Jatuh tempo</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <div class="payBox">
  <div class="payHeader">
    <img src="https://upload.wikimedia.org/wikipedia/commons/7/72/Logo_dana_blue.svg" alt="DANA" class="payLogo">
    <div>
      <div class="payTitle">Pembayaran via DANA</div>
      <div class="paySubtitle">Silakan transfer ke nomor berikut</div>
    </div>
  </div>

  <div class="payNumber">
    <span>083136937804</span>
    <small>a.n MINANUL AZIZ</small>
  </div>

  <div class="payNote">
    Setelah melakukan pembayaran, harap konfirmasi ke admin.
  </div>
</div>

      <div class="mini" style="margin-top:12px">
        Status hanya tampilan (view only) dan tidak bisa diubah.
      </div>
    `;
  }

  render();
}
function initPopupMotivasi(){
  const overlay = document.getElementById("popupMotivasi");
  const closeBtn = document.getElementById("popupClose");
  if (!overlay || !closeBtn) return;

  // tampil 1x per sesi (bukan selamanya)
  const KEY = "popupMotivasiShown";
  if (sessionStorage.getItem(KEY) === "1") return;

  // tampil setelah halaman siap
  requestAnimationFrame(() => {
    overlay.classList.add("show");
    overlay.setAttribute("aria-hidden", "false");
    sessionStorage.setItem(KEY, "1");
  });

  const close = () => {
    overlay.classList.remove("show");
    overlay.setAttribute("aria-hidden", "true");
  };

  closeBtn.addEventListener("click", close);

  // klik area gelap untuk tutup
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  // tombol ESC untuk tutup
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
}

/* =======================
   BOOT
======================= */
(function boot(){
  initPopupMotivasi();
  const page = document.body.getAttribute("data-page");
  if (page === "index") initIndex();
  if (page === "detail") initDetail();
})();
