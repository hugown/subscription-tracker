const API = "/api";

const CATEGORY_PALETTE = [
  "#163460", "#4f6f9c", "#d97706", "#94a3b8",
  "#7c3aed", "#0891b2", "#be123c", "#65a30d",
  "#0d9488", "#9333ea",
];

const els = {
  summaryMonthly: document.getElementById("summary-monthly"),
  summaryAnnual: document.getElementById("summary-annual"),
  donut: document.getElementById("donut"),
  donutCount: document.getElementById("donut-count"),
  categoryBreakdown: document.getElementById("category-breakdown"),
  upcomingList: document.getElementById("upcoming-list"),
  subsTbody: document.getElementById("subs-tbody"),
  sortSelect: document.getElementById("sort-select"),
  addBtn: document.getElementById("add-btn"),
  modalBackdrop: document.getElementById("modal-backdrop"),
  modalTitle: document.getElementById("modal-title"),
  form: document.getElementById("sub-form"),
  cancelBtn: document.getElementById("cancel-btn"),
  fieldId: document.getElementById("sub-id"),
  fieldName: document.getElementById("field-name"),
  fieldCost: document.getElementById("field-cost"),
  fieldCycle: document.getElementById("field-cycle"),
  customDaysWrap: document.getElementById("custom-days-wrap"),
  fieldCustomDays: document.getElementById("field-custom-days"),
  dateWrap: document.getElementById("date-wrap"),
  fieldDate: document.getElementById("field-date"),
  fieldCategory: document.getElementById("field-category"),
  fieldNotes: document.getElementById("field-notes"),
  fieldInclude: document.getElementById("field-include"),
  notesPopover: document.getElementById("notes-popover"),
};

let openNotesRowId = null;

let allSubs = [];
let sortKey = "date";
let sortDir = "asc";
let categoryColorMap = new Map();

function fmtMoney(amount) {
  return `${Number(amount).toFixed(2).replace(".", ",")}:-`;
}

function fmtDate(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("sv-SE", { month: "short", day: "numeric", year: "numeric" });
}

function cycleLabel(sub) {
  switch (sub.billing_cycle) {
    case "weekly": return "Varje vecka";
    case "monthly": return `Månadsvis (dag ${new Date(sub.next_payment_date + "T00:00:00").getDate()})`;
    case "yearly": return "Årsvis";
    case "last_business_day": return "Sista vardagen i månaden";
    case "custom": return `Var ${sub.custom_days}:e dag`;
    default: return sub.billing_cycle;
  }
}

function categoryColorFor(cat) {
  return categoryColorMap.get(cat) || "#94a3b8";
}

function pillBackground(color) {
  return `color-mix(in srgb, ${color} 14%, white)`;
}

function pillTextColor(color) {
  return `color-mix(in srgb, ${color} 72%, #0b1f3a)`;
}

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    let msg = `Förfrågan misslyckades (${res.status})`;
    try {
      const body = await res.json();
      if (body.error) msg = body.error;
    } catch (_) {}
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function refreshAll() {
  const [subs, upcoming, summary] = await Promise.all([
    api("/subscriptions"),
    api("/upcoming?days=30"),
    api("/summary"),
  ]);
  allSubs = subs;
  buildCategoryColorMap(summary);
  renderSummary(summary);
  renderUpcoming(upcoming);
  renderCategoryInsights(summary);
  renderTable();
  updateSortArrows();
}

function renderSummary(summary) {
  els.summaryMonthly.textContent = fmtMoney(summary.total_monthly);
  els.summaryAnnual.textContent = fmtMoney(summary.total_annual);
}

function renderUpcoming(items) {
  if (!items.length) {
    els.upcomingList.innerHTML = `<p class="empty-state">Inget att betala de kommande 30 dagarna.</p>`;
    return;
  }
  els.upcomingList.innerHTML = items
    .map((s) => {
      const when = s.days_until === 0 ? "Idag" : s.days_until === 1 ? "Imorgon" : `Om ${s.days_until} dagar`;
      return `
        <div class="upcoming-item">
          <span class="name">${escapeHtml(s.name)} — ${fmtMoney(s.cost)}</span>
          <span class="when">${when} · ${fmtDate(s.next_payment_date)}</span>
        </div>`;
    })
    .join("");
}

function buildCategoryColorMap(summary) {
  categoryColorMap = new Map();
  Object.keys(summary.by_category || {}).forEach((cat, i) => {
    categoryColorMap.set(cat, CATEGORY_PALETTE[i % CATEGORY_PALETTE.length]);
  });
}

function renderCategoryInsights(summary) {
  const entries = Object.entries(summary.by_category || {});
  els.donutCount.textContent = entries.length;

  if (!entries.length) {
    els.donut.style.background = "var(--border)";
    els.categoryBreakdown.innerHTML = `<p class="empty-state">Inga prenumerationer än.</p>`;
    return;
  }

  const totalMonthly = entries.reduce((sum, [, v]) => sum + v.monthly, 0) || 1;
  let cumulative = 0;
  const gradientParts = entries.map(([cat, v]) => {
    const color = categoryColorFor(cat);
    const start = (cumulative / totalMonthly) * 100;
    cumulative += v.monthly;
    const end = (cumulative / totalMonthly) * 100;
    return `${color} ${start.toFixed(1)}% ${end.toFixed(1)}%`;
  });
  els.donut.style.background = `conic-gradient(${gradientParts.join(", ")})`;

  els.categoryBreakdown.innerHTML = entries
    .map(([cat, v]) => {
      const color = categoryColorFor(cat);
      return `
      <div class="category-row">
        <span class="cat-name"><span class="category-dot" style="background:${color};"></span>${escapeHtml(cat)} <span class="muted">(${v.count})</span></span>
        <span class="cat-value">${fmtMoney(v.monthly)}/mån</span>
      </div>`;
    })
    .join("");
}

function sortedSubs() {
  const dir = sortDir === "asc" ? 1 : -1;
  const copy = [...allSubs];
  copy.sort((a, b) => {
    if (sortKey === "name") return a.name.localeCompare(b.name, "sv") * dir;
    if (sortKey === "cost") return (a.cost - b.cost) * dir;
    if (sortKey === "category") return (a.category || "").localeCompare(b.category || "", "sv") * dir;
    return a.next_payment_date.localeCompare(b.next_payment_date) * dir;
  });
  return copy;
}

function renderTable() {
  closeNotesPopover();
  const subs = sortedSubs();
  if (!subs.length) {
    els.subsTbody.innerHTML = `<tr><td colspan="7" class="empty-state">Inga prenumerationer än — lägg till din första ovan.</td></tr>`;
    return;
  }
  els.subsTbody.innerHTML = subs
    .map((s) => {
      const cat = s.category || "Okategoriserad";
      const color = categoryColorFor(cat);
      return `
      <tr class="${s.include_in_totals ? "" : "row-excluded"} ${s.notes ? "has-notes" : ""}" data-row-id="${s.id}">
        <td>${escapeHtml(s.name)}</td>
        <td>${fmtMoney(s.cost)}</td>
        <td>${cycleLabel(s)}</td>
        <td>${fmtDate(s.next_payment_date)}</td>
        <td><span class="category-pill" style="background:${pillBackground(color)}; color:${pillTextColor(color)};">${escapeHtml(cat)}</span></td>
        <td><input type="checkbox" class="include-toggle" data-include-toggle="${s.id}" ${s.include_in_totals ? "checked" : ""} /></td>
        <td class="row-actions">
          <button class="btn btn-edit btn-small" data-edit="${s.id}">Redigera</button>
          <button class="btn btn-danger btn-small" data-delete="${s.id}">Ta bort</button>
        </td>
      </tr>`;
    })
    .join("");
}

function updateSortArrows() {
  document.querySelectorAll(".sort-arrow").forEach((el) => {
    const key = el.getAttribute("data-arrow");
    el.textContent = key === sortKey ? (sortDir === "asc" ? "↑" : "↓") : "";
  });
}

function setSort(key) {
  if (sortKey === key) {
    sortDir = sortDir === "asc" ? "desc" : "asc";
  } else {
    sortKey = key;
    sortDir = "asc";
  }
  els.sortSelect.value = sortKey;
  updateSortArrows();
  renderTable();
}

function toISODateLocal(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function lastBusinessDayOfMonth(year, monthIndex0) {
  const d = new Date(year, monthIndex0 + 1, 0);
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() - 1);
  }
  return d;
}

function nextLastBusinessDay(today = new Date()) {
  const candidate = lastBusinessDayOfMonth(today.getFullYear(), today.getMonth());
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (candidate < todayMidnight) {
    return lastBusinessDayOfMonth(today.getFullYear(), today.getMonth() + 1);
  }
  return candidate;
}

function updateDateFieldForCycle(cycle, { autofill = true } = {}) {
  const isLastBizDay = cycle === "last_business_day";
  els.dateWrap.classList.toggle("hidden", isLastBizDay);
  els.fieldDate.required = !isLastBizDay;
  if (isLastBizDay && autofill) {
    els.fieldDate.value = toISODateLocal(nextLastBusinessDay());
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function openModal(sub = null) {
  els.form.reset();
  els.fieldCycle.value = "monthly";
  els.customDaysWrap.classList.add("hidden");

  if (sub) {
    els.modalTitle.textContent = "Redigera prenumeration";
    els.fieldId.value = sub.id;
    els.fieldName.value = sub.name;
    els.fieldCost.value = sub.cost;
    els.fieldCycle.value = sub.billing_cycle;
    els.fieldCustomDays.value = sub.custom_days || "";
    els.fieldDate.value = sub.next_payment_date;
    els.fieldCategory.value = sub.category || "";
    els.fieldNotes.value = sub.notes || "";
    els.fieldInclude.checked = sub.include_in_totals !== false;
    els.customDaysWrap.classList.toggle("hidden", sub.billing_cycle !== "custom");
    updateDateFieldForCycle(sub.billing_cycle, { autofill: false });
  } else {
    els.modalTitle.textContent = "Lägg till prenumeration";
    els.fieldId.value = "";
    els.fieldDate.value = new Date().toISOString().slice(0, 10);
    els.fieldInclude.checked = true;
    updateDateFieldForCycle(els.fieldCycle.value);
  }
  els.modalBackdrop.classList.remove("hidden");
  els.fieldName.focus();
}

function closeModal() {
  els.modalBackdrop.classList.add("hidden");
}

function positionNotesPopover(row) {
  els.notesPopover.classList.remove("hidden");
  const rowRect = row.getBoundingClientRect();
  const popRect = els.notesPopover.getBoundingClientRect();
  const maxLeft = document.documentElement.clientWidth - popRect.width - 8;
  const left = Math.min(Math.max(rowRect.left, 8), Math.max(maxLeft, 8));
  const top = Math.max(rowRect.top - popRect.height - 10, 8);
  els.notesPopover.style.left = `${left}px`;
  els.notesPopover.style.top = `${top}px`;
}

function openNotesPopover(sub, row) {
  openNotesRowId = sub.id;
  els.notesPopover.textContent = sub.notes;
  positionNotesPopover(row);
}

function closeNotesPopover() {
  els.notesPopover.classList.add("hidden");
  openNotesRowId = null;
}

els.addBtn.addEventListener("click", () => openModal());
els.cancelBtn.addEventListener("click", closeModal);
els.modalBackdrop.addEventListener("click", (e) => {
  if (e.target === els.modalBackdrop) closeModal();
});
document.addEventListener("click", (e) => {
  if (els.notesPopover.classList.contains("hidden")) return;
  if (els.notesPopover.contains(e.target)) return;
  if (e.target.closest("tr.has-notes")) return; // handled by the row click below
  closeNotesPopover();
});
window.addEventListener("scroll", closeNotesPopover);
els.fieldCycle.addEventListener("change", () => {
  els.customDaysWrap.classList.toggle("hidden", els.fieldCycle.value !== "custom");
  updateDateFieldForCycle(els.fieldCycle.value);
});

document.querySelectorAll("th[data-sort]").forEach((th) => {
  th.addEventListener("click", () => setSort(th.getAttribute("data-sort")));
});
els.sortSelect.addEventListener("change", () => {
  sortKey = els.sortSelect.value;
  sortDir = "asc";
  updateSortArrows();
  renderTable();
});

els.form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    name: els.fieldName.value.trim(),
    cost: parseFloat(els.fieldCost.value),
    billing_cycle: els.fieldCycle.value,
    next_payment_date: els.fieldDate.value,
    category: els.fieldCategory.value.trim(),
    notes: els.fieldNotes.value.trim(),
    include_in_totals: els.fieldInclude.checked,
  };
  if (payload.billing_cycle === "custom") {
    payload.custom_days = parseInt(els.fieldCustomDays.value, 10);
  }

  const id = els.fieldId.value;
  try {
    if (id) {
      await api(`/subscriptions/${id}`, { method: "PUT", body: JSON.stringify(payload) });
    } else {
      await api("/subscriptions", { method: "POST", body: JSON.stringify(payload) });
    }
    closeModal();
    await refreshAll();
  } catch (err) {
    alert(err.message);
  }
});

els.subsTbody.addEventListener("click", async (e) => {
  const editId = e.target.getAttribute("data-edit");
  const deleteId = e.target.getAttribute("data-delete");

  if (editId) {
    const sub = allSubs.find((s) => String(s.id) === editId);
    if (sub) openModal(sub);
    return;
  }

  if (deleteId) {
    if (!confirm("Ta bort denna prenumeration?")) return;
    try {
      await api(`/subscriptions/${deleteId}`, { method: "DELETE" });
      await refreshAll();
    } catch (err) {
      alert(err.message);
    }
    return;
  }

  if (e.target.closest("button") || e.target.closest("input")) return;
  const row = e.target.closest("tr[data-row-id]");
  if (!row) return;
  const sub = allSubs.find((s) => String(s.id) === row.getAttribute("data-row-id"));
  if (!sub || !sub.notes) {
    closeNotesPopover();
    return;
  }
  if (openNotesRowId === sub.id) {
    closeNotesPopover();
  } else {
    openNotesPopover(sub, row);
  }
});

els.subsTbody.addEventListener("change", async (e) => {
  const id = e.target.getAttribute("data-include-toggle");
  if (!id) return;
  try {
    await api(`/subscriptions/${id}`, {
      method: "PUT",
      body: JSON.stringify({ include_in_totals: e.target.checked }),
    });
    await refreshAll();
  } catch (err) {
    alert(err.message);
    e.target.checked = !e.target.checked;
  }
});

refreshAll().catch((err) => {
  console.error(err);
  els.subsTbody.innerHTML = `<tr><td colspan="7" class="empty-state">Kunde inte läsas in: ${escapeHtml(err.message)}</td></tr>`;
});
