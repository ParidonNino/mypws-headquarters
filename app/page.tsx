"use client";

import { useEffect, useMemo, useState } from "react";

type WorkStatus = "ready" | "running" | "paused" | "done";
type DayKey = "yesterday" | "today" | "tomorrow";
type PageView = "day" | "roadmap" | "week";

type Task = {
  id: number | string;
  url?: string;
  title: string;
  epic: string;
  estimate: number;
  plannedHours?: number | null;
  loggedSeconds?: number;
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

type Epic = {
  id: string;
  url?: string;
  title: string;
  status: string;
  priority: string;
  plannedStart?: string | null;
  plannedEnd?: string | null;
  progress: number;
  estimate: number;
  nextAction?: string;
};

type WeeklyGoal = {
  id: string;
  text: string;
  done: boolean;
};

type WeeklyPlan = {
  goals: WeeklyGoal[];
  reflection: string;
  carryForward: string;
};

type TicketDraft = {
  title: string;
  taskType: "Feature" | "Subtask";
  priority: "Critical" | "High" | "Medium" | "Low";
  estimate: string;
  nextAction: string;
  parentEpicId: string;
  schedule: "none" | "today" | "tomorrow";
};

type SaveState = "idle" | "saving" | "saved" | "error";

const emptyWeeklyPlan = (): WeeklyPlan => ({
  goals: [
    { id: crypto.randomUUID(), text: "", done: false },
    { id: crypto.randomUUID(), text: "", done: false },
    { id: crypto.randomUUID(), text: "", done: false },
  ],
  reflection: "",
  carryForward: "",
});

const emptyTicketDraft = (): TicketDraft => ({
  title: "",
  taskType: "Subtask",
  priority: "Medium",
  estimate: "2",
  nextAction: "",
  parentEpicId: "",
  schedule: "none",
});

const ROADMAP_FALLBACK_TIME = Date.now();

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

function weekDetails(offset: number) {
  const now = new Date();
  const monday = new Date(now);
  const day = monday.getDay() || 7;
  monday.setDate(monday.getDate() - day + 1 + offset * 7);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);

  const thursday = new Date(monday);
  thursday.setDate(thursday.getDate() + 3);
  const yearStart = new Date(thursday.getFullYear(), 0, 1);
  const week = Math.ceil(
    ((thursday.getTime() - yearStart.getTime()) / 86_400_000 +
      yearStart.getDay() +
      1) /
      7,
  );
  const format = new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "short",
  });

  return {
    key: `${thursday.getFullYear()}-W${String(week).padStart(2, "0")}`,
    label: `Week ${week}`,
    range: `${format.format(monday)} – ${format.format(sunday)}`,
  };
}

function shortDate(value?: string | null) {
  if (!value) return "Nog niet gepland";
  return new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "short",
  }).format(new Date(`${value.slice(0, 10)}T12:00:00`));
}

function parseStoredSession(value: string): ActiveSession | null {
  const parsed = JSON.parse(value) as Partial<ActiveSession> & {
    workblockId?: unknown;
  };
  if (
    typeof parsed.taskId !== "string" ||
    typeof parsed.startedAt !== "string" ||
    Number.isNaN(Date.parse(parsed.startedAt))
  ) {
    return null;
  }

  return {
    taskId: parsed.taskId,
    startedAt: parsed.startedAt,
    ...(typeof parsed.workblockId === "string" && parsed.workblockId
      ? { workblockId: parsed.workblockId }
      : {}),
  };
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
  const [epics, setEpics] = useState<Epic[]>([]);
  const [activePage, setActivePage] = useState<PageView>("day");
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
  const [weekOffset, setWeekOffset] = useState(0);
  const [weeklyPlan, setWeeklyPlan] = useState<WeeklyPlan>(emptyWeeklyPlan);
  const [ticketDraft, setTicketDraft] =
    useState<TicketDraft>(emptyTicketDraft);
  const [ticketFormOpen, setTicketFormOpen] = useState(false);
  const [ticketSaveState, setTicketSaveState] =
    useState<SaveState>("idle");
  const [ticketSaveMessage, setTicketSaveMessage] = useState("");

  const selected = tasks.find((task) => task.id === selectedId) ?? tasks[0];
  const activeEpic =
    epics.find((epic) => epic.status === "In Progress") ?? epics[0];
  const epicNames = useMemo(
    () => [...new Set(tasks.map((task) => task.epic))].sort(),
    [tasks],
  );
  const filteredTasks = useMemo(() => {
    if (filter === "Alle epics") return tasks;
    const epicName =
      filter === "Actieve epic" ? activeEpic?.title : filter;
    if (!epicName) return tasks;
    return tasks.filter((task) => task.epic === epicName);
  }, [activeEpic?.title, filter, tasks]);
  const backlog = useMemo(
    () =>
      filteredTasks.filter(
        (task) => !task.day && task.status !== "done",
      ),
    [filteredTasks],
  );
  const selectedWeek = useMemo(() => weekDetails(weekOffset), [weekOffset]);
  const roadmapRange = useMemo(() => {
    const dates = epics
      .flatMap((epic) => [epic.plannedStart, epic.plannedEnd])
      .filter((value): value is string => Boolean(value))
      .map((value) => new Date(`${value.slice(0, 10)}T12:00:00`).getTime());
    const today = ROADMAP_FALLBACK_TIME;
    const start = dates.length
      ? Math.min(...dates) - 7 * 86_400_000
      : today - 7 * 86_400_000;
    const end = dates.length
      ? Math.max(...dates) + 7 * 86_400_000
      : today + 84 * 86_400_000;
    return { start, end: Math.max(end, start + 28 * 86_400_000) };
  }, [epics]);
  const roadmapMonths = useMemo(() => {
    const months: Array<{ label: string; left: number }> = [];
    const cursor = new Date(roadmapRange.start);
    cursor.setDate(1);
    cursor.setHours(12, 0, 0, 0);
    while (cursor.getTime() <= roadmapRange.end) {
      months.push({
        label: new Intl.DateTimeFormat("nl-NL", {
          month: "short",
          year: "2-digit",
        }).format(cursor),
        left:
          ((cursor.getTime() - roadmapRange.start) /
            (roadmapRange.end - roadmapRange.start)) *
          100,
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return months;
  }, [roadmapRange]);

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
        savedSession = parseStoredSession(storedSession);
        if (savedSession) {
          queueMicrotask(() => {
            if (!cancelled) setActiveSession(savedSession);
          });
        } else {
          window.localStorage.removeItem("powerselect-active-workblock");
        }
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
          setEpics((payload.epics as Epic[] | undefined) ?? []);
          const firstTask =
            connectedTasks.find(
              (task) => savedSession && String(task.id) === savedSession.taskId,
            ) ?? connectedTasks[0];
          setTasks(connectedTasks);
          setSelectedId(firstTask.id);
          setNote(firstTask.nextAction ?? "");
          setElapsedSeconds(
            (firstTask.loggedSeconds ?? 0) +
              (savedSession && String(firstTask.id) === savedSession.taskId
                ? elapsedSince(savedSession.startedAt)
                : 0),
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
    const savedPlan = window.localStorage.getItem(
      `powerselect-week-${selectedWeek.key}`,
    );
    let nextPlan = emptyWeeklyPlan();
    if (savedPlan) {
      try {
        nextPlan = JSON.parse(savedPlan) as WeeklyPlan;
      } catch {
        window.localStorage.removeItem(
          `powerselect-week-${selectedWeek.key}`,
        );
      }
    }
    queueMicrotask(() => setWeeklyPlan(nextPlan));
  }, [selectedWeek.key]);

  useEffect(() => {
    if (
      !activeSession ||
      String(selected.id) !== activeSession.taskId ||
      selected.status !== "running"
    ) {
      return;
    }

    const updateElapsed = () =>
      setElapsedSeconds(
        (selected.loggedSeconds ?? 0) +
          elapsedSince(activeSession.startedAt),
      );
    updateElapsed();
    const interval = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(interval);
  }, [
    activeSession,
    selected.status,
    selected.id,
    selected.loggedSeconds,
  ]);

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
      (task.loggedSeconds ?? 0) +
        (activeSession && String(task.id) === activeSession.taskId
          ? elapsedSince(activeSession.startedAt)
          : 0),
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
    const sessionSeconds = elapsedSince(session.startedAt);
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
    setTasks((current) =>
      current.map((task) =>
        String(task.id) === session.taskId
          ? {
              ...task,
              status: "paused",
              loggedSeconds: (task.loggedSeconds ?? 0) + sessionSeconds,
            }
          : task,
      ),
    );
    if (String(selected.id) === session.taskId) {
      setElapsedSeconds(
        (selected.loggedSeconds ?? 0) + sessionSeconds,
      );
    }
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
        startedAt: result.startedAt,
        ...(typeof result.workblockId === "string" && result.workblockId
          ? { workblockId: result.workblockId }
          : {}),
      });
      setElapsedSeconds(selected.loggedSeconds ?? 0);
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
      if (session) {
        const sessionSeconds = elapsedSince(session.startedAt);
        rememberSession(null);
        setTasks((current) =>
          current.map((task) =>
            String(task.id) === String(selected.id)
              ? {
                  ...task,
                  status: "done",
                  loggedSeconds:
                    (task.loggedSeconds ?? 0) + sessionSeconds,
                }
              : task,
          ),
        );
        setElapsedSeconds(
          (selected.loggedSeconds ?? 0) + sessionSeconds,
        );
      } else {
        setLocalStatus(selected.id, "done");
      }
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

  function updateWeeklyPlan(
    updater: (current: WeeklyPlan) => WeeklyPlan,
  ) {
    setWeeklyPlan((current) => {
      const next = updater(current);
      window.localStorage.setItem(
        `powerselect-week-${selectedWeek.key}`,
        JSON.stringify(next),
      );
      return next;
    });
  }

  function openTicketForm(
    schedule: TicketDraft["schedule"] = "none",
  ) {
    setTicketDraft({
      ...emptyTicketDraft(),
      parentEpicId: activeEpic?.id ?? "",
      schedule,
    });
    setTicketSaveState("idle");
    setTicketSaveMessage("");
    setTicketFormOpen(true);
  }

  async function createTicket(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (notionState !== "connected") {
      setTicketSaveState("error");
      setTicketSaveMessage("Notion is nog niet verbonden");
      return;
    }

    const estimate = Number(ticketDraft.estimate);
    const parentEpic = epics.find(
      (epic) => epic.id === ticketDraft.parentEpicId,
    );
    const workDate =
      ticketDraft.schedule === "none"
        ? null
        : workDateFor(ticketDraft.schedule, "09:00");

    setTicketSaveState("saving");
    setTicketSaveMessage("Ticket aanmaken in Notion…");
    try {
      const result = await apiRequest<{ task: Task }>(
        "/api/notion/tasks",
        {
          method: "POST",
          body: JSON.stringify({
            title: ticketDraft.title,
            taskType: ticketDraft.taskType,
            priority: ticketDraft.priority,
            estimate,
            nextAction: ticketDraft.nextAction,
            parentEpicId: parentEpic?.id ?? null,
            epicTitle: parentEpic?.title,
            workDate,
          }),
        },
      );
      setTasks((current) => [result.task, ...current]);
      setSelectedId(result.task.id);
      setNote(result.task.nextAction ?? "");
      setFilter(
        parentEpic ? parentEpic.title : "Alle epics",
      );
      setTicketSaveState("saved");
      setTicketSaveMessage("Ticket aangemaakt in Notion");
      setTicketFormOpen(false);
    } catch (error) {
      setTicketSaveState("error");
      setTicketSaveMessage(
        error instanceof Error ? error.message : "Aanmaken mislukt",
      );
    }
  }

  function epicTimelineStyle(epic: Epic): React.CSSProperties {
    if (!epic.plannedStart) {
      return { left: "2%", width: "18%" };
    }
    const start = new Date(
      `${epic.plannedStart.slice(0, 10)}T12:00:00`,
    ).getTime();
    const end = epic.plannedEnd
      ? new Date(`${epic.plannedEnd.slice(0, 10)}T12:00:00`).getTime()
      : start + 7 * 86_400_000;
    const range = roadmapRange.end - roadmapRange.start;
    const left = Math.max(
      0,
      Math.min(100, ((start - roadmapRange.start) / range) * 100),
    );
    const width = Math.max(
      3,
      Math.min(100 - left, ((end - start) / range) * 100),
    );
    return { left: `${left}%`, width: `${width}%` };
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
          <button
            className={activePage === "day" ? "nav-active" : ""}
            onClick={() => setActivePage("day")}
          >
            <Icon>▦</Icon> Mijn dag
          </button>
          <button
            className={activePage === "roadmap" ? "nav-active" : ""}
            onClick={() => setActivePage("roadmap")}
          >
            <Icon>⌁</Icon> Roadmap
          </button>
          <button
            className={activePage === "week" ? "nav-active" : ""}
            onClick={() => setActivePage("week")}
          >
            <Icon>□</Icon> Mijn week
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

      {activePage === "day" && (
        <>
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
            <button
              className="small-add"
              aria-label="Taak toevoegen"
              onClick={() => openTicketForm()}
            >
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
              {epicNames.map((epicName) => (
                <option key={epicName}>{epicName}</option>
              ))}
            </select>
          </div>

          {activeEpic && <div className="active-epic-card">
            <div className="epic-card-top">
              <span className="epic-icon">⌁</span>
              <span>ACTIEVE EPIC</span>
            </div>
            <strong>{activeEpic.title}</strong>
            <div className="epic-progress-row">
              <div className="progress-track dark">
                <span
                  style={{
                    width: `${Math.round(activeEpic.progress * 100)}%`,
                  }}
                />
              </div>
              <span>{Math.round(activeEpic.progress * 100)}%</span>
            </div>
            <p>
              {activeEpic.estimate || "—"} uur geschat · einde{" "}
              {shortDate(activeEpic.plannedEnd)}
            </p>
          </div>}

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
              <button onClick={() => setActivePage("week")}>Week</button>
            </div>
          </div>

          <div className="days-grid">
            {days.map((day) => {
              const dayTasks = filteredTasks.filter(
                (task) => task.day === day.key,
              );
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

                    <button
                      className="add-block"
                      onClick={() =>
                        openTicketForm(
                          day.key === "tomorrow" ? "tomorrow" : "today",
                        )
                      }
                    >
                      + Nieuwe taak
                    </button>
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
        </>
      )}

      {activePage === "roadmap" && (
        <section className="standalone-page roadmap-page">
          <div className="standalone-heading">
            <div>
              <p className="eyebrow">POWERSELECT ROADMAP</p>
              <h1>Van prioriteit naar planning</h1>
              <p>
                De epics en geplande datums komen rechtstreeks uit Notion.
              </p>
            </div>
            <div className="heading-actions">
              <span>{epics.length} epics</span>
              <a
                href="https://app.notion.com/p/639312492ba24df3b3ee5943af5b34e1"
                target="_blank"
                rel="noreferrer"
              >
                Open Roadmap in Notion
              </a>
            </div>
          </div>

          <div className="roadmap-surface">
            <div className="timeline-header">
              <strong>Epic</strong>
              <div className="timeline-months">
                {roadmapMonths.map((month) => (
                  <span
                    key={`${month.label}-${month.left}`}
                    style={{ left: `${month.left}%` }}
                  >
                    {month.label}
                  </span>
                ))}
              </div>
            </div>

            <div className="timeline-body">
              {epics.map((epic) => (
                <div className="timeline-row" key={epic.id}>
                  <div className="timeline-label">
                    <div>
                      <span
                        className={`priority-dot ${epic.priority.toLowerCase()}`}
                      />
                      <strong>{epic.title}</strong>
                    </div>
                    <small>
                      {epic.status} · {Math.round(epic.progress * 100)}%
                    </small>
                  </div>
                  <div className="timeline-track">
                    <a
                      className={`timeline-bar status-${epic.status
                        .toLowerCase()
                        .replaceAll(" ", "-")}`}
                      href={epic.url}
                      target="_blank"
                      rel="noreferrer"
                      style={epicTimelineStyle(epic)}
                      title={`${epic.title}: ${shortDate(epic.plannedStart)} – ${shortDate(epic.plannedEnd)}`}
                    >
                      <span
                        style={{
                          width: `${Math.round(epic.progress * 100)}%`,
                        }}
                      />
                      <strong>{epic.title}</strong>
                    </a>
                  </div>
                </div>
              ))}

              {epics.length === 0 && (
                <div className="roadmap-empty">
                  De epics worden geladen uit Notion…
                </div>
              )}
            </div>
          </div>

          <div className="roadmap-cards">
            {epics.map((epic) => (
              <article key={epic.id}>
                <div>
                  <span
                    className={`priority-dot ${epic.priority.toLowerCase()}`}
                  />
                  <small>{epic.priority}</small>
                </div>
                <strong>{epic.title}</strong>
                <p>{epic.nextAction || "Nog geen volgende actie vastgelegd."}</p>
                <footer>
                  <span>
                    {shortDate(epic.plannedStart)} –{" "}
                    {shortDate(epic.plannedEnd)}
                  </span>
                  <a href={epic.url} target="_blank" rel="noreferrer">
                    Notion ↗
                  </a>
                </footer>
              </article>
            ))}
          </div>
        </section>
      )}

      {activePage === "week" && (
        <section className="standalone-page week-page">
          <div className="standalone-heading">
            <div>
              <p className="eyebrow">MIJN WEEK</p>
              <h1>{selectedWeek.label}</h1>
              <p>{selectedWeek.range} · bepaal je uitkomsten, reflecteer daarna</p>
            </div>
            <div className="week-controls">
              <button
                aria-label="Vorige week"
                onClick={() => setWeekOffset((current) => current - 1)}
              >
                ‹
              </button>
              <button onClick={() => setWeekOffset(0)}>Deze week</button>
              <button
                aria-label="Volgende week"
                onClick={() => setWeekOffset((current) => current + 1)}
              >
                ›
              </button>
            </div>
          </div>

          <div className="week-layout">
            <aside className="week-overview">
              <p className="eyebrow">WEEKOVERZICHT</p>
              <strong>
                {weeklyPlan.goals.filter((goal) => goal.done).length} van{" "}
                {weeklyPlan.goals.length} doelen afgerond
              </strong>
              <div className="week-progress">
                <span
                  style={{
                    width: `${
                      weeklyPlan.goals.length
                        ? (weeklyPlan.goals.filter((goal) => goal.done)
                            .length /
                            weeklyPlan.goals.length) *
                          100
                        : 0
                    }%`,
                  }}
                />
              </div>
              <p>
                Houd het bij maximaal drie belangrijke uitkomsten. Kleine
                taken plan je vanuit Mijn dag.
              </p>
              <small>Automatisch bewaard in deze planner</small>
            </aside>

            <div className="week-goals-panel">
              <div className="week-panel-heading">
                <div>
                  <p className="eyebrow">WEEKDOELEN</p>
                  <h2>Wat moet vrijdag af zijn?</h2>
                </div>
                <button
                  onClick={() =>
                    updateWeeklyPlan((current) => ({
                      ...current,
                      goals: [
                        ...current.goals,
                        {
                          id: crypto.randomUUID(),
                          text: "",
                          done: false,
                        },
                      ],
                    }))
                  }
                >
                  + Doel
                </button>
              </div>

              <div className="week-goal-list">
                {weeklyPlan.goals.map((goal, index) => (
                  <div className="week-goal" key={goal.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={goal.done}
                        onChange={(event) =>
                          updateWeeklyPlan((current) => ({
                            ...current,
                            goals: current.goals.map((item) =>
                              item.id === goal.id
                                ? { ...item, done: event.target.checked }
                                : item,
                            ),
                          }))
                        }
                      />
                      <span>{String(index + 1).padStart(2, "0")}</span>
                    </label>
                    <textarea
                      value={goal.text}
                      placeholder="Bijvoorbeeld: database-schema refactor afgerond en gereviewd"
                      onChange={(event) =>
                        updateWeeklyPlan((current) => ({
                          ...current,
                          goals: current.goals.map((item) =>
                            item.id === goal.id
                              ? { ...item, text: event.target.value }
                              : item,
                          ),
                        }))
                      }
                    />
                    <button
                      aria-label="Weekdoel verwijderen"
                      onClick={() =>
                        updateWeeklyPlan((current) => ({
                          ...current,
                          goals: current.goals.filter(
                            (item) => item.id !== goal.id,
                          ),
                        }))
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="reflection-panel">
              <p className="eyebrow">VRIJDAGREFLECTIE</p>
              <h2>Wat ging goed en wat heb je geleerd?</h2>
              <textarea
                value={weeklyPlan.reflection}
                placeholder="Resultaten, inzichten, blokkades en wat je anders wilt doen…"
                onChange={(event) =>
                  updateWeeklyPlan((current) => ({
                    ...current,
                    reflection: event.target.value,
                  }))
                }
              />
              <label htmlFor="carry-forward">Meenemen naar volgende week</label>
              <textarea
                id="carry-forward"
                className="compact"
                value={weeklyPlan.carryForward}
                placeholder="Wat blijft open of verdient volgende week aandacht?"
                onChange={(event) =>
                  updateWeeklyPlan((current) => ({
                    ...current,
                    carryForward: event.target.value,
                  }))
                }
              />
            </div>
          </div>
        </section>
      )}

      {ticketFormOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setTicketFormOpen(false)}
        >
          <section
            className="ticket-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-ticket-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">NIEUW NOTION-TICKET</p>
                <h2 id="new-ticket-title">Nieuwe taak</h2>
              </div>
              <button
                aria-label="Sluiten"
                onClick={() => setTicketFormOpen(false)}
              >
                ×
              </button>
            </div>

            <form onSubmit={createTicket}>
              <label>
                Titel
                <input
                  autoFocus
                  required
                  value={ticketDraft.title}
                  onChange={(event) =>
                    setTicketDraft((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  placeholder="Wat moet er gebeuren?"
                />
              </label>

              <div className="form-row">
                <label>
                  Epic
                  <select
                    value={ticketDraft.parentEpicId}
                    onChange={(event) =>
                      setTicketDraft((current) => ({
                        ...current,
                        parentEpicId: event.target.value,
                      }))
                    }
                  >
                    <option value="">Geen epic</option>
                    {epics.map((epic) => (
                      <option value={epic.id} key={epic.id}>
                        {epic.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Type
                  <select
                    value={ticketDraft.taskType}
                    onChange={(event) =>
                      setTicketDraft((current) => ({
                        ...current,
                        taskType: event.target
                          .value as TicketDraft["taskType"],
                      }))
                    }
                  >
                    <option value="Subtask">Subtask</option>
                    <option value="Feature">Feature</option>
                  </select>
                </label>
              </div>

              <div className="form-row">
                <label>
                  Prioriteit
                  <select
                    value={ticketDraft.priority}
                    onChange={(event) =>
                      setTicketDraft((current) => ({
                        ...current,
                        priority: event.target
                          .value as TicketDraft["priority"],
                      }))
                    }
                  >
                    <option>Critical</option>
                    <option>High</option>
                    <option>Medium</option>
                    <option>Low</option>
                  </select>
                </label>
                <label>
                  Inschatting (uur)
                  <input
                    type="number"
                    min="0"
                    max="1000"
                    step="0.5"
                    required
                    value={ticketDraft.estimate}
                    onChange={(event) =>
                      setTicketDraft((current) => ({
                        ...current,
                        estimate: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>

              <label>
                Inplannen
                <select
                  value={ticketDraft.schedule}
                  onChange={(event) =>
                    setTicketDraft((current) => ({
                      ...current,
                      schedule: event.target
                        .value as TicketDraft["schedule"],
                    }))
                  }
                >
                  <option value="none">Later inplannen</option>
                  <option value="today">Vandaag om 09:00</option>
                  <option value="tomorrow">Morgen om 09:00</option>
                </select>
              </label>

              <label>
                Volgende actie
                <textarea
                  value={ticketDraft.nextAction}
                  onChange={(event) =>
                    setTicketDraft((current) => ({
                      ...current,
                      nextAction: event.target.value,
                    }))
                  }
                  placeholder="De eerstvolgende concrete stap…"
                />
              </label>

              <div className="modal-footer">
                <span className={`save-feedback ${ticketSaveState}`}>
                  {ticketSaveMessage}
                </span>
                <div>
                  <button
                    type="button"
                    onClick={() => setTicketFormOpen(false)}
                  >
                    Annuleren
                  </button>
                  <button
                    className="primary"
                    type="submit"
                    disabled={ticketSaveState === "saving"}
                  >
                    {ticketSaveState === "saving"
                      ? "Aanmaken…"
                      : "Ticket aanmaken"}
                  </button>
                </div>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
