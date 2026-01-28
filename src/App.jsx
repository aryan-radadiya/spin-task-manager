// App.jsx (single-file React solution)
// No external libraries. Uses localStorage for persistence.

import React, { useEffect, useMemo, useState } from "react";

const LS_KEY = "spin_tasks_v1";

const REQUESTED_BY_OPTIONS = ["Manager A", "Manager B", "Manager C"];
const ASSIGNED_TO_OPTIONS = ["Resource A", "Resource B", "Resource C", "Resource D"];
const STATUS_OPTIONS = ["Not Started", "In Progress", "Blocked", "Done"];
const PROJECT_OPTIONS = ["Project Alpha", "Project Beta", "Project Gamma"];

const emptyTask = () => ({
  id: crypto?.randomUUID?.() ?? String(Date.now()),
  taskName: "",
  description: "",
  startDate: "",
  endDate: "",
  requestedBy: REQUESTED_BY_OPTIONS[0],
  assignedTo: ASSIGNED_TO_OPTIONS[0],
  status: STATUS_OPTIONS[0],
  project: PROJECT_OPTIONS[0],
  workloads: [],
});

const pad2 = (n) => String(n).padStart(2, "0");
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

const isValidISODate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s).getTime());
const cmpDate = (a, b) => new Date(a).getTime() - new Date(b).getTime();

function loadTasks() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function saveTasks(tasks) {
  localStorage.setItem(LS_KEY, JSON.stringify(tasks));
}

function normalizeWorkloads(workloads) {
  return (workloads || []).map((w) => ({
    id: w.id ?? (crypto?.randomUUID?.() ?? String(Date.now() + Math.random())),
    startDate: w.startDate ?? "",
    endDate: w.endDate ?? "",
  }));
}

function validateTask(task) {
  const errors = {};

  if (!task.taskName.trim()) errors.taskName = "Task Name is required.";
  if (!task.description.trim()) errors.description = "Description is required.";

  if (!task.startDate || !isValidISODate(task.startDate)) errors.startDate = "Valid Start Date is required.";
  if (!task.endDate || !isValidISODate(task.endDate)) errors.endDate = "Valid End Date is required.";

  if (task.startDate && task.endDate && isValidISODate(task.startDate) && isValidISODate(task.endDate)) {
    if (cmpDate(task.startDate, task.endDate) > 0) errors.dateRange = "Task Start Date must be <= End Date.";
  }

  if (!task.requestedBy) errors.requestedBy = "Requested By is required.";
  if (!task.assignedTo) errors.assignedTo = "Assigned To is required.";
  if (!task.status) errors.status = "Status is required.";
  if (!task.project) errors.project = "Project is required.";

  const wErrors = [];
  const workloads = normalizeWorkloads(task.workloads);

  for (let i = 0; i < workloads.length; i++) {
    const w = workloads[i];
    const we = {};
    if (!w.startDate || !isValidISODate(w.startDate)) we.startDate = "Valid Start Date required.";
    if (!w.endDate || !isValidISODate(w.endDate)) we.endDate = "Valid End Date required.";

    if (w.startDate && w.endDate && isValidISODate(w.startDate) && isValidISODate(w.endDate)) {
      if (cmpDate(w.startDate, w.endDate) > 0) we.range = "Workload Start Date must be <= End Date.";

      if (task.startDate && isValidISODate(task.startDate) && cmpDate(w.startDate, task.startDate) < 0) {
        we.within = "Workload must be within Task date range.";
      }
      if (task.endDate && isValidISODate(task.endDate) && cmpDate(w.endDate, task.endDate) > 0) {
        we.within = "Workload must be within Task date range.";
      }
    }

    wErrors.push(we);
  }

  // Optional: prevent overlaps for same task (helps PM understand occupancy)
  const intervals = workloads
    .filter((w) => isValidISODate(w.startDate) && isValidISODate(w.endDate) && cmpDate(w.startDate, w.endDate) <= 0)
    .map((w) => ({ id: w.id, s: new Date(w.startDate).getTime(), e: new Date(w.endDate).getTime() }))
    .sort((a, b) => a.s - b.s);

  for (let i = 1; i < intervals.length; i++) {
    const prev = intervals[i - 1];
    const cur = intervals[i];
    if (cur.s <= prev.e) {
      const idxCur = workloads.findIndex((w) => w.id === cur.id);
      const idxPrev = workloads.findIndex((w) => w.id === prev.id);
      if (idxCur >= 0) (wErrors[idxCur] ||= {}).overlap = "Overlaps another workload.";
      if (idxPrev >= 0) (wErrors[idxPrev] ||= {}).overlap = "Overlaps another workload.";
    }
  }

  if (wErrors.some((x) => Object.keys(x).length > 0)) errors.workloads = wErrors;

  return errors;
}

function Modal({ open, title, onClose, children }) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div style={styles.backdrop} onMouseDown={onClose}>
      <div style={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{title}</div>
          <button style={styles.iconBtn} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div style={styles.modalBody}>{children}</div>
      </div>
    </div>
  );
}

function Field({ label, error, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={styles.labelRow}>
        <label style={styles.label}>{label}</label>
        {error ? <span style={styles.errorText}>{error}</span> : null}
      </div>
      {children}
    </div>
  );
}

function TaskForm({ mode, initialTask, onCancel, onSave, onDelete }) {
  const [task, setTask] = useState(() => ({
    ...emptyTask(),
    ...initialTask,
    workloads: normalizeWorkloads(initialTask?.workloads),
  }));

  const [errors, setErrors] = useState({});

  useEffect(() => {
    setTask({
      ...emptyTask(),
      ...initialTask,
      workloads: normalizeWorkloads(initialTask?.workloads),
    });
    setErrors({});
  }, [initialTask]);

  const set = (patch) => setTask((t) => ({ ...t, ...patch }));

  const addWorkload = () => {
    const s = task.startDate && isValidISODate(task.startDate) ? task.startDate : todayISO();
    setTask((t) => ({
      ...t,
      workloads: [
        ...normalizeWorkloads(t.workloads),
        { id: crypto?.randomUUID?.() ?? String(Date.now() + Math.random()), startDate: s, endDate: s },
      ],
    }));
  };

  const updateWorkload = (id, patch) => {
    setTask((t) => ({
      ...t,
      workloads: normalizeWorkloads(t.workloads).map((w) => (w.id === id ? { ...w, ...patch } : w)),
    }));
  };

  const removeWorkload = (id) => {
    setTask((t) => ({
      ...t,
      workloads: normalizeWorkloads(t.workloads).filter((w) => w.id !== id),
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const v = validateTask(task);
    setErrors(v);
    if (Object.keys(v).length === 0) {
      onSave({
        ...task,
        workloads: normalizeWorkloads(task.workloads).map(({ id, startDate, endDate }) => ({ id, startDate, endDate })),
      });
    }
  };

  const wErrors = Array.isArray(errors.workloads) ? errors.workloads : [];

  return (
    <form onSubmit={handleSubmit}>
      <div style={styles.grid2}>
        <Field label="Task Name" error={errors.taskName}>
          <input style={styles.input} value={task.taskName} onChange={(e) => set({ taskName: e.target.value })} />
        </Field>

        <Field label="Project" error={errors.project}>
          <select style={styles.input} value={task.project} onChange={(e) => set({ project: e.target.value })}>
            {PROJECT_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Description" error={errors.description}>
        <textarea
          style={{ ...styles.input, minHeight: 80, resize: "vertical" }}
          value={task.description}
          onChange={(e) => set({ description: e.target.value })}
        />
      </Field>

      {errors.dateRange ? <div style={styles.bannerError}>{errors.dateRange}</div> : null}

      <div style={styles.grid2}>
        <Field label="Start Date" error={errors.startDate}>
          <input style={styles.input} type="date" value={task.startDate} onChange={(e) => set({ startDate: e.target.value })} />
        </Field>

        <Field label="End Date" error={errors.endDate}>
          <input style={styles.input} type="date" value={task.endDate} onChange={(e) => set({ endDate: e.target.value })} />
        </Field>
      </div>

      <div style={styles.grid2}>
        <Field label="Requested By" error={errors.requestedBy}>
          <select style={styles.input} value={task.requestedBy} onChange={(e) => set({ requestedBy: e.target.value })}>
            {REQUESTED_BY_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Assigned To" error={errors.assignedTo}>
          <select style={styles.input} value={task.assignedTo} onChange={(e) => set({ assignedTo: e.target.value })}>
            {ASSIGNED_TO_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div style={styles.grid2}>
        <Field label="Status" error={errors.status}>
          <select style={styles.input} value={task.status} onChange={(e) => set({ status: e.target.value })}>
            {STATUS_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </Field>

        <div />
      </div>

      <div style={{ marginTop: 10, marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontWeight: 700 }}>Workloads</div>
        <button type="button" style={styles.btn} onClick={addWorkload}>
          + Add Workload
        </button>
      </div>

      {normalizeWorkloads(task.workloads).length === 0 ? (
        <div style={styles.muted}>No workloads added yet.</div>
      ) : (
        <div style={styles.workloadsWrap}>
          {normalizeWorkloads(task.workloads).map((w, idx) => {
            const e = wErrors[idx] || {};
            const anyErr = Object.keys(e).length > 0;
            return (
              <div key={w.id} style={{ ...styles.workloadRow, ...(anyErr ? styles.workloadRowError : null) }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 10, alignItems: "end" }}>
                  <Field label={`Workload Start Date`} error={e.startDate || e.range || e.within || e.overlap}>
                    <input
                      style={styles.input}
                      type="date"
                      value={w.startDate}
                      onChange={(ev) => updateWorkload(w.id, { startDate: ev.target.value })}
                    />
                  </Field>

                  <Field label={`Workload End Date`} error={e.endDate}>
                    <input
                      style={styles.input}
                      type="date"
                      value={w.endDate}
                      onChange={(ev) => updateWorkload(w.id, { endDate: ev.target.value })}
                    />
                  </Field>

                  <button type="button" style={styles.dangerBtn} onClick={() => removeWorkload(w.id)}>
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={styles.footerBar}>
        {mode === "edit" ? (
          <button type="button" style={styles.dangerBtn} onClick={onDelete}>
            Delete Task
          </button>
        ) : (
          <div />
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" style={styles.btnSecondary} onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" style={styles.btnPrimary}>
            {mode === "edit" ? "Save Changes" : "Create Task"}
          </button>
        </div>
      </div>
    </form>
  );
}

function TaskTable({ tasks, onDoubleClick }) {
  return (
    <div style={styles.tableWrap}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Task</th>
            <th style={styles.th}>Project</th>
            <th style={styles.th}>Assigned To</th>
            <th style={styles.th}>Status</th>
            <th style={styles.th}>Task Dates</th>
            <th style={styles.th}>Workloads</th>
          </tr>
        </thead>
        <tbody>
          {tasks.length === 0 ? (
            <tr>
              <td style={styles.td} colSpan={6}>
                <span style={styles.muted}>No tasks yet. Click “Create Task”.</span>
              </td>
            </tr>
          ) : (
            tasks.map((t) => (
              <tr key={t.id} style={styles.tr} onDoubleClick={() => onDoubleClick(t)}>
                <td style={styles.td}>
                  <div style={{ fontWeight: 700 }}>{t.taskName}</div>
                  <div style={styles.smallMuted}>{t.description}</div>
                </td>
                <td style={styles.td}>{t.project}</td>
                <td style={styles.td}>{t.assignedTo}</td>
                <td style={styles.td}>
                  <span style={styles.pill}>{t.status}</span>
                </td>
                <td style={styles.td}>
                  {t.startDate} → {t.endDate}
                </td>
                <td style={styles.td}>
                  {normalizeWorkloads(t.workloads).length === 0 ? (
                    <span style={styles.smallMuted}>—</span>
                  ) : (
                    <ul style={{ margin: 0, paddingLeft: 16 }}>
                      {normalizeWorkloads(t.workloads).map((w) => (
                        <li key={w.id} style={styles.smallMuted}>
                          {w.startDate} → {w.endDate}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <div style={styles.smallMuted}>Tip: Double-click a row to edit.</div>
    </div>
  );
}

export default function App() {
  const [tasks, setTasks] = useState(() => loadTasks());
  const [modalOpen, setModalOpen] = useState(false);
  const [mode, setMode] = useState("create"); // create | edit
  const [activeTask, setActiveTask] = useState(emptyTask());

  useEffect(() => {
    saveTasks(tasks);
  }, [tasks]);

  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const ad = a.startDate && isValidISODate(a.startDate) ? new Date(a.startDate).getTime() : 0;
      const bd = b.startDate && isValidISODate(b.startDate) ? new Date(b.startDate).getTime() : 0;
      return ad - bd;
    });
  }, [tasks]);

  const openCreate = () => {
    setMode("create");
    setActiveTask(emptyTask());
    setModalOpen(true);
  };

  const openEdit = (task) => {
    setMode("edit");
    setActiveTask({
      ...task,
      workloads: normalizeWorkloads(task.workloads),
    });
    setModalOpen(true);
  };

  const upsertTask = (t) => {
    setTasks((prev) => {
      const idx = prev.findIndex((x) => x.id === t.id);
      if (idx === -1) return [...prev, t];
      const next = [...prev];
      next[idx] = t;
      return next;
    });
    setModalOpen(false);
  };

  const deleteTask = () => {
    setTasks((prev) => prev.filter((x) => x.id !== activeTask.id));
    setModalOpen(false);
  };

  const clearAll = () => {
    if (!confirm("Clear all tasks?")) return;
    setTasks([]);
  };

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <div style={styles.h1}>Task Management System</div>
          <div style={styles.sub}>React-only • Local persistence • Workloads within a task</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button style={styles.btnSecondary} onClick={clearAll}>
            Clear All
          </button>
          <button style={styles.btnPrimary} onClick={openCreate}>
            Add Task
          </button>
        </div>
      </div>

      <TaskTable tasks={sortedTasks} onDoubleClick={openEdit} />

      <Modal
        open={modalOpen}
        title={mode === "edit" ? "Edit Task" : "Create Task"}
        onClose={() => setModalOpen(false)}
      >
        <TaskForm
          mode={mode}
          initialTask={activeTask}
          onCancel={() => setModalOpen(false)}
          onSave={upsertTask}
          onDelete={deleteTask}
        />
      </Modal>
    </div>
  );
}

const styles = {
  page: {
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji"',
    padding: 20,
    maxWidth: 1100,
    margin: "0 auto",
    color: "#111827",
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 16,
  },
  h1: { fontSize: 22, fontWeight: 800, marginBottom: 4 },
  sub: { fontSize: 13, color: "#6b7280" },
  tableWrap: { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 },
  table: { width: "100%", borderCollapse: "separate", borderSpacing: 0 },
  th: {
    textAlign: "left",
    fontSize: 12,
    color: "#374151",
    borderBottom: "1px solid #e5e7eb",
    padding: "10px 10px",
    background: "#fafafa",
  },
  td: { borderBottom: "1px solid #f3f4f6", padding: "10px 10px", verticalAlign: "top", fontSize: 13 },
  tr: { cursor: "pointer" },
  smallMuted: { fontSize: 12, color: "#6b7280" },
  muted: { fontSize: 13, color: "#6b7280", padding: "8px 0" },
  pill: {
    display: "inline-block",
    fontSize: 12,
    padding: "2px 10px",
    borderRadius: 999,
    border: "1px solid #e5e7eb",
    background: "#f9fafb",
  },
  btn: {
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    background: "#fff",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 13,
  },
  btnPrimary: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #111827",
    background: "#111827",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 13,
  },
  btnSecondary: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    background: "#fff",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 13,
  },
  dangerBtn: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #ef4444",
    background: "#fff",
    color: "#b91c1c",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 13,
    height: 42,
    alignSelf: "center",
  },
  iconBtn: {
    border: "1px solid #e5e7eb",
    background: "#fff",
    borderRadius: 10,
    cursor: "pointer",
    padding: "6px 10px",
    fontWeight: 900,
  },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  input: {
    width: "100%",
    padding: "10px 10px",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    outline: "none",
    fontSize: 13,
    background: "#fff",
  },
  labelRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  label: { fontSize: 12, fontWeight: 800, color: "#374151" },
  errorText: { fontSize: 12, color: "#b91c1c", fontWeight: 700 },
  bannerError: {
    margin: "6px 0 10px",
    padding: "10px 12px",
    background: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: 10,
    color: "#991b1b",
    fontSize: 13,
    fontWeight: 700,
  },
  workloadsWrap: { display: "grid", gap: 10 },
  workloadRow: {
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: 12,
    background: "#fff",
  },
  workloadRowError: {
    border: "1px solid #fecaca",
    background: "#fff7f7",
  },
  footerBar: {
    marginTop: 14,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    paddingTop: 12,
    borderTop: "1px solid #f3f4f6",
  },
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(17, 24, 39, 0.35)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
    zIndex: 50,
  },
  modal: {
    width: "min(900px, 100%)",
    maxHeight: "90vh",
    overflow: "auto",
    background: "#fff",
    borderRadius: 14,
    border: "1px solid #e5e7eb",
    boxShadow: "0 25px 60px rgba(0,0,0,0.25)",
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 14px",
    borderBottom: "1px solid #f3f4f6",
    background: "#fafafa",
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  modalBody: { padding: 14 },
};