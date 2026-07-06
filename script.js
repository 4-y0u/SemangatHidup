"use strict";

/* ==========================================================================
   Vitalog — script.js
   Vanilla JS, async/await, modular sections: config, api, state, render,
   form, modal, toast, init.
   ========================================================================== */

/* ---------------------------------------------------------------------- */
/* CONFIG                                                                   */
/* ---------------------------------------------------------------------- */
const API_URL =
  "https://script.google.com/macros/s/AKfycbwJ_0ryvg0Rf8LKW1ISRTK8Gmk2Ld-eGs_TzvX10GLClbT1pQgADOqiy2gE7Oa6cNWa/exec";

const MONTHS_ID = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

/* ---------------------------------------------------------------------- */
/* DOM REFERENCES                                                          */
/* ---------------------------------------------------------------------- */
const dom = {
  todayDate: document.getElementById("todayDate"),

  statHari: document.getElementById("statHari"),
  statPushup: document.getElementById("statPushup"),
  statSitup: document.getElementById("statSitup"),
  statPullup: document.getElementById("statPullup"),
  statPlank: document.getElementById("statPlank"),
  statJalan: document.getElementById("statJalan"),

  form: document.getElementById("entryForm"),
  formTitle: document.getElementById("formTitle"),
  formSub: document.getElementById("formSub"),
  entryId: document.getElementById("entryId"),
  tanggal: document.getElementById("tanggal"),
  pushup: document.getElementById("pushup"),
  situp: document.getElementById("situp"),
  pullup: document.getElementById("pullup"),
  plank: document.getElementById("plank"),
  jalan: document.getElementById("jalan"),
  sarapan: document.getElementById("sarapan"),
  makansiang: document.getElementById("makansiang"),
  makanmalam: document.getElementById("makanmalam"),
  lainnya: document.getElementById("lainnya"),

  submitBtn: document.getElementById("submitBtn"),
  cancelBtn: document.getElementById("cancelBtn"),
  refreshBtn: document.getElementById("refreshBtn"),

  tableLoading: document.getElementById("tableLoading"),
  tableEmpty: document.getElementById("tableEmpty"),
  dataTable: document.getElementById("dataTable"),
  tableBody: document.getElementById("tableBody"),

  confirmModal: document.getElementById("confirmModal"),
  modalCancel: document.getElementById("modalCancel"),
  modalConfirm: document.getElementById("modalConfirm"),

  toastStack: document.getElementById("toastStack"),
};

/* ---------------------------------------------------------------------- */
/* STATE                                                                    */
/* ---------------------------------------------------------------------- */
const state = {
  entries: [],
  editingId: null,
  pendingDeleteId: null,
  isSubmitting: false,
  isDeleting: false,
};

/* ---------------------------------------------------------------------- */
/* HELPERS                                                                  */
/* ---------------------------------------------------------------------- */

/** Convert <input type="date"> value (YYYY-MM-DD) to "DD Mon YYYY" */
function formatDateForApi(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dd = String(d).padStart(2, "0");
  return `${dd} ${MONTHS_ID[m - 1]} ${y}`;
}

/** Convert "DD Mon YYYY" back into an ISO date string for the date input */
function parseApiDateToIso(text) {
  if (!text) return "";
  const parts = String(text).trim().split(/\s+/);
  if (parts.length !== 3) return "";
  const [dd, mon, yyyy] = parts;
  const monthIndex = MONTHS_ID.findIndex(
    (m) => m.toLowerCase() === mon.toLowerCase()
  );
  if (monthIndex === -1) return "";
  const mm = String(monthIndex + 1).padStart(2, "0");
  return `${yyyy}-${mm}-${String(dd).padStart(2, "0")}`;
}

/** Turn a numeric-ish field input into either a Number or "-" when empty */
function numOrDash(value) {
  const trimmed = String(value ?? "").trim();
  if (trimmed === "") return "-";
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : "-";
}

/** Sum a field across all entries, ignoring non-numeric values like "-" */
function sumField(entries, key) {
  return entries.reduce((total, row) => {
    const v = row[key];
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? total + n : total;
  }, 0);
}

/**
 * Turn a raw row from the API into a fixed shape by matching header
 * keywords instead of exact header text. This keeps the site working even
 * if the sheet header has extra spaces, different casing, or different
 * bracket characters than expected (e.g. "Plank (Menit)" vs "Plank(menit)").
 */
function normalizeRow(raw) {
  const findVal = (fragment) => {
    const key = Object.keys(raw).find((k) =>
      k.toLowerCase().replace(/[^a-z0-9]/g, "").includes(fragment)
    );
    return key !== undefined ? raw[key] : undefined;
  };

  return {
    ID: raw.ID ?? raw.Id ?? raw.id ?? findVal("id"),
    Hari: findVal("hari"),
    PushUp: findVal("pushup"),
    SitUp: findVal("situp"),
    PullUp: findVal("pullup"),
    Plank: findVal("plank"),
    Jalan: findVal("jalan"),
    Sarapan: findVal("sarapan"),
    MakanSiang: findVal("makansiang"),
    MakanMalam: findVal("makanmalam"),
    Lainnya: findVal("lainnya"),
  };
}

/** Safe display for table cells: empty/undefined -> "-" */
function displayVal(v) {
  if (v === undefined || v === null || v === "") return "—";
  return v;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function setButtonLoading(btn, loading) {
  const label = btn.querySelector(".btn-label");
  const spinner = btn.querySelector(".btn-spinner");
  btn.disabled = loading;
  if (spinner) spinner.classList.toggle("hidden", !loading);
  if (label) label.style.opacity = loading ? "0.55" : "1";
}

/* ---------------------------------------------------------------------- */
/* API LAYER                                                                */
/* ---------------------------------------------------------------------- */
const api = {
  async fetchAll() {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error("Gagal memuat data dari server.");
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  },

  async create(payload) {
    const res = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify({ action: "create", ...payload }),
    });
    if (!res.ok) throw new Error("Gagal menambah data.");
    return res.json().catch(() => ({}));
  },

  async update(id, payload) {
    const res = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify({ action: "update", id, ...payload }),
    });
    if (!res.ok) throw new Error("Gagal memperbarui data.");
    return res.json().catch(() => ({}));
  },

  async remove(id) {
    const res = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify({ action: "delete", id }),
    });
    if (!res.ok) throw new Error("Gagal menghapus data.");
    return res.json().catch(() => ({}));
  },
};

/* ---------------------------------------------------------------------- */
/* TOAST                                                                    */
/* ---------------------------------------------------------------------- */
function toast(message, type = "success") {
  const el = document.createElement("div");
  el.className = `toast ${type}`;

  const icon =
    type === "success"
      ? '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'
      : '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';

  el.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <span class="toast-msg">${escapeHtml(message)}</span>
  `;

  dom.toastStack.appendChild(el);

  const remove = () => {
    el.classList.add("leaving");
    setTimeout(() => el.remove(), 280);
  };
  setTimeout(remove, 3600);
}

/* ---------------------------------------------------------------------- */
/* RENDER                                                                   */
/* ---------------------------------------------------------------------- */
function renderStats() {
  const entries = state.entries;
  dom.statHari.textContent = entries.length;
  dom.statPushup.textContent = sumField(entries, "PushUp");
  dom.statSitup.textContent = sumField(entries, "SitUp");
  dom.statPullup.textContent = sumField(entries, "PullUp");
  dom.statPlank.textContent = sumField(entries, "Plank");
  dom.statJalan.textContent = sumField(entries, "Jalan");
}

function renderTable() {
  const entries = state.entries;

  dom.tableLoading.classList.add("hidden");

  if (entries.length === 0) {
    dom.tableEmpty.classList.remove("hidden");
    dom.dataTable.classList.add("hidden");
    dom.tableBody.innerHTML = "";
    return;
  }

  dom.tableEmpty.classList.add("hidden");
  dom.dataTable.classList.remove("hidden");

  const rows = [...entries].reverse(); // newest first

  dom.tableBody.innerHTML = rows
    .map((row, i) => {
      const id = row.ID;
      return `
        <tr style="animation-delay:${Math.min(i, 8) * 35}ms">
          <td class="cell-day">${escapeHtml(displayVal(row.Hari))}</td>
          <td class="cell-num">${escapeHtml(displayVal(row.PushUp))}</td>
          <td class="cell-num">${escapeHtml(displayVal(row.SitUp))}</td>
          <td class="cell-num">${escapeHtml(displayVal(row.PullUp))}</td>
          <td class="cell-num">${escapeHtml(displayVal(row.Plank))}</td>
          <td class="cell-num">${escapeHtml(displayVal(row.Jalan))}</td>
          <td class="cell-muted" title="${escapeHtml(row.Sarapan ?? "")}">${escapeHtml(displayVal(row.Sarapan))}</td>
          <td class="cell-muted" title="${escapeHtml(row.MakanSiang ?? "")}">${escapeHtml(displayVal(row.MakanSiang))}</td>
          <td class="cell-muted" title="${escapeHtml(row.MakanMalam ?? "")}">${escapeHtml(displayVal(row.MakanMalam))}</td>
          <td class="cell-muted" title="${escapeHtml(row.Lainnya ?? "")}">${escapeHtml(displayVal(row.Lainnya))}</td>
          <td>
            <div class="row-actions">
              <button class="icon-btn edit" data-action="edit" data-id="${id}" title="Edit" type="button">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
              </button>
              <button class="icon-btn delete" data-action="delete" data-id="${id}" title="Hapus" type="button">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function showTableLoading() {
  dom.tableLoading.classList.remove("hidden");
  dom.tableEmpty.classList.add("hidden");
  dom.dataTable.classList.add("hidden");
}

/* ---------------------------------------------------------------------- */
/* DATA LOADING                                                             */
/* ---------------------------------------------------------------------- */
async function loadData({ silent = false } = {}) {
  if (!silent) showTableLoading();
  try {
    const data = await api.fetchAll();
    state.entries = data.map(normalizeRow);
    renderStats();
    renderTable();
  } catch (err) {
    dom.tableLoading.classList.add("hidden");
    toast(err.message || "Gagal memuat data.", "error");
  }
}

/* ---------------------------------------------------------------------- */
/* FORM                                                                      */
/* ---------------------------------------------------------------------- */
function resetForm() {
  dom.form.reset();
  dom.entryId.value = "";
  state.editingId = null;
  dom.formTitle.textContent = "Tambah Aktivitas";
  dom.formSub.textContent = "Catat progres tubuh dan pola makanmu hari ini.";
  dom.submitBtn.querySelector(".btn-label").textContent = "Simpan";
  dom.cancelBtn.classList.add("hidden");
}

function enterEditMode(row) {
  state.editingId = row.ID;
  dom.entryId.value = row.ID;
  dom.tanggal.value = parseApiDateToIso(row.Hari);
  dom.pushup.value = row.PushUp === "-" ? "" : row.PushUp ?? "";
  dom.situp.value = row.SitUp === "-" ? "" : row.SitUp ?? "";
  dom.pullup.value = row.PullUp === "-" ? "" : row.PullUp ?? "";
  dom.plank.value = row.Plank === "-" ? "" : row.Plank ?? "";
  dom.jalan.value = row.Jalan === "-" ? "" : row.Jalan ?? "";
  dom.sarapan.value = row.Sarapan ?? "";
  dom.makansiang.value = row.MakanSiang ?? "";
  dom.makanmalam.value = row.MakanMalam ?? "";
  dom.lainnya.value = row.Lainnya ?? "";

  dom.formTitle.textContent = "Edit Aktivitas";
  dom.formSub.textContent = `Perbarui catatan untuk ${row.Hari}.`;
  dom.submitBtn.querySelector(".btn-label").textContent = "Update";
  dom.cancelBtn.classList.remove("hidden");

  dom.form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function buildPayloadFromForm() {
  return {
    hari: formatDateForApi(dom.tanggal.value),
    pushup: numOrDash(dom.pushup.value),
    situp: numOrDash(dom.situp.value),
    pullup: numOrDash(dom.pullup.value),
    plank: numOrDash(dom.plank.value),
    jalan: numOrDash(dom.jalan.value),
    sarapan: dom.sarapan.value.trim(),
    makansiang: dom.makansiang.value.trim(),
    makanmalam: dom.makanmalam.value.trim(),
    lainnya: dom.lainnya.value.trim(),
  };
}

async function handleSubmit(e) {
  e.preventDefault();
  if (state.isSubmitting) return;

  if (!dom.tanggal.value) {
    toast("Tanggal wajib diisi.", "error");
    dom.tanggal.focus();
    return;
  }

  state.isSubmitting = true;
  setButtonLoading(dom.submitBtn, true);

  const payload = buildPayloadFromForm();
  const isEdit = Boolean(state.editingId);

  try {
    if (isEdit) {
      await api.update(state.editingId, payload);
      toast("Catatan berhasil diperbarui.", "success");
    } else {
      await api.create(payload);
      toast("Catatan berhasil ditambahkan.", "success");
    }
    resetForm();
    await loadData({ silent: true });
  } catch (err) {
    toast(err.message || "Terjadi kesalahan saat menyimpan.", "error");
  } finally {
    state.isSubmitting = false;
    setButtonLoading(dom.submitBtn, false);
  }
}

/* ---------------------------------------------------------------------- */
/* DELETE / MODAL                                                           */
/* ---------------------------------------------------------------------- */
function openConfirmModal(id) {
  state.pendingDeleteId = id;
  dom.confirmModal.classList.remove("hidden");
}

function closeConfirmModal() {
  dom.confirmModal.classList.add("hidden");
  state.pendingDeleteId = null;
}

async function confirmDelete() {
  if (state.isDeleting || state.pendingDeleteId == null) return;
  state.isDeleting = true;
  setButtonLoading(dom.modalConfirm, true);

  try {
    await api.remove(state.pendingDeleteId);
    toast("Catatan berhasil dihapus.", "success");
    if (state.editingId === state.pendingDeleteId) resetForm();
    closeConfirmModal();
    await loadData({ silent: true });
  } catch (err) {
    toast(err.message || "Gagal menghapus catatan.", "error");
  } finally {
    state.isDeleting = false;
    setButtonLoading(dom.modalConfirm, false);
  }
}

/* ---------------------------------------------------------------------- */
/* EVENTS                                                                    */
/* ---------------------------------------------------------------------- */
function bindEvents() {
  dom.form.addEventListener("submit", handleSubmit);
  dom.cancelBtn.addEventListener("click", resetForm);
  dom.refreshBtn.addEventListener("click", () => loadData());

  dom.tableBody.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const id = Number(btn.dataset.id);
    const row = state.entries.find((r) => r.ID === id);
    if (!row) return;

    if (btn.dataset.action === "edit") enterEditMode(row);
    if (btn.dataset.action === "delete") openConfirmModal(id);
  });

  dom.modalCancel.addEventListener("click", closeConfirmModal);
  dom.modalConfirm.addEventListener("click", confirmDelete);
  dom.confirmModal.addEventListener("click", (e) => {
    if (e.target === dom.confirmModal) closeConfirmModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !dom.confirmModal.classList.contains("hidden")) {
      closeConfirmModal();
    }
  });
}

/* ---------------------------------------------------------------------- */
/* INIT                                                                       */
/* ---------------------------------------------------------------------- */
function renderTopbarDate() {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mon = MONTHS_ID[now.getMonth()];
  dom.todayDate.textContent = `${dd} ${mon} ${now.getFullYear()}`;
}

function init() {
  renderTopbarDate();
  bindEvents();
  loadData();
}

document.addEventListener("DOMContentLoaded", init);
