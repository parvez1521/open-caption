"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { authService } from "@/services/auth";
import { isSupabaseConfigured } from "@/services/auth/supabaseClient";
import { projectsService } from "@/services/projects";
import type { Project } from "@/services/types";
import StudioShell from "@/components/studio/StudioShell";
import {
  createContentItem,
  deleteContentItem,
  fetchContentItems,
  updateContentItem,
  type ContentItem,
} from "@/features/create/library";
import { readWeeklyPlan, type WeeklyPlanBody } from "@/features/growth/plan";
import {
  PLANNER_STATUSES,
  computeReminders,
  emptyCardBody,
  importWeeklyPlan,
  planDrop,
  readPlannerCard,
  type PlannerCardBody,
} from "@/features/planner/model";
import {
  addDays,
  monthGrid,
  monthLabel,
  parseLocalDate,
  shiftMonth,
  todayLocal,
  weekDates,
} from "@/features/planner/dates";
import { cardsByDate, countImportedFrom, type PlannerCard } from "@/features/planner/view";
import PlannerCardEditor from "@/features/planner/PlannerCardEditor";
import PlannerCardFull from "@/features/planner/PlannerCardFull";

const primaryBtn =
  "rounded-full bg-ink px-6 py-2.5 font-sora text-[12px] font-semibold text-dune-white hover:bg-sand-800 disabled:opacity-60 transition-all cursor-pointer";
const ghostBtn =
  "rounded-full border border-sand-300 px-4 py-2 font-sora text-[12px] font-semibold text-sand-800 hover:border-ink hover:text-ink disabled:opacity-50 transition-colors cursor-pointer";
const sectionTitleCls = "font-sora text-[13px] font-bold uppercase tracking-wider text-sand-600";
const cardCls = "rounded-xl border border-sand-200 bg-white p-5";

const WEEKDAY_HEADS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const errText = (e: unknown, fallback: string): string =>
  e instanceof Error ? e.message : fallback;

type ViewMode = "month" | "week" | "day";

interface ParsedWeeklyPlan {
  item: ContentItem;
  plan: WeeklyPlanBody;
}

interface EditorState {
  /** null → creating a new card. */
  cardId: string | null;
  initialBody: PlannerCardBody;
  /** Remount key so the editor form re-initialises per open. */
  session: number;
}

export default function PlannerPage() {
  const router = useRouter();
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [libraryReady, setLibraryReady] = useState(true);
  const [cards, setCards] = useState<PlannerCard[]>([]);
  const [skippedCount, setSkippedCount] = useState(0);
  const [scripts, setScripts] = useState<ContentItem[]>([]);
  const [captionItems, setCaptionItems] = useState<ContentItem[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [weeklyPlans, setWeeklyPlans] = useState<ParsedWeeklyPlan[]>([]);

  const today = todayLocal(new Date());
  const [view, setView] = useState<ViewMode>("month");
  const [selectedDate, setSelectedDate] = useState(today);
  const [monthCursor, setMonthCursor] = useState(() => {
    const d = parseLocalDate(today) ?? new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const [editor, setEditor] = useState<EditorState | null>(null);
  const [editorBusy, setEditorBusy] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);

  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [dragError, setDragError] = useState<string | null>(null);

  const [importingId, setImportingId] = useState<string | null>(null);
  const [importNote, setImportNote] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    if (!authService.isAuthenticated()) {
      router.push(isSupabaseConfigured() ? "/login" : "/start");
      return;
    }
    setSignedIn(true);
  }, [router]);

  const applyCardItems = (items: ContentItem[]) => {
    const parsed: PlannerCard[] = [];
    let skipped = 0;
    for (const item of items) {
      const body = readPlannerCard(item.body);
      if (body) parsed.push({ id: item.id, title: item.title, body });
      else skipped += 1;
    }
    setCards(parsed);
    setSkippedCount(skipped);
  };

  const loadAll = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [cardList, scriptList, captionList, planList, projectList] = await Promise.all([
        fetchContentItems("planner-card"),
        fetchContentItems("script").catch(() => null),
        fetchContentItems("caption").catch(() => null),
        fetchContentItems("weekly-plan").catch(() => null),
        projectsService.getProjects().catch(() => null),
      ]);
      setLibraryReady(cardList.ready);
      applyCardItems(cardList.items);
      if (scriptList) setScripts(scriptList.items);
      if (captionList) setCaptionItems(captionList.items);
      if (projectList) setProjects(projectList);
      if (planList) {
        setWeeklyPlans(
          planList.items
            .map((item) => {
              const plan = readWeeklyPlan(item.body);
              return plan ? { item, plan } : null;
            })
            .filter((x): x is ParsedWeeklyPlan => x !== null),
        );
      }
    } catch (e) {
      setLoadError(errText(e, "Couldn't load your planner. Try again."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!signedIn) return;
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]);

  const refreshCards = async () => {
    const list = await fetchContentItems("planner-card");
    setLibraryReady(list.ready);
    applyCardItems(list.items);
  };

  // ------------------------------------------------------------ derived

  const byDate = useMemo(() => cardsByDate(cards), [cards]);
  const reminders = useMemo(() => computeReminders(cards, today), [cards, today]);
  const overdue = reminders.filter((r) => r.kind === "overdue");
  const dueToday = reminders.filter((r) => r.kind === "today");

  const scriptsById = useMemo(() => new Map(scripts.map((s) => [s.id, s])), [scripts]);
  const captionsById = useMemo(() => new Map(captionItems.map((c) => [c.id, c])), [captionItems]);
  const projectsById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  const grid = useMemo(() => monthGrid(monthCursor.year, monthCursor.month), [monthCursor]);
  const week = useMemo(() => weekDates(selectedDate), [selectedDate]);
  const dayCards = byDate.get(selectedDate) ?? [];

  // ------------------------------------------------------------ navigation

  const goToDate = (date: string, mode: ViewMode) => {
    setSelectedDate(date);
    const d = parseLocalDate(date);
    if (d) setMonthCursor({ year: d.getFullYear(), month: d.getMonth() });
    setView(mode);
  };

  const stepBack = () => {
    if (view === "month") {
      const next = shiftMonth(monthCursor.year, monthCursor.month, -1);
      setMonthCursor(next);
    } else if (view === "week") {
      setSelectedDate(addDays(selectedDate, -7));
    } else {
      setSelectedDate(addDays(selectedDate, -1));
    }
  };

  const stepForward = () => {
    if (view === "month") {
      const next = shiftMonth(monthCursor.year, monthCursor.month, 1);
      setMonthCursor(next);
    } else if (view === "week") {
      setSelectedDate(addDays(selectedDate, 7));
    } else {
      setSelectedDate(addDays(selectedDate, 1));
    }
  };

  const goToday = () => {
    setSelectedDate(today);
    const d = parseLocalDate(today);
    if (d) setMonthCursor({ year: d.getFullYear(), month: d.getMonth() });
  };

  const periodLabel =
    view === "month"
      ? monthLabel(monthCursor.year, monthCursor.month)
      : view === "week"
        ? week.length
          ? `Week of ${week[0]}`
          : ""
        : selectedDate;

  // ------------------------------------------------------------ editor

  const openNewCard = (date: string) => {
    setEditorError(null);
    setEditor((cur) => ({
      cardId: null,
      initialBody: emptyCardBody(date),
      session: (cur?.session ?? 0) + 1,
    }));
  };

  const openEditCard = (card: PlannerCard) => {
    setEditorError(null);
    setEditor((cur) => ({
      cardId: card.id,
      initialBody: card.body,
      session: (cur?.session ?? 0) + 1,
    }));
  };

  const editingCard = editor?.cardId ? (cards.find((c) => c.id === editor.cardId) ?? null) : null;

  const saveCard = async (title: string, body: PlannerCardBody) => {
    if (!editor) return;
    setEditorBusy(true);
    setEditorError(null);
    try {
      const payload = body as unknown as Record<string, unknown>;
      if (editor.cardId) {
        const updated = await updateContentItem(editor.cardId, { title, body: payload });
        setCards((cur) =>
          cur.map((c) => (c.id === updated.id ? { id: updated.id, title: updated.title, body } : c)),
        );
      } else {
        const created = await createContentItem({
          kind: "planner-card",
          title,
          body: payload,
          source: "manual",
        });
        setCards((cur) => [...cur, { id: created.id, title: created.title, body }]);
      }
      setEditor(null);
    } catch (e) {
      setEditorError(errText(e, "Couldn't save the card. Try again."));
    } finally {
      setEditorBusy(false);
    }
  };

  const deleteCard = async () => {
    if (!editor?.cardId) return;
    setEditorBusy(true);
    setEditorError(null);
    try {
      await deleteContentItem(editor.cardId);
      setCards((cur) => cur.filter((c) => c.id !== editor.cardId));
      setEditor(null);
    } catch (e) {
      setEditorError(errText(e, "Couldn't delete the card. Try again."));
    } finally {
      setEditorBusy(false);
    }
  };

  // ------------------------------------------------------------ drag & drop

  const handleDrop = async (targetDate: string) => {
    setDragOverDate(null);
    const patch = planDrop(cards, draggedIdRef.current, targetDate);
    draggedIdRef.current = "";
    if (!patch) return;
    setDragError(null);
    const previous = cards;
    setCards((cur) =>
      cur.map((c) => (c.id === patch.itemId ? { ...c, body: patch.body } : c)),
    );
    try {
      // Exactly one write per drop, with the body planDrop produced.
      await updateContentItem(patch.itemId, {
        body: patch.body as unknown as Record<string, unknown>,
      });
    } catch (e) {
      setCards(previous);
      setDragError(errText(e, "Couldn't move that card — it was put back. Try again."));
    }
  };

  const draggedIdRef = React.useRef("");

  const dropHandlers = (date: string) => ({
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragOverDate(date);
    },
    onDragLeave: () => setDragOverDate((cur) => (cur === date ? null : cur)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      const id = e.dataTransfer.getData("text/plain");
      if (id) draggedIdRef.current = id;
      void handleDrop(date);
    },
  });

  // ------------------------------------------------------------ weekly-plan import

  const importPlan = async ({ item, plan }: ParsedWeeklyPlan) => {
    setImportError(null);
    setImportNote(null);
    const drafts = importWeeklyPlan(item.id, plan);
    if (drafts.length === 0) {
      setImportNote(`"${item.title}" has no filled days — nothing to import.`);
      return;
    }
    setImportingId(item.id);
    try {
      let createdCount = 0;
      for (const draft of drafts) {
        await createContentItem({
          kind: "planner-card",
          title: draft.title,
          body: draft.body as unknown as Record<string, unknown>,
          source: "weekly-plan",
        });
        createdCount += 1;
      }
      await refreshCards();
      setImportNote(`Imported ${createdCount} cards from ${item.title}.`);
    } catch (e) {
      // Some drafts may already be saved; refetch so the calendar shows the truth.
      await refreshCards().catch(() => undefined);
      setImportError(errText(e, "The import didn't finish. The calendar was refreshed — check before importing again, so you don't create duplicates."));
    } finally {
      setImportingId(null);
    }
  };

  // ------------------------------------------------------------ render helpers

  const statusChip = (status: PlannerCard["body"]["status"]) => {
    const label = PLANNER_STATUSES.find((s) => s.id === status)?.label ?? status;
    return (
      <span className="rounded-full border border-sand-300 bg-sand-100 px-2 py-0.5 font-sora text-[10px] font-semibold text-sand-800">
        {label}
      </span>
    );
  };

  const reminderRow = (r: (typeof reminders)[number]) => (
    <li key={r.itemId}>
      <button
        type="button"
        onClick={() => goToDate(r.date, "day")}
        className="flex w-full flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-sand-100 transition-colors cursor-pointer"
      >
        <span className="min-w-0 flex-1 truncate font-sora text-[13px] font-semibold text-ink">{r.title || "(untitled card)"}</span>
        <span className="text-[12px] tabular-nums text-sand-600">{r.date}</span>
        {statusChip(r.status)}
      </button>
    </li>
  );

  return (
    <StudioShell>
      <div className="px-4 sm:px-10 py-8 sm:py-10 max-w-6xl mx-auto">
        <div className="pb-8 border-b border-sand-200">
          <h1 className="font-serif text-3xl sm:text-4xl font-semibold tracking-[-0.015em] text-ink">
            Content <em className="italic text-sand-600">Planner</em>
          </h1>
          <p className="mt-2 text-[14px] text-sand-800 max-w-2xl">
            Plan what goes out, and when. Captionit doesn&apos;t post for you — each card
            gives you the caption and hashtags to copy into the platform yourself.
          </p>
          <details className="mt-3 max-w-[68ch] rounded-lg border border-sand-200 bg-sand-100 px-4 py-3 text-[13px] leading-relaxed text-sand-800">
            <summary className="cursor-pointer font-semibold text-sand-800">How planning works here</summary>
            <div className="mt-1.5 space-y-1.5">
              <p>Weeks start on Monday.</p>
              <p>
                Reminders live here in the Planner — Captionit doesn&apos;t send push or email
                reminders.
              </p>
            </div>
          </details>
        </div>

        {loading ? (
          <p role="status" className="pt-8 text-[14px] text-sand-700">Loading your planner…</p>
        ) : loadError ? (
          <div className="mt-8 rounded-xl border border-orange-accent/60 bg-orange-accent/10 p-8 text-center space-y-3">
            <p className="font-sora text-[14px] font-semibold text-obsidian">{loadError}</p>
            <button onClick={() => void loadAll()} className={ghostBtn}>Retry</button>
          </div>
        ) : (
          <>
            {!libraryReady ? (
              <p role="alert" className="mt-8 rounded-lg border border-orange-accent/60 bg-orange-accent/10 px-4 py-3 text-[13px] leading-relaxed text-obsidian">
                The Planner is not set up on the server yet — a database update is pending. Cards
                can&apos;t be saved until then, and nothing is stored on this device as a
                substitute.
              </p>
            ) : null}
            {skippedCount > 0 ? (
              <p className="mt-4 text-[12px] text-sand-600">
                {skippedCount} saved item{skippedCount === 1 ? "" : "s"} couldn&apos;t be read as
                a planner card and {skippedCount === 1 ? "was" : "were"} skipped.
              </p>
            ) : null}

            {/* -------------------------------------------------- Reminders */}
            {reminders.length > 0 ? (
              <section className="pt-8" aria-label="Reminders">
                <h2 className={sectionTitleCls}>Reminders</h2>
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-orange-accent/60 bg-orange-accent/10 p-4">
                    <p className="font-sora text-[12px] font-bold uppercase tracking-wider text-obsidian">Overdue</p>
                    {overdue.length ? (
                      <ul className="mt-2 space-y-1">{overdue.map(reminderRow)}</ul>
                    ) : (
                      <p className="mt-2 text-[13px] text-sand-700">Nothing overdue.</p>
                    )}
                  </div>
                  <div className="rounded-xl border border-sand-200 bg-white p-4">
                    <p className="font-sora text-[12px] font-bold uppercase tracking-wider text-sand-600">Due today</p>
                    {dueToday.length ? (
                      <ul className="mt-2 space-y-1">{dueToday.map(reminderRow)}</ul>
                    ) : (
                      <p className="mt-2 text-[13px] text-sand-700">Nothing due today.</p>
                    )}
                  </div>
                </div>
              </section>
            ) : (
              <section className="pt-8" aria-label="Reminders">
                <h2 className={sectionTitleCls}>Reminders</h2>
                <p className="mt-2 text-[13px] text-sand-700">Nothing overdue or due today.</p>
              </section>
            )}

            {/* -------------------------------------------------- Calendar */}
            <section className="pt-10" aria-label="Calendar">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className={sectionTitleCls}>Calendar</h2>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <div className="flex rounded-full border border-sand-300 p-1" role="tablist" aria-label="Calendar view">
                    {(["month", "week", "day"] as ViewMode[]).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        role="tab"
                        aria-selected={view === mode}
                        onClick={() => setView(mode)}
                        className={`rounded-full px-3.5 py-1.5 font-sora text-[12px] font-semibold capitalize transition-colors cursor-pointer ${view === mode ? "bg-ink text-dune-white" : "text-sand-700 hover:text-ink"}`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                  <button type="button" className={ghostBtn} onClick={stepBack}>← Prev</button>
                  <button type="button" className={ghostBtn} onClick={goToday}>Today</button>
                  <button type="button" className={ghostBtn} onClick={stepForward}>Next →</button>
                  <button
                    type="button"
                    className={primaryBtn}
                    disabled={!libraryReady}
                    onClick={() => openNewCard(selectedDate)}
                  >
                    New card
                  </button>
                </div>
              </div>
              <p className="mt-3 font-sora text-[16px] font-bold text-ink">{periodLabel}</p>
              {dragError ? <p role="alert" className="mt-2 text-[13px] font-medium text-obsidian">{dragError}</p> : null}

              {cards.length === 0 ? (
                <div className="mt-4 rounded-xl border border-dashed border-sand-300 bg-sand-50 px-8 py-12 text-center">
                  <p className="font-serif text-2xl font-semibold text-ink">Nothing planned <em className="italic text-sand-600">yet.</em></p>
                  <p className="mx-auto mt-2 max-w-md text-[14px] text-sand-800">
                    Create your first card with &ldquo;New card&rdquo;, or import a weekly plan
                    from Growth Studio in the section below — its days become cards here.
                  </p>
                </div>
              ) : null}

              {view === "month" ? (
                <div className="mt-4 overflow-x-auto">
                  <div className="min-w-[720px]">
                    <div className="grid grid-cols-7 gap-1">
                      {WEEKDAY_HEADS.map((d) => (
                        <p key={d} className="px-2 py-1 font-sora text-[11px] font-bold uppercase tracking-wider text-sand-600">{d}</p>
                      ))}
                      {grid.map((date) => {
                        const dayList = byDate.get(date) ?? [];
                        const inMonth = parseLocalDate(date)?.getMonth() === monthCursor.month;
                        const isToday = date === today;
                        const isDropTarget = dragOverDate === date;
                        return (
                          <div
                            key={date}
                            {...dropHandlers(date)}
                            onClick={() => goToDate(date, "day")}
                            className={`min-h-[104px] rounded-lg border p-1.5 align-top transition-colors cursor-pointer ${
                              isDropTarget
                                ? "border-ink bg-sand-200"
                                : isToday
                                  ? "border-ink bg-sand-100"
                                  : "border-sand-200 bg-white hover:border-sand-300"
                            } ${inMonth ? "" : "opacity-50"}`}
                          >
                            <div className="flex items-center gap-1 px-1">
                              <span className={`font-sora text-[12px] font-bold tabular-nums ${isToday ? "text-ink" : "text-sand-700"}`}>
                                {Number(date.slice(8, 10))}
                              </span>
                              {isToday ? <span className="font-sora text-[10px] font-bold uppercase tracking-wide text-sand-600">Today</span> : null}
                              <button
                                type="button"
                                aria-label={`New card on ${date}`}
                                disabled={!libraryReady}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedDate(date);
                                  openNewCard(date);
                                }}
                                className="ml-auto rounded-full border border-sand-300 px-1.5 font-sora text-[11px] font-bold text-sand-700 hover:border-ink hover:text-ink disabled:opacity-50 cursor-pointer"
                              >
                                +
                              </button>
                            </div>
                            <div className="mt-1 space-y-1">
                              {dayList.slice(0, 3).map((card) => (
                                <button
                                  key={card.id}
                                  type="button"
                                  draggable
                                  onDragStart={(e) => {
                                    e.dataTransfer.setData("text/plain", card.id);
                                    e.dataTransfer.effectAllowed = "move";
                                    draggedIdRef.current = card.id;
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openEditCard(card);
                                  }}
                                  className="block w-full truncate rounded-md bg-sand-100 px-1.5 py-1 text-left text-[11px] font-medium text-ink hover:bg-sand-200 cursor-grab"
                                  title={card.title}
                                >
                                  {card.body.time ? `${card.body.time} ` : ""}{card.title || "(untitled)"}
                                </button>
                              ))}
                              {dayList.length > 3 ? (
                                <p className="px-1 text-[11px] font-medium text-sand-600">+{dayList.length - 3} more</p>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : null}

              {view === "week" ? (
                <div className="mt-4 overflow-x-auto">
                  <div className="grid min-w-[900px] grid-cols-7 gap-2">
                    {week.map((date, i) => {
                      const dayList = byDate.get(date) ?? [];
                      const isToday = date === today;
                      const isDropTarget = dragOverDate === date;
                      return (
                        <div
                          key={date}
                          {...dropHandlers(date)}
                          className={`rounded-lg border p-2 ${isDropTarget ? "border-ink bg-sand-200" : isToday ? "border-ink bg-sand-100" : "border-sand-200 bg-sand-50"}`}
                        >
                          <div className="flex items-center gap-1 px-0.5">
                            <p className="font-sora text-[11px] font-bold uppercase tracking-wider text-sand-600">
                              {WEEKDAY_HEADS[i]} {Number(date.slice(8, 10))}
                            </p>
                            <button
                              type="button"
                              aria-label={`New card on ${date}`}
                              disabled={!libraryReady}
                              onClick={() => {
                                setSelectedDate(date);
                                openNewCard(date);
                              }}
                              className="ml-auto rounded-full border border-sand-300 px-1.5 font-sora text-[11px] font-bold text-sand-700 hover:border-ink hover:text-ink disabled:opacity-50 cursor-pointer"
                            >
                              +
                            </button>
                          </div>
                          <div className="mt-2 space-y-2">
                            {dayList.map((card) => (
                              <PlannerCardFull
                                key={card.id}
                                card={card}
                                scriptsById={scriptsById}
                                captionsById={captionsById}
                                projectsById={projectsById}
                                onEdit={openEditCard}
                                draggable
                                onDragStart={(id) => {
                                  draggedIdRef.current = id;
                                }}
                              />
                            ))}
                            {dayList.length === 0 ? (
                              <p className="px-0.5 text-[12px] text-sand-600">Nothing planned.</p>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {view === "day" ? (
                <div className="mt-4">
                  {dayCards.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-sand-300 bg-sand-50 px-8 py-12 text-center">
                      <p className="font-serif text-2xl font-semibold text-ink">Nothing planned for this day <em className="italic text-sand-600">yet.</em></p>
                      <button
                        type="button"
                        className={`${primaryBtn} mt-5`}
                        disabled={!libraryReady}
                        onClick={() => openNewCard(selectedDate)}
                      >
                        New card for {selectedDate}
                      </button>
                    </div>
                  ) : (
                    <div className="grid gap-3 lg:grid-cols-2">
                      {dayCards.map((card) => (
                        <PlannerCardFull
                          key={card.id}
                          card={card}
                          scriptsById={scriptsById}
                          captionsById={captionsById}
                          projectsById={projectsById}
                          onEdit={openEditCard}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </section>

            {/* -------------------------------------------------- Editor */}
            {editor ? (
              <section className="pt-8" aria-label="Card editor">
                <PlannerCardEditor
                  key={editor.session}
                  card={editingCard}
                  initialBody={editor.initialBody}
                  scripts={scripts}
                  captions={captionItems}
                  projects={projects}
                  saveDisabled={!libraryReady}
                  busy={editorBusy}
                  error={editorError}
                  onSave={(title, body) => void saveCard(title, body)}
                  onDelete={() => void deleteCard()}
                  onClose={() => setEditor(null)}
                />
              </section>
            ) : null}

            {/* -------------------------------------------------- Weekly-plan import */}
            <section className="pt-10 pb-4" aria-label="Import a weekly plan">
              <h2 className={sectionTitleCls}>Import a weekly plan</h2>
              <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-sand-800">
                Plans drafted in Growth Studio can become calendar cards — one card per filled
                day item, marked as planned. Days the plan left empty produce no card.
              </p>
              {importNote ? <p role="status" className="mt-3 text-[13px] font-medium text-sand-800">{importNote}</p> : null}
              {importError ? <p role="alert" className="mt-3 text-[13px] font-medium text-obsidian">{importError}</p> : null}
              {weeklyPlans.length === 0 ? (
                <p className="mt-4 text-[14px] text-sand-700">
                  No saved weekly plans yet. Draft one in Growth Studio. It will appear here, ready to import.
                </p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {weeklyPlans.map(({ item, plan }) => {
                    const already = countImportedFrom(cards, item.id);
                    const importing = importingId === item.id;
                    return (
                      <li key={item.id} className={`${cardCls} flex flex-wrap items-center gap-3`}>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-sora text-[14px] font-bold text-ink" title={item.title}>{item.title}</p>
                          <p className="mt-0.5 text-[12px] text-sand-600">
                            Week of {plan.weekStart}
                            {" · "}
                            {already > 0
                              ? `${already} card${already === 1 ? "" : "s"} already imported from this plan`
                              : "Not imported yet"}
                          </p>
                          {already > 0 ? (
                            <p className="mt-0.5 text-[12px] text-sand-600">
                              Importing again creates duplicates — the earlier cards stay as they are.
                            </p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          className={already > 0 ? ghostBtn : primaryBtn}
                          disabled={!libraryReady || importingId !== null}
                          onClick={() => void importPlan({ item, plan })}
                        >
                          {importing
                            ? "Importing…"
                            : already > 0
                              ? "Import again (creates duplicates)"
                              : "Import into calendar"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* (The old footer line listing every platform and status was removed: it only
                restated the options inside the card editor itself.) */}
          </>
        )}
      </div>
    </StudioShell>
  );
}
