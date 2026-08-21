'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppConfirmationToast, type AppConfirmationToastMessage } from '@/components/AppConfirmationToast';
import type { ProductionBoardCard, ProductionBoardViewModel } from '@/lib/production-board/types';
import { addDaysToDateOnly } from '@/lib/production-board/date-utils';
import { completeCalendarProductionBooking, placeCalendarProductionBooking, reloadCalendarProductionDays, reopenCalendarProductionBooking, reorderCalendarNeedsAttention, reorderCalendarProductionDay } from '@/lib/production-bookings/calendar-production-actions';
import { getProductionScheduleCompletionBlockReason } from '@/lib/production-schedule/completion-ui-contract';
import { getProductionScheduleCardMoveBlockReason } from '@/lib/production-schedule/move-ui-contract';
import { clampCalendarDetailPosition, getCalendarMoveRequirements, placeCalendarBookingLocally, reorderBookingIds, reorderCalendarDayLocally, resolveExpandedCalendarInteraction } from '@/lib/calendar/interaction';
import {
  buildCalendarLayers,
  calendarCapacityLabel,
  calendarMonthSegments,
  calendarProductionCardText,
  productionLayerKey,
  searchCalendarCards,
  salespersonColor,
  type CalendarLayer,
} from '@/lib/calendar/presentation';

type ReopenState = { card: ProductionBoardCard; reason: string; pending: boolean; error: string | null };
type CalendarDropTarget = { date: string; targetId: string | null; before: boolean };
type CalendarMoveState = {
  card: ProductionBoardCard;
  destinationDate: string | null;
  sourceOrder: string[];
  requiresAcknowledgement: boolean;
  requiresBackdateReason: boolean;
  requiresClosedOverride: boolean;
  acknowledged: boolean;
  closedAcknowledged: boolean;
  reason: string;
  pending: boolean;
  error: string | null;
  undoing: boolean;
};
type CalendarUndo = { bookingId: string; fromDate: string | null; toDate: string | null; sourceOrder: string[] };

export function CalendarWorkspace(props: { board: ProductionBoardViewModel; canInteract: boolean; canOpenJobs: boolean; currentMonday: string; preferenceOwner: string; today: string }) {
  return <CalendarWorkspaceSession {...props} key={JSON.stringify(props.board)}/>;
}

function CalendarWorkspaceSession({ board, canInteract, canOpenJobs, currentMonday, preferenceOwner, today }: { board: ProductionBoardViewModel; canInteract: boolean; canOpenJobs: boolean; currentMonday: string; preferenceOwner: string; today: string }) {
  const router = useRouter();
  const [displayBoard, setDisplayBoard] = useState(board);
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [highlightedResult, setHighlightedResult] = useState(0);
  const [highlightedBookingId, setHighlightedBookingId] = useState<string | null>(null);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [detailBookingId, setDetailBookingId] = useState<string | null>(null);
  const [detailPosition, setDetailPosition] = useState<{ x: number; y: number } | null>(null);
  const [quickAddDate, setQuickAddDate] = useState<string | null>(null);
  const [completionPendingId, setCompletionPendingId] = useState<string | null>(null);
  const [moveState, setMoveState] = useState<CalendarMoveState | null>(null);
  const [dropTarget, setDropTarget] = useState<CalendarDropTarget | null>(null);
  const [moveUndo, setMoveUndo] = useState<CalendarUndo | null>(null);
  const [dragBusy, setDragBusy] = useState(false);
  const [toast, setToast] = useState<AppConfirmationToastMessage | null>(null);
  const [layersOpen, setLayersOpen] = useState(false);
  const [needsAttentionOpen, setNeedsAttentionOpen] = useState(false);
  const [needsAttentionExpanded, setNeedsAttentionExpanded] = useState(false);
  const [needsAttentionPosition, setNeedsAttentionPosition] = useState<{ x: number; y: number } | null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const searchWrapper = useRef<HTMLDivElement>(null);
  const highlightTimer = useRef<number | null>(null);
  const toastId = useRef(0);
  const draggedCard = useRef<ProductionBoardCard | null>(null);
  const consumeOutsideCalendarClick = useRef(false);
  const allCards = useMemo(() => [...displayBoard.days.flatMap((day) => day.cards), ...displayBoard.needsAttentionCards], [displayBoard.days, displayBoard.needsAttentionCards]);
  const layers = useMemo(() => buildCalendarLayers(allCards), [allCards]);
  const availableKeys = useMemo(() => layers.filter((layer) => layer.available).map((layer) => layer.key), [layers]);
  const [visibleLayers, setVisibleLayers] = useState<string[]>(availableKeys);
  const layerStorageKey = `doorgo.calendar.visible-layers.v1:${preferenceOwner}`;
  const searchResults = useMemo(() => searchCalendarCards(allCards, search), [allCards, search]);
  const detailCard = detailBookingId ? allCards.find((card) => card.bookingId === detailBookingId) ?? null : null;

  useEffect(() => {
    const stored = window.localStorage.getItem(layerStorageKey);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as unknown;
      if (!Array.isArray(parsed)) return;
      const timer = window.setTimeout(() => {
        setVisibleLayers(availableKeys.filter((key) => parsed.includes(key)));
      }, 0);
      return () => window.clearTimeout(timer);
    } catch {
      window.localStorage.removeItem(layerStorageKey);
    }
  }, [availableKeys, layerStorageKey]);

  useEffect(() => () => {
    if (highlightTimer.current !== null) window.clearTimeout(highlightTimer.current);
  }, []);

  useEffect(() => {
    if (!moveUndo) return;
    const timer = window.setTimeout(() => setMoveUndo(null), 7000);
    return () => window.clearTimeout(timer);
  }, [moveUndo]);

  const navigate = (monday: string) => startTransition(() => router.push(`/calendar?week=${encodeURIComponent(monday)}`));
  const toggleLayer = (key: string) => setVisibleLayers((current) => {
    const next = current.includes(key) ? current.filter((item) => item !== key) : [...current, key];
    window.localStorage.setItem(layerStorageKey, JSON.stringify(next));
    return next;
  });
  const selectSearchResult = (card: ProductionBoardCard) => {
    const layerKey = productionLayerKey(card.salesperson);
    setVisibleLayers((current) => {
      if (current.includes(layerKey)) return current;
      const next = [...current, layerKey];
      window.localStorage.setItem(layerStorageKey, JSON.stringify(next));
      return next;
    });
    setSearchOpen(false);
    setHighlightedBookingId(card.bookingId);
    if (card.productionDate === null) {
      setNeedsAttentionOpen(true);
      setNeedsAttentionExpanded(true);
    }
    window.setTimeout(() => {
      document.getElementById(bookingElementId(card.bookingId))?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 0);
    if (highlightTimer.current !== null) window.clearTimeout(highlightTimer.current);
    highlightTimer.current = window.setTimeout(() => setHighlightedBookingId(null), 2200);
  };
  const onSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setSearchOpen(false);
      return;
    }
    if (!searchResults.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setSearchOpen(true);
      setHighlightedResult((current) => event.key === 'ArrowDown'
        ? (current + 1) % searchResults.length
        : (current - 1 + searchResults.length) % searchResults.length);
      return;
    }
    if (event.key === 'Enter' && searchOpen) {
      event.preventDefault();
      selectSearchResult(searchResults[Math.min(highlightedResult, searchResults.length - 1)]);
    }
  };

  const announce = (tone: 'success' | 'error', text: string) => {
    toastId.current += 1;
    setToast({ id: toastId.current, tone, text });
  };
  const reconcileDays = async (dates: string[]) => {
    const result = await reloadCalendarProductionDays({ boardStart: displayBoard.startDate, boardEndExclusive: displayBoard.endDateExclusive, weeks: displayBoard.weeks, today, dates });
    if (!result.ok) return;
    const replacements = new Map(result.days.map((day) => [day.date, day]));
    const replace = (days: typeof displayBoard.days) => days.map((day) => replacements.get(day.date) ?? day);
    setDisplayBoard((current) => ({ ...current, needsAttentionCards: result.needsAttentionCards, days: replace(current.days), weekGroups: current.weekGroups.map((week) => ({ ...week, days: replace(week.days) })) }));
  };
  const updateCompletionLocally = (bookingId: string, completedAt: string | null) => {
    const updateDays = (days: typeof displayBoard.days) => days.map((day) => ({
      ...day,
      cards: day.cards.map((card) => card.bookingId === bookingId ? { ...card, completedAt } : card),
    }));
    setDisplayBoard((current) => ({
      ...current,
      days: updateDays(current.days),
      weekGroups: current.weekGroups.map((week) => ({ ...week, days: updateDays(week.days) })),
    }));
  };
  const completeCard = async (card: ProductionBoardCard) => {
    if (!canInteract || completionPendingId || getProductionScheduleCompletionBlockReason(card, false)) return;
    if (!card.productionDate) { announce('error', 'Unscheduled completion is not supported by the current authoritative completion contract.'); return; }
    setCompletionPendingId(card.bookingId);
    const result = await completeCalendarProductionBooking({ commandId: createSecureCommandId(), bookingId: card.bookingId, expectedProductionDate: card.productionDate });
    setCompletionPendingId(null);
    if (!result.ok) {
      announce('error', result.message);
      if (result.code === 'stale_booking' || result.code === 'already_completed') void reconcileDays([card.productionDate]);
      return;
    }
    updateCompletionLocally(card.bookingId, result.event.resultingCompletedAt);
    announce('success', 'Production booking marked complete.');
  };
  const reopenCard = async (card: ProductionBoardCard) => {
    if (!canInteract || completionPendingId || !card.completedAt) return;
    if (!card.productionDate) { announce('error', 'Unscheduled reopen is not supported by the current authoritative completion contract.'); return; }
    setCompletionPendingId(card.bookingId);
    const result = await reopenCalendarProductionBooking({ commandId: createSecureCommandId(), bookingId: card.bookingId, expectedProductionDate: card.productionDate, expectedCompletedAt: card.completedAt });
    setCompletionPendingId(null);
    if (!result.ok) {
      announce('error', result.message);
      if (result.code === 'stale_booking' || result.code === 'not_completed') void reconcileDays([card.productionDate]);
      return;
    }
    updateCompletionLocally(card.bookingId, null);
    announce('success', 'Production booking reopened.');
  };
  const openDetails = (card: ProductionBoardCard) => {
    const bounds = workspaceRef.current?.getBoundingClientRect();
    setDetailBookingId(card.bookingId);
    setDetailPosition(bounds ? { x: Math.max(bounds.left + 8, bounds.right - 368), y: bounds.top + 56 } : null);
  };
  const executeMove = async (snapshot: CalendarMoveState) => {
    if (snapshot.pending || dragBusy) return;
    const reason = snapshot.reason.trim();
    if (snapshot.requiresBackdateReason && (!reason || reason.length > 500)) {
      setMoveState({ ...snapshot, error: 'Enter a reason between 1 and 500 characters.' });
      return;
    }
    if ((snapshot.requiresAcknowledgement && !snapshot.acknowledged) || (snapshot.requiresClosedOverride && !snapshot.closedAcknowledged)) {
      setMoveState({ ...snapshot, error: 'Confirm the required acknowledgement before moving.' });
      return;
    }
    const before = displayBoard;
    const optimistic = placeCalendarBookingLocally(before, snapshot.card.bookingId, snapshot.destinationDate);
    setDisplayBoard(optimistic);
    setMoveState((current) => current ? { ...current, pending: true, error: null } : current);
    setDragBusy(true);
    const result = await placeCalendarProductionBooking({
      commandId: createSecureCommandId(), bookingId: snapshot.card.bookingId,
      expectedProductionDate: snapshot.card.productionDate, destinationProductionDate: snapshot.destinationDate,
      whollyUnstartedAcknowledged: snapshot.requiresAcknowledgement ? snapshot.acknowledged : false,
      backdateReason: snapshot.requiresBackdateReason ? reason : null,
      closedDateOverrideAcknowledged: snapshot.requiresClosedOverride ? snapshot.closedAcknowledged : false,
    });
    setDragBusy(false);
    if (!result.ok) {
      setDisplayBoard(before);
      setMoveState((current) => current ? { ...current, pending: false, error: result.message } : current);
      announce('error', result.message);
      if (result.code === 'stale_booking' || result.code === 'not_found') void reconcileDays([snapshot.card.productionDate, snapshot.destinationDate].filter((date): date is string => date !== null));
      if (['stale_booking', 'not_found', 'ineligible_booking', 'permission_required'].includes(result.code)) setMoveState(null);
      return;
    }
    setMoveState(null);
    setMoveUndo(snapshot.undoing ? null : { bookingId: snapshot.card.bookingId, fromDate: snapshot.card.productionDate, toDate: snapshot.destinationDate, sourceOrder: snapshot.sourceOrder });
    if (snapshot.undoing) announce('success', 'Move undone.');
    if (snapshot.undoing && snapshot.destinationDate) await restoreUndoOrder(optimistic, snapshot.destinationDate, snapshot.sourceOrder);
  };
  const restoreUndoOrder = async (authoritativeCandidate: ProductionBoardViewModel, date: string, desiredOrder: string[]) => {
    const day = authoritativeCandidate.days.find((item) => item.date === date);
    if (!day) return;
    const currentIds = day.cards.map((card) => card.bookingId);
    if (currentIds.length !== desiredOrder.length || desiredOrder.some((id) => !currentIds.includes(id))) return;
    const result = await reorderCalendarProductionDay({ productionDate: date, expectedBookingIds: currentIds, orderedBookingIds: desiredOrder });
    if (!result.ok) {
      announce('error', 'The date was restored, but its prior order changed elsewhere. The affected day was reconciled.');
      void reconcileDays([date]);
    }
  };
  const beginDateMove = (card: ProductionBoardCard, destinationDate: string | null, sourceOrder: string[], undoing = false) => {
    if (!undoing) setMoveUndo(null);
    const destination = destinationDate ? displayBoard.days.find((day) => day.date === destinationDate) : null;
    if ((destinationDate && !destination) || getProductionScheduleCardMoveBlockReason(card, false)) {
      announce('error', 'This Production booking cannot be moved to another date.');
      return;
    }
    const requirements = destinationDate
      ? getCalendarMoveRequirements(card.productionDate ?? destinationDate, destinationDate, today, destination?.isExplicitlyClosed ?? false)
      : { requiresAcknowledgement: false, requiresBackdateReason: false, requiresClosedOverride: false };
    const exceptional: CalendarMoveState = {
      card, destinationDate, sourceOrder,
      ...requirements,
      acknowledged: false, closedAcknowledged: false, reason: '', pending: false, error: null, undoing,
    };
    if (exceptional.requiresAcknowledgement || exceptional.requiresBackdateReason || exceptional.requiresClosedOverride) setMoveState(exceptional);
    else void executeMove(exceptional);
  };
  const reorderDay = async (date: string, draggedId: string, targetId: string, beforeTarget: boolean) => {
    const day = displayBoard.days.find((item) => item.date === date);
    if (!day) return;
    const expected = day.cards.map((card) => card.bookingId);
    const ordered = reorderBookingIds(expected, draggedId, targetId, beforeTarget);
    if (ordered === expected || ordered.every((id, index) => id === expected[index])) return;
    const before = displayBoard;
    setDisplayBoard(reorderCalendarDayLocally(before, date, ordered));
    setDragBusy(true);
    const result = await reorderCalendarProductionDay({ productionDate: date, expectedBookingIds: expected, orderedBookingIds: ordered });
    setDragBusy(false);
    if (!result.ok) {
      setDisplayBoard(before);
      announce('error', result.message);
      if (result.code === 'stale_day') void reconcileDays([date]);
      return;
    }
  };
  const beginUndo = () => {
    if (!moveUndo) return;
    const card = allCards.find((item) => item.bookingId === moveUndo.bookingId);
    if (!card || card.productionDate !== moveUndo.toDate) { setMoveUndo(null); announce('error', 'Undo is no longer safe because the booking changed.'); return; }
    beginDateMove(card, moveUndo.fromDate, moveUndo.sourceOrder, true);
  };
  const onCardDragStart = (card: ProductionBoardCard, event: React.DragEvent<HTMLElement>) => {
    if (consumeOutsideCalendarClick.current || !canInteract || dragBusy || card.bookingKind !== 'production' || card.locked || card.completedAt) { event.preventDefault(); return; }
    draggedCard.current = card;
    if (card.productionDate !== null) {
      setNeedsAttentionOpen(true);
      if (!needsAttentionPosition) {
        const bounds=workspaceRef.current?.getBoundingClientRect();
        if(bounds)setNeedsAttentionPosition({x:Math.max(bounds.left+8,bounds.right-360),y:bounds.top+48});
      }
    }
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', card.bookingId);
  };
  const onDayDragOver = (date: string, event: React.DragEvent<HTMLElement>) => {
    if (!draggedCard.current || dragBusy) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-booking-id]');
    const targetId = target?.dataset.bookingId ?? null;
    const before = target ? event.clientY < target.getBoundingClientRect().top + target.getBoundingClientRect().height / 2 : false;
    setDropTarget((current) => current?.date === date && current.targetId === targetId && current.before === before ? current : { date, targetId, before });
  };
  const onDayDrop = (date: string, event: React.DragEvent<HTMLElement>) => {
    const card = draggedCard.current;
    if (!card) return;
    event.preventDefault();
    draggedCard.current = null;
    const target = dropTarget?.date === date ? dropTarget : null;
    setDropTarget(null);
    const sourceDay = displayBoard.days.find((day) => day.date === card.productionDate);
    if (date === card.productionDate) {
      if (target?.targetId) void reorderDay(date, card.bookingId, target.targetId, target.before);
      return;
    }
    beginDateMove(card, date, sourceDay?.cards.map((item) => item.bookingId) ?? displayBoard.needsAttentionCards.map((item) => item.bookingId));
  };
  const onCardDragEnd = () => { draggedCard.current = null; setDropTarget(null); };
  const visibleNeedsAttention = displayBoard.needsAttentionCards.filter((card) => visibleLayers.includes(productionLayerKey(card.salesperson)));
  const onNeedsAttentionDrop = (event: React.DragEvent<HTMLElement>) => {
    const card = draggedCard.current;
    if (!card) return;
    event.preventDefault();
    draggedCard.current = null;
    setDropTarget(null);
    if (card.productionDate === null) {
      const target=(event.target as HTMLElement).closest<HTMLElement>('[data-booking-id]');
      const targetId=target?.dataset.bookingId;
      if(!targetId||targetId===card.bookingId)return;
      const expected=displayBoard.needsAttentionCards.map((item)=>item.bookingId);
      const ordered=reorderBookingIds(expected,card.bookingId,targetId,event.clientY<target.getBoundingClientRect().top+target.getBoundingClientRect().height/2);
      setDisplayBoard((current)=>({...current,needsAttentionCards:ordered.map((id,index)=>({...current.needsAttentionCards.find((item)=>item.bookingId===id)!,dayOrder:(index+1)*1024}))}));
      setDragBusy(true); void reorderCalendarNeedsAttention({expectedBookingIds:expected,orderedBookingIds:ordered}).then((result)=>{setDragBusy(false);if(!result.ok){announce('error',result.message);void reconcileDays([]);}});
      return;
    }
    const source = displayBoard.days.find((day) => day.date === card.productionDate);
    beginDateMove(card, null, source?.cards.map((item) => item.bookingId) ?? []);
  };

  return <div className="calendar-workspace" ref={workspaceRef}>
    <header className="calendar-toolbar" aria-label="Calendar controls" onPointerDownCapture={() => {
      const decision = resolveExpandedCalendarInteraction(expandedDate, { kind: 'toolbar' });
      if (decision.collapse) setExpandedDate(null);
    }}>
      <div className="calendar-toolbar-cluster" aria-label="Calendar date navigation">
        <ToolbarButton label="Previous month" disabled={pending} onClick={() => navigate(addDaysToDateOnly(displayBoard.startDate, -28))}>&lsaquo;</ToolbarButton>
        <ToolbarButton label="Current week" disabled={pending || displayBoard.startDate === currentMonday} onClick={() => navigate(currentMonday)}>Today</ToolbarButton>
        <ToolbarButton label="Next month" disabled={pending} onClick={() => navigate(addDaysToDateOnly(displayBoard.startDate, 28))}>&rsaquo;</ToolbarButton>
      </div>
      <div className="calendar-search" ref={searchWrapper} onBlur={() => window.setTimeout(() => { if (!searchWrapper.current?.contains(document.activeElement)) setSearchOpen(false); }, 0)}>
        <label><span className="sr-only">Search by name or sales order</span><input aria-activedescendant={searchOpen && searchResults.length ? searchResultId(searchResults[Math.min(highlightedResult, searchResults.length - 1)].bookingId) : undefined} aria-autocomplete="list" aria-controls="calendar-search-results" aria-expanded={searchOpen} onChange={(event) => { const value = event.target.value; setSearch(value); setHighlightedResult(0); setSearchOpen(Boolean(value.trim())); }} onFocus={() => { setExpandedDate(null); setSearchOpen(Boolean(search.trim())); }} onKeyDown={onSearchKeyDown} placeholder="Name / SO Search" role="combobox" type="search" value={search}/></label>
        {searchOpen ? <div className="calendar-search-results" id="calendar-search-results" role="listbox">
          {searchResults.length ? searchResults.map((card, index) => <button aria-selected={index === highlightedResult} className="calendar-search-result" id={searchResultId(card.bookingId)} key={card.bookingId} onClick={() => selectSearchResult(card)} onMouseDown={(event) => event.preventDefault()} role="option" type="button"><span>{card.customer?.trim() || card.title?.trim() || 'Untitled'}</span><small>{card.jobId?.trim() || 'Unlinked'} · {card.productionDate ? formatSearchDate(card.productionDate) : 'Needs Attention'}</small></button>) : <p className="calendar-search-empty">No matches in the loaded Calendar.</p>}
        </div> : null}
      </div>
      <LayersPicker layers={layers} open={layersOpen} setOpen={setLayersOpen} toggle={toggleLayer} visible={visibleLayers}/>
      <button aria-expanded={needsAttentionOpen} className="calendar-toolbar-button" onClick={() => { setNeedsAttentionOpen((open) => !open); if (!needsAttentionPosition) { const bounds=workspaceRef.current?.getBoundingClientRect(); if(bounds)setNeedsAttentionPosition({x:Math.max(bounds.left+8,bounds.right-360),y:bounds.top+48}); } }} type="button">Needs Attention · {displayBoard.needsAttentionCards.length}</button>
      <button className="calendar-toolbar-button" type="button" title="Calendar document workflow is planned for a later pass">Documents · 0</button>
      {pending ? <span className="sr-only" role="status">Loading Calendar…</span> : null}
    </header>
    <main className="calendar-stream" aria-label="DoorGo Calendar" onClickCapture={(event) => {
      if (!consumeOutsideCalendarClick.current) return;
      consumeOutsideCalendarClick.current = false;
      event.preventDefault();
      event.stopPropagation();
    }} onPointerCancelCapture={() => { consumeOutsideCalendarClick.current = false; }} onPointerDownCapture={(event) => {
      if (!expandedDate) return;
      const day = (event.target as HTMLElement).closest<HTMLElement>('[data-calendar-date]');
      const date = day?.dataset.calendarDate;
      if (!date || date === expandedDate) return;
      const decision = resolveExpandedCalendarInteraction(expandedDate, { kind: 'day', date, interactiveChild: true });
      if (!decision.consume) return;
      consumeOutsideCalendarClick.current = true;
      setExpandedDate(null);
      event.preventDefault();
      event.stopPropagation();
    }} onPointerUpCapture={() => { window.setTimeout(() => { consumeOutsideCalendarClick.current = false; }, 0); }}>
      {displayBoard.weekGroups.map((week) => <section className="calendar-week" key={week.startDate}>
        <div className="calendar-month-row" aria-hidden="true" style={calendarWeekGridStyle(week.days.map((day) => day.date), expandedDate)}>
          {calendarMonthSegments(week.days.map((day) => day.date)).map((segment) => <span key={`${week.startDate}-${segment.label}`} style={{ gridColumn: `${segment.startColumn} / span ${segment.span}` }}>{segment.label}</span>)}
        </div>
        <div className="calendar-days" style={calendarWeekGridStyle(week.days.map((day) => day.date), expandedDate)}>
          {week.days.map((day) => {
            const cards = day.cards.filter((card) => visibleLayers.includes(productionLayerKey(card.salesperson)));
            const overloaded = day.capacityKnown && day.availableHours !== null && day.totalKnownShopHours > day.availableHours;
            const expanded = expandedDate === day.date;
            return <article className="calendar-day" data-calendar-date={day.date} data-day-state={day.dateState} data-drop-target={dropTarget?.date === day.date || undefined} data-expanded={expanded || undefined} data-overloaded={overloaded || undefined} key={day.date} onClick={() => {
              const decision = resolveExpandedCalendarInteraction(expandedDate, { kind: 'day', date: day.date, interactiveChild: false });
              if (decision.collapse) setExpandedDate(null);
              else if (decision.interact) setExpandedDate(day.date);
            }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget((current) => current?.date === day.date ? null : current); }} onDragOver={(event) => onDayDragOver(day.date, event)} onDrop={(event) => onDayDrop(day.date, event)}>
              <header className="calendar-day-header">
                <div><strong>{formatDay(day.date)}</strong><span>{calendarCapacityLabel(day)}</span></div>
                <div className="calendar-day-actions">{expanded ? <button onClick={(event) => { event.stopPropagation(); setExpandedDate(null); }} type="button">Close</button> : null}<button onClick={(event) => { event.stopPropagation(); setQuickAddDate(day.date); }} type="button">+ Add</button></div>
              </header>
              <div className="calendar-card-list">
                {cards.map((card) => expanded
                  ? <ExpandedProductionCard calendarWeek={displayBoard.startDate} canDrag={canInteract && !dragBusy && !card.locked && !card.completedAt} canInteract={canInteract} canOpenJobs={canOpenJobs} card={card} dropPosition={dropTarget?.date === day.date && dropTarget.targetId === card.bookingId ? (dropTarget.before ? 'before' : 'after') : null} highlighted={card.bookingId === highlightedBookingId} key={card.bookingId} onComplete={() => void completeCard(card)} onDetails={() => openDetails(card)} onDragEnd={onCardDragEnd} onDragStart={(event) => onCardDragStart(card, event)} onReopen={() => void reopenCard(card)} pending={completionPendingId === card.bookingId}/>
                  : <CalendarProductionCard canDrag={canInteract && !dragBusy && !card.locked && !card.completedAt} card={card} dropPosition={dropTarget?.date === day.date && dropTarget.targetId === card.bookingId ? (dropTarget.before ? 'before' : 'after') : null} highlighted={card.bookingId === highlightedBookingId} key={card.bookingId} onDragEnd={onCardDragEnd} onDragStart={(event) => onCardDragStart(card, event)}/>)}
              </div>
            </article>;
          })}
        </div>
      </section>)}
    </main>
    {detailCard ? <ProductionDetailPanel calendarWeek={displayBoard.startDate} canOpenJobs={canOpenJobs} card={detailCard} onClose={() => setDetailBookingId(null)} position={detailPosition} setPosition={setDetailPosition} workspaceRef={workspaceRef}/> : null}
    {needsAttentionOpen ? <NeedsAttentionPanel calendarWeek={displayBoard.startDate} canInteract={canInteract} canOpenJobs={canOpenJobs} cards={visibleNeedsAttention} expanded={needsAttentionExpanded} highlightedBookingId={highlightedBookingId} onClose={() => setNeedsAttentionOpen(false)} onDetails={openDetails} onDragEnd={onCardDragEnd} onDragStart={onCardDragStart} onDrop={onNeedsAttentionDrop} onExpand={() => setNeedsAttentionExpanded((value) => !value)} position={needsAttentionPosition} setPosition={setNeedsAttentionPosition} workspaceRef={workspaceRef}/> : null}
    {quickAddDate ? <QuickAddPicker date={quickAddDate} onClose={() => setQuickAddDate(null)}/> : null}
    {moveState ? <ExceptionalMovePanel state={moveState} onCancel={() => { if (!moveState.pending) setMoveState(null); }} onChange={(changes) => setMoveState((current) => current ? { ...current, ...changes, error: null } : current)} onSubmit={() => void executeMove(moveState)}/> : null}
    {moveUndo ? <div className="calendar-move-undo" role="status"><span>{moveUndo.toDate === null ? 'Moved to Needs Attention' : 'Scheduled'}</span><span aria-hidden="true">·</span><button disabled={dragBusy} onClick={beginUndo} type="button">Undo</button></div> : null}
    <AppConfirmationToast message={toast} onDismiss={() => setToast(null)}/>
  </div>;
}

function NeedsAttentionPanel({ calendarWeek, canInteract, canOpenJobs, cards, expanded, highlightedBookingId, onClose, onDetails, onDragEnd, onDragStart, onDrop, onExpand, position, setPosition, workspaceRef }: {
  calendarWeek:string; canInteract:boolean; canOpenJobs:boolean; cards:ProductionBoardCard[]; expanded:boolean; highlightedBookingId:string|null;
  onClose:()=>void; onDetails:(card:ProductionBoardCard)=>void; onDragEnd:()=>void; onDragStart:(card:ProductionBoardCard,event:React.DragEvent<HTMLElement>)=>void;
  onDrop:(event:React.DragEvent<HTMLElement>)=>void; onExpand:()=>void; position:{x:number;y:number}|null; setPosition:(position:{x:number;y:number})=>void; workspaceRef:React.RefObject<HTMLDivElement|null>;
}) {
  const panelRef=useRef<HTMLElement>(null); const dragOffset=useRef<{x:number;y:number}|null>(null);
  const move=(event:React.PointerEvent<HTMLElement>)=>{if(!dragOffset.current||!panelRef.current||!workspaceRef.current)return;const panel=panelRef.current.getBoundingClientRect();const workspace=workspaceRef.current.getBoundingClientRect();setPosition(clampCalendarDetailPosition({x:event.clientX-dragOffset.current.x,y:event.clientY-dragOffset.current.y},{width:panel.width,height:panel.height},workspace,{width:window.innerWidth,height:window.innerHeight}));};
  const shown=expanded?cards:cards.slice(0,1);
  return <section aria-label="Production Needs Attention" className="calendar-needs-attention" data-expanded={expanded||undefined} onDragOver={(event)=>{event.preventDefault();event.dataTransfer.dropEffect='move';}} onDrop={onDrop} ref={panelRef} style={position?{left:position.x,top:position.y}:undefined}>
    <header onPointerDown={(event)=>{if((event.target as HTMLElement).closest('button'))return;const panel=panelRef.current?.getBoundingClientRect();if(!panel)return;dragOffset.current={x:event.clientX-panel.left,y:event.clientY-panel.top};event.currentTarget.setPointerCapture(event.pointerId);}} onPointerMove={move} onPointerUp={(event)=>{dragOffset.current=null;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}}>
      <strong>Needs Attention · {cards.length}</strong><div><button onClick={onExpand} type="button">{expanded?'Collapse':'Expand'}</button><button aria-label="Close Needs Attention" onClick={onClose} type="button">×</button></div>
    </header>
    <div className="calendar-needs-attention-list">
      {shown.length?shown.map((card)=>expanded?<div className="calendar-needs-attention-item" data-booking-id={card.bookingId} data-completed={card.completedAt!==null||undefined} data-highlighted={card.bookingId===highlightedBookingId||undefined} draggable={canInteract&&!card.locked&&!card.completedAt||undefined} id={bookingElementId(card.bookingId)} key={card.bookingId} onDragEnd={onDragEnd} onDragStart={(event)=>onDragStart(card,event)} style={{backgroundColor:salespersonColor(card.salesperson).background,color:salespersonColor(card.salesperson).foreground}}>
        <span aria-hidden="true" className="calendar-drag-handle">⋮⋮</span><div><strong>{card.customer?.trim()||card.title?.trim()||'Untitled'}</strong><span>{card.shopHoursKnown?`${formatHours(card.shopHours??0)} hrs`:'◷ TBD'} · {card.nativeSalesOrder?.trim()||card.jobId?.trim()||'Unlinked'}</span></div>
        {card.completedAt?<span aria-label="Completed">✓</span>:null}{card.internalJobId&&canOpenJobs?<Link href={jobHref(card.internalJobId,calendarWeek)}>Open Job</Link>:null}<button aria-label="More details" onClick={()=>onDetails(card)} type="button">•••</button>
      </div>:<CalendarProductionCard canDrag={canInteract&&!card.locked&&!card.completedAt} card={card} dropPosition={null} highlighted={card.bookingId===highlightedBookingId} key={card.bookingId} onDragEnd={onDragEnd} onDragStart={(event)=>onDragStart(card,event)}/>):<p className="calendar-needs-attention-empty">No visible Production items.</p>}
    </div>
  </section>;
}

function LayersPicker({ layers, open, setOpen, toggle, visible }: { layers: CalendarLayer[]; open: boolean; setOpen: (open: boolean) => void; toggle: (key: string) => void; visible: string[] }) {
  const wrapper = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => { if (!wrapper.current?.contains(event.target as Node)) setOpen(false); };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('pointerdown', onPointerDown); document.removeEventListener('keydown', onKeyDown); };
  }, [open, setOpen]);

  const groups = [
    ['PRODUCTION', layers.filter((layer) => layer.kind === 'production')],
    ['FULFILLMENT', layers.filter((layer) => layer.kind === 'delivery' || layer.kind === 'customer_pickup')],
    ['OTHER', layers.filter((layer) => !['production', 'delivery', 'customer_pickup'].includes(layer.kind))],
  ] as const;
  return <div className="calendar-layers" ref={wrapper}>
    <button aria-expanded={open} className="calendar-toolbar-button" onClick={() => setOpen(!open)} type="button">Layers</button>
    {open ? <div className="calendar-layers-menu">
      {groups.map(([label, groupLayers]) => <fieldset key={label}><legend>{label}</legend>{groupLayers.map((layer) => <label data-unavailable={!layer.available || undefined} key={layer.key}><input checked={layer.available && visible.includes(layer.key)} disabled={!layer.available} onChange={() => toggle(layer.key)} type="checkbox"/><span>{layer.label}</span>{!layer.available ? <small>Later</small> : null}</label>)}</fieldset>)}
    </div> : null}
  </div>;
}

function ExpandedProductionCard({ calendarWeek, card, canDrag, canInteract, canOpenJobs, dropPosition, highlighted, onComplete, onDetails, onDragEnd, onDragStart, onReopen, pending }: { calendarWeek: string; card: ProductionBoardCard; canDrag: boolean; canInteract: boolean; canOpenJobs: boolean; dropPosition: 'before' | 'after' | null; highlighted: boolean; onComplete: () => void; onDetails: () => void; onDragEnd: () => void; onDragStart: (event: React.DragEvent<HTMLElement>) => void; onReopen: () => void; pending: boolean }) {
  const color = salespersonColor(card.salesperson);
  const completed = card.completedAt !== null;
  const blocked = !canInteract || pending || getProductionScheduleCompletionBlockReason(card, false) !== null;
  return <div className="calendar-expanded-production" data-booking-id={card.bookingId} data-completed={completed || undefined} data-drop-position={dropPosition ?? undefined} data-highlighted={highlighted || undefined} draggable={canDrag || undefined} id={bookingElementId(card.bookingId)} onDragEnd={onDragEnd} onDragStart={onDragStart} style={{ backgroundColor: color.background, color: color.foreground }} onClick={(event) => event.stopPropagation()}>
    <span aria-hidden="true" className="calendar-drag-handle" title="Drag Production booking">⋮⋮</span>
    <div className="calendar-expanded-info"><strong>{card.customer?.trim() || card.title?.trim() || 'Untitled'}</strong><span>{card.shopHoursKnown ? `${formatHours(card.shopHours ?? 0)} hrs` : '◷ TBD'} · {card.jobId?.trim() || 'Unlinked'}</span></div>
    <button disabled={blocked} onClick={completed ? onReopen : onComplete} type="button">{pending ? 'Saving…' : completed ? 'Reopen' : 'Complete'}</button>
    {card.internalJobId && canOpenJobs ? <Link href={jobHref(card.internalJobId, calendarWeek)}>Open Job</Link> : null}
    <button aria-label={`More details for ${card.customer?.trim() || card.title}`} onClick={onDetails} type="button">•••</button>
  </div>;
}

function ProductionDetailPanel({ calendarWeek, canOpenJobs, card, onClose, position, setPosition, workspaceRef }: { calendarWeek: string; canOpenJobs: boolean; card: ProductionBoardCard; onClose: () => void; position: { x: number; y: number } | null; setPosition: (position: { x: number; y: number }) => void; workspaceRef: React.RefObject<HTMLDivElement | null> }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const dragOffset = useRef<{ x: number; y: number } | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  const clamp = (next: { x: number; y: number }) => {
    const workspace = workspaceRef.current?.getBoundingClientRect();
    const panel = panelRef.current?.getBoundingClientRect();
    if (!workspace || !panel) return next;
    return clampCalendarDetailPosition(next, panel, workspace, { width: window.innerWidth, height: window.innerHeight });
  };
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const onPointerDown = (event: PointerEvent) => {
      if (panel.contains(event.target as Node)) return;
      event.preventDefault();
      event.stopPropagation();
      onCloseRef.current();
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onCloseRef.current(); };
    const onResize = () => {
      const workspace = workspaceRef.current?.getBoundingClientRect();
      const bounds = panel.getBoundingClientRect();
      if (!workspace) return;
      setPosition(clampCalendarDetailPosition({ x: bounds.left, y: bounds.top }, bounds, workspace, { width: window.innerWidth, height: window.innerHeight }));
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);
    onResize();
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
    };
  }, [card.bookingId, setPosition, workspaceRef]);
  const move = (event: React.PointerEvent<HTMLElement>) => {
    if (!dragOffset.current) return;
    setPosition(clamp({ x: event.clientX - dragOffset.current.x, y: event.clientY - dragOffset.current.y }));
  };
  return <aside className="calendar-detail-panel" ref={panelRef} style={position ? { left: position.x, top: position.y } : undefined}>
    <header onPointerDown={(event) => { if ((event.target as HTMLElement).closest('button')) return; const panel = panelRef.current?.getBoundingClientRect(); if (!panel) return; dragOffset.current = { x: event.clientX - panel.left, y: event.clientY - panel.top }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={move} onPointerUp={(event) => { dragOffset.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}>
      <strong>Production details</strong><button aria-label="Close Production details" onClick={onClose} type="button">×</button>
    </header>
    <dl>
      <Detail label="Customer / name" value={card.customer?.trim() || card.title?.trim() || 'Untitled'}/>
      <Detail label="Sales Order" value={card.jobId?.trim() || 'Unlinked'}/>
      <Detail label="Salesperson" value={card.salesperson?.trim() || 'Unassigned'}/>
      <Detail label="Shop Hours" value={card.shopHoursKnown ? formatHours(card.shopHours ?? 0) : 'TBD'}/>
      <Detail label="Production date" value={card.productionDate ? formatSearchDate(card.productionDate) : 'Needs Attention'}/>
      <Detail label="Completion" value={card.completedAt ? 'Completed' : 'Open'}/>
      <Detail label="Link status" value={card.type === 'doorgo_linked' ? 'Legacy DoorGo-linked' : 'Unlinked'}/>
    </dl>
    {card.internalJobId && canOpenJobs ? <Link className="calendar-detail-job-link" href={jobHref(card.internalJobId, calendarWeek)}>Open Job</Link> : null}
  </aside>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function QuickAddPicker({ date, onClose }: { date: string; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node)) { event.preventDefault(); event.stopPropagation(); onClose(); }
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('pointerdown', onPointerDown, true); document.removeEventListener('keydown', onKeyDown); };
  }, [onClose]);
  return <div className="calendar-floating-backdrop"><div className="calendar-quick-add" ref={panel} role="dialog" aria-label={`Add to ${formatSearchDate(date)}`}><header><strong>Add to {formatSearchDate(date)}</strong><button aria-label="Close Add picker" onClick={onClose} type="button">×</button></header>{['Production', 'Delivery', 'Customer Pickup', 'Staff Away', 'Note'].map((option) => <button disabled key={option} title={`${option} persistence is not available in this pass`} type="button"><span>{option}</span><small>Later</small></button>)}</div></div>;
}

// Retained for the historical reason-based schedule workflow; Calendar no longer renders it.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ReopenPanel({ state, onCancel, onChange, onSubmit }: { state: ReopenState; onCancel: () => void; onChange: (reason: string) => void; onSubmit: () => void }) {
  return <div className="calendar-floating-backdrop"><form className="calendar-reopen-panel" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}><h2>Reopen production booking?</h2><p>Reopening preserves its Production date and position.</p><label><span>Reason</span><textarea autoFocus disabled={state.pending} maxLength={500} onChange={(event) => onChange(event.target.value)} value={state.reason}/></label>{state.error ? <p role="alert">{state.error}</p> : null}<footer><button disabled={state.pending} onClick={onCancel} type="button">Cancel</button><button disabled={state.pending} type="submit">{state.pending ? 'Reopening…' : 'Reopen'}</button></footer></form></div>;
}

function ExceptionalMovePanel({ state, onCancel, onChange, onSubmit }: { state: CalendarMoveState; onCancel: () => void; onChange: (changes: Partial<CalendarMoveState>) => void; onSubmit: () => void }) {
  return <div className="calendar-floating-backdrop"><form className="calendar-move-panel" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}><h2>{state.undoing ? 'Confirm undo move' : state.destinationDate ? `Move to ${formatSearchDate(state.destinationDate)}` : 'Move to Needs Attention'}</h2>
    {state.requiresAcknowledgement ? <label className="calendar-move-check"><input checked={state.acknowledged} disabled={state.pending} onChange={(event) => onChange({ acknowledged: event.target.checked })} type="checkbox"/><span>Confirm the whole booking is safe to move for this today/past exception.</span></label> : null}
    {state.requiresClosedOverride ? <label className="calendar-move-check"><input checked={state.closedAcknowledged} disabled={state.pending} onChange={(event) => onChange({ closedAcknowledged: event.target.checked })} type="checkbox"/><span>Confirm scheduling Production on this closed date.</span></label> : null}
    {state.requiresBackdateReason ? <label><span>Backdate reason</span><textarea autoFocus disabled={state.pending} maxLength={500} onChange={(event) => onChange({ reason: event.target.value })} value={state.reason}/></label> : null}
    {state.error ? <p role="alert">{state.error}</p> : null}
    <footer><button disabled={state.pending} onClick={onCancel} type="button">Cancel</button><button disabled={state.pending} type="submit">{state.pending ? 'Moving…' : state.undoing ? 'Undo move' : 'Move'}</button></footer>
  </form></div>;
}

function CalendarProductionCard({ card, canDrag, dropPosition, highlighted, onDragEnd, onDragStart }: { card: ProductionBoardCard; canDrag: boolean; dropPosition: 'before' | 'after' | null; highlighted: boolean; onDragEnd: () => void; onDragStart: (event: React.DragEvent<HTMLElement>) => void }) {
  const color = salespersonColor(card.salesperson);
  const text = calendarProductionCardText(card);
  const completed = card.completedAt !== null;
  return <div className="calendar-production-card" data-booking-id={card.bookingId} data-completed={completed || undefined} data-drop-position={dropPosition ?? undefined} data-highlighted={highlighted || undefined} draggable={canDrag || undefined} id={bookingElementId(card.bookingId)} onDragEnd={onDragEnd} onDragStart={onDragStart} style={{ backgroundColor: color.background, color: color.foreground }} title={text}>
    <span className="calendar-production-card-text">{text}</span>
    {completed ? <span aria-label="Completed" className="calendar-completion-cue">✓</span> : null}
  </div>;
}

function ToolbarButton({ children, disabled, label, onClick }: { children: React.ReactNode; disabled: boolean; label: string; onClick: () => void }) {
  return <button aria-label={label} className="calendar-toolbar-button" disabled={disabled} onClick={onClick} type="button">{children}</button>;
}

function formatDay(dateText: string): string {
  const [year, month, day] = dateText.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day))).toLocaleUpperCase();
}

function formatSearchDate(dateText: string): string {
  const [year, month, day] = dateText.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day)));
}

function bookingElementId(bookingId: string): string {
  return `calendar-booking-${bookingId}`;
}

function searchResultId(bookingId: string): string {
  return `calendar-search-result-${bookingId}`;
}

function jobHref(internalJobId: string, calendarWeek: string): string {
  return `/jobs/${encodeURIComponent(internalJobId)}/edit?returnTo=${encodeURIComponent(`/calendar?week=${calendarWeek}`)}`;
}

function formatHours(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function calendarWeekGridStyle(dates: string[], expandedDate: string | null): React.CSSProperties | undefined {
  if (!expandedDate || !dates.includes(expandedDate)) return undefined;
  return { gridTemplateColumns: dates.map((date) => date === expandedDate ? '1.7fr' : '1fr').join(' ') };
}

function createSecureCommandId(): string {
  return crypto.randomUUID();
}
