const API = "/api";

const els = {
  summaryCount: document.getElementById("summary-count"),
  summaryMonthly: document.getElementById("summary-monthly"),
  summaryAnnual: document.getElementById("summary-annual"),
  upcomingList: document.getElementById("upcoming-list"),
  categoryBreakdown: document.getElementById("category-breakdown"),
  subsTbody: document.getElementById("subs-tbody"),
  addBtn: document.getElementById("add-btn"),
  modalBackdrop: document.getElementById("modal-backdrop"),
  modalTitle: document.getElementById("modal-title"),
  form: document.getElementById("sub-form"),
  cancelBtn: document.getElementById("cancel-btn"),
  fieldId: document.getElementById("sub-id"),
  fieldName: document.getElementById("field-name"),
  fieldCost: document.getElementById("field-cost"),
  fieldCurrency: document.getElementById("field-currency"),
  fieldCycle: document.getElementById("field-cycle"),
  customDaysWrap: document.getElementById("custom-days-wrap"),
  fieldCustomDays: document.getElementById("field-custom-days"),
  fieldDate: document.getElementById("field-date"),
  fieldCategory: document.getElementById("field-category"),
  fieldNotes: document.getElementById("field-notes"),
};

function fmtMoney(amount, currency) {
  const sign = currency && currency.length <= 3 ? currency : (currency || "$");
  return `${sign}${Number(amount).toFixed(2)}`;
}

function fmtDate(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function cycleLabel(sub) {
  switch (sub.billing_cycle) {
    case "weekly": return "Weekly";
    case "monthly": return `Monthly (day ${new Date(sub.next_payment_date + "T00:00:00").getDate()})`;
    case "quarterly": return "Quarterly";
    case "yearly": return "Yearly";
    case "custom": return `Every ${sub.custom_days} days`;
    default: return sub.billing_cycle;
  }
}

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
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
    api("/upcoming?days=7"),
    api("/summary"),
  ]);
  renderSummary(summary);
  renderUpcoming(upcoming);
  renderCategoryBreakdown(summary);
  renderTable(subs);
}

function renderSummary(summary) {
  els.summaryCount.textContent = summary.subscription_count;
  els.summaryMonthly.textContent = `$${summary.total_monthly.toFixed(2)}`;
  els.summaryAnnual.textContent = `$${summary.total_annual.toFixed(2)}`;
}

function renderUpcoming(items) {
  if (!items.length) {
    els.upcomingList.innerHTML = `<p class="empty-state">Nothing due in the next 7 days.</p>`;
    return;
  }
  els.upcomingList.innerHTML = items
    .map((s) => {
      const when = s.days_until === 0 ? "Today" : s.days_until === 1 ? "Tomorrow" : `In ${s.days_until} days`;
      return `
        <div class="upcoming-item">
          <span class="name">${escapeHtml(s.name)} — ${fmtMoney(s.cost, s.currency)}</span>
          <span class="when">${when} · ${fmtDate(s.next_payment_date)}</span>
        </div>`;
    })
    .join("");
}

function renderCategoryBreakdown(summary) {
  const entries = Object.entries(summary.by_category || {});
  if (!entries.length) {
    els.categoryBreakdown.innerHTML = `<p class="empty-state">No subscriptions yet.</p>`;
    return;
  }
  els.categoryBreakdown.innerHTML = entries
    .map(
      ([cat, v]) => `
      <div class="category-row">
        <span>${escapeHtml(cat)} <span class="muted">(${v.count})</span></span>
        <span>$${v.monthly.toFixed(2)}/mo · $${v.annual.toFixed(2)}/yr</span>
      </div>`
    )
    .join("");
}

function renderTable(subs) {
  if (!subs.length) {
    els.subsTbody.innerHTML = `<tr><td colspan="6" class="empty-state">No subscriptions yet — add your first one above.</td></tr>`;
    return;
  }
  els.subsTbody.innerHTML = subs
    .map(
      (s) => `
      <tr>
        <td>${escapeHtml(s.name)}</td>
        <td>${fmtMoney(s.cost, s.currency)}</td>
        <td>${cycleLabel(s)}</td>
        <td>${fmtDate(s.next_payment_date)}</td>
        <td>${escapeHtml(s.category || "—")}</td>
        <td class="row-actions">
          <button class="btn btn-secondary btn-small" data-edit="${s.id}">Edit</button>
          <button class="btn btn-danger btn-small" data-delete="${s.id}">Delete</button>
        </td>
      </tr>`
    )
    .join("");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function openModal(sub = null) {
  els.form.reset();
  els.fieldCurrency.value = "$";
  els.fieldCycle.value = "monthly";
  els.customDaysWrap.classList.add("hidden");

  if (sub) {
    els.modalTitle.textContent = "Edit subscription";
    els.fieldId.value = sub.id;
    els.fieldName.value = sub.name;
    els.fieldCost.value = sub.cost;
    els.fieldCurrency.value = sub.currency;
    els.fieldCycle.value = sub.billing_cycle;
    els.fieldCustomDays.value = sub.custom_days || "";
    els.fieldDate.value = sub.next_payment_date;
    els.fieldCategory.value = sub.category || "";
    els.fieldNotes.value = sub.notes || "";
    els.customDaysWrap.classList.toggle("hidden", sub.billing_cycle !== "custom");
  } else {
    els.modalTitle.textContent = "Add subscription";
    els.fieldId.value = "";
    els.fieldDate.value = new Date().toISOString().slice(0, 10);
  }
  els.modalBackdrop.classList.remove("hidden");
  els.fieldName.focus();
}

function closeModal() {
  els.modalBackdrop.classList.add("hidden");
}

els.addBtn.addEventListener("click", () => openModal());
els.cancelBtn.addEventListener("click", closeModal);
els.modalBackdrop.addEventListener("click", (e) => {
  if (e.target === els.modalBackdrop) closeModal();
});
els.fieldCycle.addEventListener("change", () => {
  els.customDaysWrap.classList.toggle("hidden", els.fieldCycle.value !== "custom");
});

els.form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    name: els.fieldName.value.trim(),
    cost: parseFloat(els.fieldCost.value),
    currency: els.fieldCurrency.value.trim() || "$",
    billing_cycle: els.fieldCycle.value,
    next_payment_date: els.fieldDate.value,
    category: els.fieldCategory.value.trim(),
    notes: els.fieldNotes.value.trim(),
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
    const subs = await api("/subscriptions");
    const sub = subs.find((s) => String(s.id) === editId);
    if (sub) openModal(sub);
  }

  if (deleteId) {
    if (!confirm("Delete this subscription?")) return;
    try {
      await api(`/subscriptions/${deleteId}`, { method: "DELETE" });
      await refreshAll();
    } catch (err) {
      alert(err.message);
    }
  }
});

refreshAll().catch((err) => {
  console.error(err);
  els.subsTbody.innerHTML = `<tr><td colspan="6" class="empty-state">Failed to load: ${escapeHtml(err.message)}</td></tr>`;
});
