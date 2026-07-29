"use client";

import { useEffect, useMemo, useState } from "react";

type WorkStatus = "ready" | "running" | "paused" | "done";
type DayKey = "yesterday" | "today" | "tomorrow";

type Task = {
  id: number | string;
  url?: string;
  title: string;
  epic: string;
  estimate: number;
  plannedHours?: number | null;
  status: WorkStatus;
  day?: DayKey;
  workDate?: string | null;
  slot?: string;
  nextAction?: string;
  accent: "blue" | "violet" | "amber" | "mint";
};

type ActiveSession = {
  taskId: string;
  workblockId?: string;
  startedAt: string;
};

type SaveState = "idle" | "saving" | "saved" | "error";

const initialTasks: Task[] = [
  {
    id: 1,
    title: "Database-schema refactor",
    epic: "Datafetcher refactor",
    estimate: 4,
    status: "running",
    day: "today",
    slot: "09:00",
    accent: "blue",
  },
  {
    id: 2,
    title: "Datafetcher service opschonen",
    epic: "Datafetcher refactor",
    estimate: 3,
    status: "ready",
    day: "today",
    slot: "14:00",
    accent: "blue",
  },
  {
    id: 3,
    title: "Migratiescenario uitschrijven",
    epic: "Datafetcher refactor",
    estimate: 2,
    status: "ready",
    accent: "violet",
  },
  {
    id: 4,
    title: "Control API requirements nalopen",
    epic: "Control API",
    estimate: 2,
    status: "ready",
    accent: "amber",
  },
  {
    id: 5,
    title: "Test met FlexMeasures prediction",
    epic: "Prepare for IChooser pilot",
    estimate: 4,
    status: "ready",
    accent: "mint",
  },
  {
    id: 6,
    title: "Bestaande fetch-flow documenteren",
    epic: "Datafetcher refactor",
    estimate: 2,
    status: "done",
    day: "yesterday",
    slot: "13:00",
    accent: "violet",
  },
];

const days: Array<{
  key: DayKey;
  label: string;
  date: string;
  total: string;
}> = [
  { key: "yesterday", label: "Gisteren", date: "Zo 26 jul", total: "2u gepland" },
  { key: "today", label: "Vandaag", date: "Ma 27 jul", total: "7u gepland" },
  { key: "tomorrow", label: "Morgen", date: "Di 28 jul", total: "0u gepland" },
];

const statusLabel: Record<WorkStatus, string> = {
  ready: "Klaar om te starten",
  running: "Bezig",
  paused: "Gepauzeerd",
  done: "Klaar",
};

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

function workDateFor(day: DayKey, slot: string) {
  const date = new Date();
  const dayOffset = day === "yesterday" ? -1 : day === "tomorrow" ? 1 : 0;
  date.setDate(date.getDate() + dayOffset);
  const [hours, minutes] = slot.split(":").map(Number);
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
}

function elapsedSince(startedAt: string) {
  return Math.max(
    0,
    Math.floor((Date.now() - Date.parse(startedAt)) / 1000),
  );
}

async function apiRequest<T>(url: string, init: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  const payload = (await response.json()) as T & {
    error?: string;
    detail?: string;
  };
  if (!response.ok) {
    throw new Error(payload.error ?? payload.detail ?? "Notion-fout");
  }
  return payload;
}

function Icon({
  children,
  size = "normal",
}: {
  children: React.ReactNode;
  size?: "normal" | "small";
}) {
  return <span className={`icon icon-${size}`}>{children}</span>;
}

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [selectedId, setSelectedId] = useState<number | string>(1);
  const [filter, setFilter] = useState("Actieve epic");
  const [notionState, setNotionState] = useState<
    "loading" | "demo" | "connected" | "error"
  >("loading");
  const [note, setNote] = useState(
    "Database-tabellen nalopen en bepalen welke velden vóór de migratie opgeschoond moeten worden.",
  );
  const [elapsedSeconds, setElapsedSeconds] = useState(6138);
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveMessage, setSaveMessage] = useState("");

  const selected = tasks.find((task) => task.id === selectedId) ?? tasks[0];
  const backlog = useMemo(
    () => tasks.filter((task) => !task.day && task.status !== "done"),
    [tasks],
  );

  useEffect(() => {
    let cancelled = false;
    let savedSession: ActiveSession | null = null;

    const savedTasks = window.localStorage.getItem("powerselect-planner-tasks");
    if (savedTasks) {
      try {
        const localTasks = JSON.parse(savedTasks) as Task[];
        queueMicrotask(() => {
          if (!cancelled) setTasks(localTasks);
        });
      } catch {
        window.localStorage.removeItem("powerselect-planner-tasks");
      }
    }

    const storedSession = window.localStorage.getItem(
      "powerselect-active-workblock",
    );
    if (storedSession) {
      try {
        savedSession = JSON.parse(storedSession) as ActiveSession;
        queueMicrotask(() => {
          if (!cancelled) setActiveSession(savedSession);
        });
      } catch {
        window.localStorage.removeItem("powerselect-active-workblock");
      }
    }

    fetch("/api/notion/tasks")
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Notion-fout");
        if (!payload.configured || payload.tasks.length === 0) {
          if (!cancelled) setNotionState("demo");
          return;
        }

        if (!cancelled) {
          const connectedTasks = (payload.tasks as Task[]).map((task) =>
            savedSession && String(task.id) === savedSession.taskId
              ? { ...task, status: "running" as const }
              : task,
          );
          const firstTask =
            connectedTasks.find(
              (task) => savedSession && String(task.id) === savedSession.taskId,
            ) ?? connectedTasks[0];
          setTasks(connectedTasks);
          setSelectedId(firstTask.id);
          setNote(firstTask.nextAction ?? "");
          setElapsedSeconds(
            savedSession && String(firstTask.id) === savedSession.taskId
              ? elapsedSince(savedSession.startedAt)
              : 0,
          );
          setNotionState("connected");
        }
      })
      .catch(() => {
        if (!cancelled) setNotionState("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (
      !activeSession ||
      String(selected.id) !== activeSession.taskId ||
      selected.status !== "running"
    ) {
      return;
    }

    const updateElapsed = () =>
      setElapsedSeconds(elapsedSince(activeSession.startedAt));
    updateElapsed();
    const interval = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(interval);
  }, [activeSession, selected.status, selected.id]);

  useEffect(() => {
    if (notionState === "demo" || notionState === "error") {
      window.localStorage.setItem(
        "powerselect-planner-tasks",
        JSON.stringify(tasks),
      );
    }
  }, [tasks, notionState]);

  function rememberSession(session: ActiveSession | null) {
    setActiveSession(session);
    if (session) {
      window.localStorage.setItem(
        "powerselect-active-workblock",
        JSON.stringify(session),
      );
    } else {
      window.localStorage.removeItem("powerselect-active-workblock");
    }
  }

  function setFeedback(state: SaveState, message: string) {
    setSaveState(state);
    setSaveMessage(message);
  }

  function selectTask(task: Task) {
    setSelectedId(task.id);
    setNote(task.nextAction ?? "");
    setElapsedSeconds(
      activeSession && String(task.id) === activeSession.taskId
        ? elapsedSince(activeSession.startedAt)
        : 0,
    );
  }

  async function moveTask(id: number | string, day: DayKey) {
    const target = tasks.find((task) => String(task.id) === String(id));
    if (!target) return;
    const previous = {
      day: target.day,
      slot: target.slot,
      workDate: target.workDate,
    };
    const slot = day === "today" ? "16:00" : "10:00";
    const workDate = workDateFor(day, slot);

    setTasks((current) =>
      current.map((task) =>
        String(task.id) === String(id)
          ? { ...task, day, slot, workDate }
          : task,
      ),
    );
    selectTask(target);

    if (notionState !== "connected" || typeof target.id !== "string") return;

    setFeedback("saving", "Planning opslaan…");
    try {
      await apiRequest("/api/notion/tasks", {
        method: "PATCH",
        body: JSON.stringify({ pageId: target.id, workDate }),
      });
      setFeedback("saved", "Planning opgeslagen in Notion");
    } catch (error) {
      setTasks((current) =>
        current.map((task) =>
          String(task.id) === String(id) ? { ...task, ...previous } : task,
        ),
      );
      setFeedback(
        "error",
        error instanceof Error ? error.message : "Opslaan mislukt",
      );
    }
  }

  function setLocalStatus(taskId: number | string, status: WorkStatus) {
    setTasks((current) =>
      current.map((task) =>
        String(task.id) === String(taskId)
          ? { ...task, status }
          : task,
      ),
    );
  }

  async function pauseSession(session: ActiveSession) {
    const result = await apiRequest<{ workblockSaved?: boolean }>(
      "/api/notion/workblocks",
      {
      method: "POST",
      body: JSON.stringify({
        action: "pause",
        taskId: session.taskId,
        workblockId: session.workblockId,
        startedAt: session.startedAt,
      }),
      },
    );
    setLocalStatus(session.taskId, "paused");
    rememberSession(null);
    return result.workblockSaved === true;
  }

  async function startTask() {
    if (saveState === "saving" || selected.status === "running") return;

    if (notionState !== "connected" || typeof selected.id !== "string") {
      setLocalStatus(selected.id, "running");
      return;
    }

    setFeedback("saving", "Werkblok starten…");
    try {
      if (activeSession && activeSession.taskId !== String(selected.id)) {
        await pauseSession(activeSession);
      }

      const result = await apiRequest<{
        workblockId?: string;
        workblockSaved?: boolean;
        startedAt?: string;
      }>("/api/notion/workblocks", {
        method: "POST",
        body: JSON.stringify({
          action: "start",
          taskId: selected.id,
          taskTitle: selected.title,
          plannedHours: selected.plannedHours ?? selected.estimate,
          nextAction: note,
        }),
      });
      if (!result.startedAt) {
        throw new Error("Notion gaf geen starttijd terug");
      }

      setTasks((current) =>
        current.map((task) =>
          String(task.id) === String(selected.id)
            ? { ...task, status: "running" }
            : task.status === "running"
              ? { ...task, status: "paused" }
              : task,
        ),
      );
      rememberSession({
        taskId: String(selected.id),
        workblockId: result.workblockId,
        startedAt: result.startedAt,
      });
      setElapsedSeconds(0);
      setFeedback(
        result.workblockSaved ? "saved" : "error",
        result.workblockSaved
          ? "Gestart en opgeslagen in Notion"
          : "Ticket gestart · deel Werkblokken voor tijdregistratie",
      );
    } catch (error) {
      setFeedback(
        "error",
        error instanceof Error ? error.message : "Starten mislukt",
      );
    }
  }

  async function pauseTask() {
    if (saveState === "saving" || selected.status !== "running") return;

    if (notionState !== "connected" || typeof selected.id !== "string") {
      setLocalStatus(selected.id, "paused");
      return;
    }

    setFeedback("saving", "Werkblok pauzeren…");
    try {
      if (activeSession && activeSession.taskId === String(selected.id)) {
        const workblockSaved = await pauseSession(activeSession);
        setFeedback(
          workblockSaved ? "saved" : "error",
          workblockSaved
            ? "Pauze en gewerkte tijd opgeslagen"
            : "Pauze actief · tijd nog niet opgeslagen in Werkblokken",
        );
      } else {
        setLocalStatus(selected.id, "paused");
        setFeedback("saved", "Pauze actief");
      }
    } catch (error) {
      setFeedback(
        "error",
        error instanceof Error ? error.message : "Pauzeren mislukt",
      );
    }
  }

  async function finishTask() {
    if (saveState === "saving" || selected.status === "done") return;

    if (notionState !== "connected" || typeof selected.id !== "string") {
      setLocalStatus(selected.id, "done");
      return;
    }

    setFeedback("saving", "Taak afronden…");
    try {
      const session =
        activeSession?.taskId === String(selected.id) ? activeSession : null;
      const result = await apiRequest<{ workblockSaved?: boolean }>(
        "/api/notion/workblocks",
        {
        method: "POST",
        body: JSON.stringify({
          action: "done",
          taskId: selected.id,
          workblockId: session?.workblockId,
          startedAt: session?.startedAt,
        }),
        },
      );
      if (session) rememberSession(null);
      setLocalStatus(selected.id, "done");
      setFeedback(
        "saved",
        session && !result.workblockSaved
          ? "Taak afgerond · sessietijd niet opgeslagen"
          : "Taak afgerond in Notion",
      );
    } catch (error) {
      setFeedback(
        "error",
        error instanceof Error ? error.message : "Afronden mislukt",
      );
    }
  }

  async function saveNote(value = note) {
    if (notionState !== "connected" || typeof selected.id !== "string") {
      setTasks((current) =>
        current.map((task) =>
          task.id === selected.id ? { ...task, nextAction: value } : task,
        ),
      );
      return;
    }

    setFeedback("saving", "Notitie opslaan…");
    try {
      await apiRequest("/api/notion/tasks", {
        method: "PATCH",
        body: JSON.stringify({
          pageId: selected.id,
          nextAction: value,
        }),
      });
      setTasks((current) =>
        current.map((task) =>
          task.id === selected.id ? { ...task, nextAction: value } : task,
        ),
      );
      setFeedback("saved", "Volgende actie opgeslagen in Notion");
    } catch (error) {
      setFeedback(
        "error",
        error instanceof Error ? error.message : "Opslaan mislukt",
      );
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">P</div>
          <div>
            <strong>Powerselect</strong>
            <span>Werkplanner</span>
          </div>
        </div>

        <nav className="top-nav" aria-label="Hoofdnavigatie">
          <button className="nav-active">
            <Icon>▦</Icon> Mijn dag
          </button>
          <button>
            <Icon>⌁</Icon> Roadmap
          </button>
        </nav>

        <div className="top-actions">
          <button className="sync-button">
            <span className={`sync-dot ${notionState}`} />
            {notionState === "connected" &&
              "Notion gekoppeld · lezen en schrijven"}
            {notionState === "loading" && "Notion controleren…"}
            {notionState === "demo" && "Voorbeelddata"}
            {notionState === "error" && "Notion niet bereikbaar"}
          </button>
          <button className="avatar" aria-label="Profiel">
            NP
          </button>
        </div>
      </header>

      <section className="page-heading">
        <div>
          <p className="eyebrow">MAANDAG 27 JULI</p>
          <h1>Goedemiddag, Nino</h1>
          <p className="subheading">
            Eén ding tegelijk. Je belangrijkste taak staat al klaar.
          </p>
        </div>
        <div className="capacity">
          <span>Weekcapaciteit</span>
          <strong>20 / 25 uur</strong>
          <div className="progress-track">
            <span />
          </div>
        </div>
      </section>

      <div className="workspace">
        <aside className="task-sidebar">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">TAKEN</p>
              <h2>In te plannen</h2>
            </div>
            <button className="small-add" aria-label="Taak toevoegen">
              +
            </button>
          </div>

          <div className="epic-select-wrap">
            <label htmlFor="epic-filter">Toon taken uit</label>
            <select
              id="epic-filter"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            >
              <option>Actieve epic</option>
              <option>Alle epics</option>
              <option>Datafetcher refactor</option>
            </select>
          </div>

          <div className="active-epic-card">
            <div className="epic-card-top">
              <span className="epic-icon">⌁</span>
              <span>ACTIEVE EPIC</span>
            </div>
            <strong>Datafetcher refactor</strong>
            <div className="epic-progress-row">
              <div className="progress-track dark">
                <span />
              </div>
              <span>10%</span>
            </div>
            <p>72 uur resterend · einde 19 aug</p>
          </div>

          <div className="task-list">
            {backlog.map((task) => (
              <article
                className="backlog-card"
                draggable
                key={task.id}
                onDragStart={(event) =>
                  event.dataTransfer.setData("text/plain", String(task.id))
                }
                onClick={() => selectTask(task)}
                data-selected={selected.id === task.id}
              >
                <span className={`task-accent ${task.accent}`} />
                <div className="task-copy">
                  <strong>{task.title}</strong>
                  <span>{task.epic}</span>
                  <div>
                    <span className="estimate">{task.estimate}u</span>
                    <span className="drag-hint">⋮⋮</span>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <p className="drag-copy">
            <Icon size="small">↗</Icon> Sleep een taak naar je agenda
          </p>
        </aside>

        <section className="calendar-panel">
          <div className="calendar-toolbar">
            <div className="date-controls">
              <button aria-label="Vorige periode">‹</button>
              <button className="today-button">Vandaag</button>
              <button aria-label="Volgende periode">›</button>
            </div>
            <div className="view-switch">
              <button className="view-active">3 dagen</button>
              <button>Week</button>
            </div>
          </div>

          <div className="days-grid">
            {days.map((day) => {
              const dayTasks = tasks.filter((task) => task.day === day.key);
              return (
                <section
                  className={`day-column ${day.key === "today" ? "is-today" : ""}`}
                  key={day.key}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) =>
                    moveTask(event.dataTransfer.getData("text/plain"), day.key)
                  }
                >
                  <header>
                    <div>
                      <span>{day.label}</span>
                      {day.key === "today" && <i>NU</i>}
                      <strong>{day.date}</strong>
                    </div>
                    <small>{day.total}</small>
                  </header>

                  <div className="day-body">
                    {dayTasks.map((task) => (
                      <article
                        key={task.id}
                        className={`calendar-task ${task.accent} ${task.status}`}
                        draggable
                        onDragStart={(event) =>
                          event.dataTransfer.setData("text/plain", String(task.id))
                        }
                        onClick={() => selectTask(task)}
                        data-selected={selected.id === task.id}
                      >
                        <span className="task-time">{task.slot}</span>
                        <strong>{task.title}</strong>
                        <span>{task.epic}</span>
                        <div className="calendar-task-footer">
                          <span>{task.estimate} uur</span>
                          <span className={`status-pill ${task.status}`}>
                            {task.status === "running" && "● "}
                            {task.status === "done" && "✓ "}
                            {statusLabel[task.status]}
                          </span>
                        </div>
                      </article>
                    ))}

                    {dayTasks.length === 0 && (
                      <div className="empty-dropzone">
                        <span>+</span>
                        <strong>Sleep hier een taak</strong>
                        <small>Maak ruimte voor morgen</small>
                      </div>
                    )}

                    {dayTasks.length > 0 && (
                      <button className="add-block">+ Blok toevoegen</button>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </section>

        <aside className="focus-panel">
          <div className="focus-heading">
            <p className="eyebrow">FOCUS</p>
            <span className={`live-status ${selected.status}`}>
              <i />
              {statusLabel[selected.status]}
            </span>
          </div>

          <div className="focus-title">
            <span className={`task-accent ${selected.accent}`} />
            <div>
              <h2>{selected.title}</h2>
              <p>{selected.epic}</p>
            </div>
          </div>

          <div className="timer-card">
            <span>TIJD AAN DEZE TAAK</span>
            <strong>{formatDuration(elapsedSeconds)}</strong>
            <small>van {selected.estimate}:00:00 gepland</small>
          </div>

          <div className="control-buttons">
            <button
              className="start"
              onClick={startTask}
              disabled={
                selected.status === "running" || saveState === "saving"
              }
            >
              ▶ Start
            </button>
            <button
              className="pause"
              onClick={pauseTask}
              disabled={
                selected.status !== "running" || saveState === "saving"
              }
            >
              Ⅱ Pauze
            </button>
            <button
              className="finish"
              onClick={finishTask}
              disabled={selected.status === "done" || saveState === "saving"}
            >
              ✓ Klaar
            </button>
          </div>

          <div className="note-area">
            <label htmlFor="next-action">Volgende actie</label>
            <textarea
              id="next-action"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
            <div className="note-meta">
              <span
                className={`save-feedback ${saveState}`}
                role={saveState === "error" ? "alert" : "status"}
              >
                {saveMessage || "Wijzigingen worden opgeslagen in Notion"}
              </span>
              <div>
                {selected.url && (
                  <a href={selected.url} target="_blank" rel="noreferrer">
                    Open in Notion
                  </a>
                )}
                <button
                  className="save-note"
                  onClick={() => saveNote()}
                  disabled={saveState === "saving"}
                >
                  Opslaan
                </button>
                <button
                  onClick={() => {
                    setNote("");
                    void saveNote("");
                  }}
                  disabled={saveState === "saving"}
                >
                  Wissen
                </button>
              </div>
            </div>
          </div>

          <div className="today-summary">
            <div>
              <span>Vandaag gewerkt</span>
              <strong>3u 12m</strong>
            </div>
            <div>
              <span>Focus score</span>
              <strong>84%</strong>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
