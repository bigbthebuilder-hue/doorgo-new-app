'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { AppConfirmationToast, type AppConfirmationToastMessage } from '@/components/AppConfirmationToast';
import type { ProductionBoardCard, ProductionBoardViewModel } from '@/lib/production-board/types';
import { addDaysToDateOnly, getMondayForDate } from '@/lib/production-board/date-utils';
import { completeCalendarProductionBooking, loadCalendarWindow, placeCalendarProductionBooking, reloadCalendarProductionDays, reopenCalendarProductionBooking } from '@/lib/production-bookings/calendar-production-actions';
import { createCalendarItem, deleteCalendarItem, moveCalendarItem, reorderCalendarItems, searchCalendarLinkableJobs, searchScheduledCalendar, setCalendarItemCompletion, type CalendarCreateInput, type CalendarSearchTarget } from '@/lib/calendar/calendar-item-actions';
import type {CalendarJobOption} from '@/lib/calendar/calendar-job-linking';
import {calendarOperationalBounds,dateWithinCalendarBounds,mergeContinuousCalendarBoards,nextCalendarChunk,preservedPrependScrollTop} from '@/lib/calendar/continuous-range';
import { AddBackorderDialog } from '@/components/calendar/AddBackorderDialog';
import { completeFulfillmentOrders, deleteFulfillmentBackorder, moveFulfillmentOrder, setFulfillmentOrderDispositions } from '@/lib/calendar/fulfillment-actions';
import { calendarItemLayerKey, calendarRecordKey, removeCalendarCardLocally, replaceCalendarCardLocally } from '@/lib/calendar/calendar-items';
import { getProductionScheduleCompletionBlockReason } from '@/lib/production-schedule/completion-ui-contract';
import { getProductionScheduleCardMoveBlockReason } from '@/lib/production-schedule/move-ui-contract';
import { clampCalendarDetailPosition, getCalendarMoveRequirements, insertCalendarCardLocally, needsAttentionDismissal, placeCalendarBookingLocally, reorderBookingIds, reorderCalendarDayLocally, resolveExpandedCalendarInteraction } from '@/lib/calendar/interaction';
import {
  buildCalendarLayers,
  calendarCapacityLabel,
  calendarMonthSegments,
  calendarCardColor,
  calendarCardText,
  needsAttentionToolbarModel,
  searchCalendarCards,
  calendarItemTypeLabel,
  dedupeCalendarRecords,
  type CalendarLayer,
} from '@/lib/calendar/presentation';

type ReopenState = { card: ProductionBoardCard; reason: string; pending: boolean; error: string | null };
type CalendarDropTarget = { date: string; targetId: string | null; before: boolean };
type CalendarMoveState = {
  card: ProductionBoardCard;
  destinationDate: string | null;
  sourceOrder: string[];
  requiresClosedOverride: boolean;
  closedAcknowledged: boolean;
  pending: boolean;
  error: string | null;
  undoing: boolean;
};
type CalendarUndo = { bookingId: string; fromDate: string | null; toDate: string | null; sourceOrder: string[] };
type CalendarSearchOption={kind:'card';card:ProductionBoardCard}|{kind:'target';target:CalendarSearchTarget};

type WorkspaceProps={board:ProductionBoardViewModel;canAddBackorders:boolean;canInteract:boolean;canManageProduction:boolean;canOpenJobs:boolean;currentMonday:string;defaultSalesperson:string;initialTargetMonday:string;preferenceOwner:string;today:string};
export function CalendarWorkspace(props: WorkspaceProps) {
  return <CalendarWorkspaceSession {...props} key={JSON.stringify(props.board)}/>;
}

function CalendarWorkspaceSession({ board, canAddBackorders, canInteract, canManageProduction, canOpenJobs, currentMonday, defaultSalesperson, initialTargetMonday, preferenceOwner, today }: WorkspaceProps) {
  const [displayBoard, setDisplayBoard] = useState(board);
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [remoteSearchResults,setRemoteSearchResults]=useState<CalendarSearchTarget[]>([]);
  const [highlightedResult, setHighlightedResult] = useState(0);
  const [highlightedBookingId, setHighlightedBookingId] = useState<string | null>(null);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [detailBookingId, setDetailBookingId] = useState<string | null>(null);
  const [detailPosition, setDetailPosition] = useState<{ x: number; y: number } | null>(null);
  const [quickAdd, setQuickAdd] = useState<{date:string|null}|null>(null);
  const [completionPendingId, setCompletionPendingId] = useState<string | null>(null);
  const [moveState, setMoveState] = useState<CalendarMoveState | null>(null);
  const [dropTarget, setDropTarget] = useState<CalendarDropTarget | null>(null);
  const [moveUndo, setMoveUndo] = useState<CalendarUndo | null>(null);
  const [dragBusy, setDragBusy] = useState(false);
  const [toast, setToast] = useState<AppConfirmationToastMessage | null>(null);
  const [layersOpen, setLayersOpen] = useState(false);
  const [needsAttentionOpen, setNeedsAttentionOpen] = useState(false);
  const [needsAttentionDropReady, setNeedsAttentionDropReady] = useState(false);
  const [partialCompletion,setPartialCompletion]=useState<ProductionBoardCard|null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const streamRef=useRef<HTMLElement>(null);
  const rangeLoadRef=useRef<Promise<ProductionBoardViewModel|null>|null>(null);
  const initialScrollDone=useRef(false);
  const searchWrapper = useRef<HTMLDivElement>(null);
  const needsAttentionWrapper = useRef<HTMLDivElement>(null);
  const highlightTimer = useRef<number | null>(null);
  const toastId = useRef(0);
  const draggedCard = useRef<ProductionBoardCard | null>(null);
  const draggedOrder=useRef<{source:ProductionBoardCard;salesOrder:string}|null>(null);
  const consumeOutsideCalendarClick = useRef(false);
  useEffect(()=>{const clear=()=>{draggedOrder.current=null;};document.addEventListener('dragend',clear);return()=>document.removeEventListener('dragend',clear);},[]);
  const allCards = useMemo(() => [...displayBoard.days.flatMap((day) => day.cards), ...displayBoard.needsAttentionCards], [displayBoard.days, displayBoard.needsAttentionCards]);
  const layers = useMemo(() => buildCalendarLayers(allCards), [allCards]);
  const availableKeys = useMemo(() => layers.filter((layer) => layer.available).map((layer) => layer.key), [layers]);
  const [visibleLayers, setVisibleLayers] = useState<string[]>(availableKeys);
  const layerStorageKey = `doorgo.calendar.visible-layers.v1:${preferenceOwner}`;
  const searchResults = useMemo(() => dedupeCalendarRecords(searchCalendarCards(allCards, search)), [allCards, search]);
  const searchOptions=useMemo<CalendarSearchOption[]>(()=>[...searchResults.map((card)=>({kind:'card' as const,card})),...remoteSearchResults.filter((target)=>!allCards.some((card)=>card.bookingId===target.bookingId)).map((target)=>({kind:'target' as const,target}))],[allCards,remoteSearchResults,searchResults]);
  const activeSearchOption=searchOptions[Math.min(highlightedResult,searchOptions.length-1)];
  const activeSearchId=activeSearchOption?(activeSearchOption.kind==='card'?activeSearchOption.card.bookingId:activeSearchOption.target.bookingId):undefined;
  const detailCard = detailBookingId ? allCards.find((card) => card.bookingId === detailBookingId) ?? null : null;
  const bounds=useMemo(()=>calendarOperationalBounds(today),[today]);
  const [navigationMonday,setNavigationMonday]=useState(currentMonday);

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

  useEffect(()=>{const query=search.trim();if(!query){return;}let cancelled=false;const timer=window.setTimeout(()=>{void searchScheduledCalendar({query}).then((result)=>{if(!cancelled&&result.ok)setRemoteSearchResults(result.targets);});},250);return()=>{cancelled=true;window.clearTimeout(timer);};},[search]);

  useEffect(() => {
    if (!needsAttentionOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (needsAttentionWrapper.current?.contains(event.target as Node)) return;
      const decision=needsAttentionDismissal((event.target as HTMLElement).closest('.calendar-stream')?'calendar':'toolbar');
      if (decision.close) setNeedsAttentionOpen(false);
      if (decision.consume) {
        consumeOutsideCalendarClick.current = true;
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setNeedsAttentionOpen(false); };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('pointerdown', onPointerDown, true); document.removeEventListener('keydown', onKeyDown); };
  }, [needsAttentionOpen]);

  const fetchChunk=async(base:ProductionBoardViewModel,direction:'prepend'|'append',preserveAnchor:boolean)=>{const request=nextCalendarChunk(base,direction,bounds);if(!request)return base;if(rangeLoadRef.current)return rangeLoadRef.current;const stream=streamRef.current;const beforeHeight=stream?.scrollHeight??0;const beforeTop=stream?.scrollTop??0;const task=loadCalendarWindow({boardStart:request.startDate,boardEndExclusive:request.endDateExclusive,weeks:request.weeks,today}).then((result)=>{if(!result.ok)return null;const merged=mergeContinuousCalendarBoards(base,result.board);setDisplayBoard((current)=>mergeContinuousCalendarBoards(current,result.board));if(direction==='prepend'&&preserveAnchor&&stream)window.requestAnimationFrame(()=>{stream.scrollTop=preservedPrependScrollTop(beforeTop,beforeHeight,stream.scrollHeight);});return merged;}).finally(()=>{rangeLoadRef.current=null;});rangeLoadRef.current=task;return task;};
  const ensureDateLoaded=async(date:string,preserveAnchor=false)=>{if(!dateWithinCalendarBounds(date,bounds))return null;let loaded=displayBoard;while(date<loaded.startDate){const next=await fetchChunk(loaded,'prepend',preserveAnchor);if(!next||next===loaded)break;loaded=next;}while(date>=loaded.endDateExclusive){const next=await fetchChunk(loaded,'append',false);if(!next||next===loaded)break;loaded=next;}return loaded;};
  const scrollToWeek=(monday:string,behavior:ScrollBehavior='smooth')=>{setNavigationMonday(monday);window.history.replaceState({},'',`/calendar?week=${encodeURIComponent(monday)}`);window.requestAnimationFrame(()=>streamRef.current?.querySelector<HTMLElement>(`[data-calendar-week="${monday}"]`)?.scrollIntoView({behavior,block:'start'}));};
  const navigate = (monday: string) => startTransition(async()=>{const clamped=monday<bounds.minimumMonday?bounds.minimumMonday:monday>=bounds.maximumEndExclusive?addDaysToDateOnly(bounds.maximumEndExclusive,-7):monday;const loaded=await ensureDateLoaded(clamped);if(loaded)scrollToWeek(clamped);});

  // The initial anchor is intentionally a one-time session action; subsequent navigation is user-driven.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(()=>{if(initialScrollDone.current)return;initialScrollDone.current=true;const target=dateWithinCalendarBounds(initialTargetMonday,bounds)?initialTargetMonday:currentMonday;window.setTimeout(()=>navigate(target),0);},[bounds,currentMonday,initialTargetMonday]);
  const toggleLayer = (key: string) => setVisibleLayers((current) => {
    const next = current.includes(key) ? current.filter((item) => item !== key) : [...current, key];
    window.localStorage.setItem(layerStorageKey, JSON.stringify(next));
    return next;
  });
  const selectSearchResult = (card: ProductionBoardCard) => {
    const layerKey = calendarItemLayerKey(card);
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
    }
    window.setTimeout(() => {
      document.getElementById(bookingElementId(card.bookingId))?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 0);
    if (highlightTimer.current !== null) window.clearTimeout(highlightTimer.current);
    highlightTimer.current = window.setTimeout(() => setHighlightedBookingId(null), 2200);
  };
  const selectSearchTarget=(target:CalendarSearchTarget)=>{if(!dateWithinCalendarBounds(target.productionDate,bounds)){announce('error','This item exists outside the operational Calendar range.');setSearchOpen(false);return;}startTransition(async()=>{const loaded=await ensureDateLoaded(target.productionDate);if(!loaded)return;scrollToWeek(getMondayForDate(target.productionDate));const card=[...loaded.days.flatMap((day)=>day.cards),...loaded.needsAttentionCards].find((item)=>item.bookingId===target.bookingId);if(card)window.setTimeout(()=>selectSearchResult(card),0);});};
  const onSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setSearchOpen(false);
      return;
    }
    if (!searchOptions.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setSearchOpen(true);
      setHighlightedResult((current) => event.key === 'ArrowDown'
        ? (current + 1) % searchOptions.length
        : (current - 1 + searchOptions.length) % searchOptions.length);
      return;
    }
    if (event.key === 'Enter' && searchOpen) {
      event.preventDefault();
      const option=searchOptions[Math.min(highlightedResult,searchOptions.length-1)];if(option.kind==='card')selectSearchResult(option.card);else selectSearchTarget(option.target);
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
       cards: day.cards.map((card) => card.bookingId === bookingId ? { ...card, completedAt,revision:(card.revision??0)+1 } : card),
    }));
    setDisplayBoard((current) => ({
      ...current,
      days: updateDays(current.days),
       needsAttentionCards:current.needsAttentionCards.map((card)=>card.bookingId===bookingId?{...card,completedAt,revision:(card.revision??0)+1}:card),
       weekGroups: current.weekGroups.map((week) => ({ ...week, days: updateDays(week.days) })),
    }));
  };
  const completeCard = async (card: ProductionBoardCard) => {
    if (!canInteract || completionPendingId) return;
    if(card.recordKind==='calendar_item'){
      if(card.calendarItemType!=='note'&&(card.includedOrders?.length??0)>0){setPartialCompletion(card);return;}
      setCompletionPendingId(card.bookingId);const result=await setCalendarItemCompletion({commandId:createSecureCommandId(),itemId:card.bookingId.slice(5),expectedRevision:card.revision??0,completed:true});setCompletionPendingId(null);
      if(!result.ok){announce('error',result.message);return;}updateCompletionLocally(card.bookingId,new Date().toISOString());announce('success','Calendar item marked complete.');return;
    }
    if(!canManageProduction||getProductionScheduleCompletionBlockReason(card,false))return;
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
    if(card.recordKind==='calendar_item'){
      setCompletionPendingId(card.bookingId);const result=await setCalendarItemCompletion({commandId:createSecureCommandId(),itemId:card.bookingId.slice(5),expectedRevision:card.revision??0,completed:false});setCompletionPendingId(null);
      if(!result.ok){announce('error',result.message);return;}updateCompletionLocally(card.bookingId,null);announce('success','Calendar item reopened.');return;
    }
    if(!canManageProduction)return;
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
    if (snapshot.requiresClosedOverride && !snapshot.closedAcknowledged) {
      setMoveState({ ...snapshot, error: 'Confirm the required acknowledgement before moving.' });
      return;
    }
    const before = displayBoard;
    const optimistic = placeCalendarBookingLocally(before, snapshot.card.bookingId, snapshot.destinationDate);
    setDisplayBoard(optimistic);
    setMoveState((current) => current ? { ...current, pending: true, error: null } : current);
    setDragBusy(true);
    const result = snapshot.card.recordKind==='calendar_item'
      ? await moveCalendarItem({commandId:createSecureCommandId(),itemId:snapshot.card.bookingId.slice(5),expectedRevision:snapshot.card.revision??0,destinationDate:snapshot.destinationDate,closedAcknowledged:snapshot.closedAcknowledged})
      : await placeCalendarProductionBooking({commandId:createSecureCommandId(),bookingId:snapshot.card.bookingId,expectedProductionDate:snapshot.card.productionDate,destinationProductionDate:snapshot.destinationDate,
        whollyUnstartedAcknowledged:false,backdateReason:null,closedDateOverrideAcknowledged:snapshot.requiresClosedOverride?snapshot.closedAcknowledged:false});
    setDragBusy(false);
    if (!result.ok) {
      setDisplayBoard(before);
      setMoveState((current) => current ? { ...current, pending: false, error: result.message } : current);
      announce('error', result.message);
      if (['stale_booking','stale_item','not_found'].includes(result.code)) void reconcileDays([snapshot.card.productionDate, snapshot.destinationDate].filter((date): date is string => date !== null));
      if (['stale_booking','stale_item','not_found','ineligible_booking','completed_item','permission_required'].includes(result.code)) setMoveState(null);
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
    const byId=new Map(day.cards.map((card)=>[card.bookingId,card]));
    const result = await reorderCalendarItems({ scheduledDate: date, expectedKeys:currentIds.map((id)=>calendarRecordKey(byId.get(id)!)),orderedKeys:desiredOrder.map((id)=>calendarRecordKey(byId.get(id)!)) });
    if (!result.ok) {
      announce('error', 'The date was restored, but its prior order changed elsewhere. The affected day was reconciled.');
      void reconcileDays([date]);
    } else {
      setDisplayBoard((current)=>reorderCalendarDayLocally(current,date,desiredOrder));
    }
  };
  const beginDateMove = (card: ProductionBoardCard, destinationDate: string | null, sourceOrder: string[], undoing = false) => {
    if (!undoing) setMoveUndo(null);
    const destination = destinationDate ? displayBoard.days.find((day) => day.date === destinationDate) : null;
    if ((destinationDate && !destination) || card.completedAt || (card.recordKind!=='calendar_item'&&(!canManageProduction||getProductionScheduleCardMoveBlockReason(card,false)))) {
      announce('error', 'Reopen this Calendar item before moving it.');
      return;
    }
    const requirements = destinationDate
      ? getCalendarMoveRequirements(card.productionDate ?? destinationDate, destinationDate, today, destination?.isExplicitlyClosed ?? false)
      : { requiresClosedOverride: false };
    const exceptional: CalendarMoveState = {
      card, destinationDate, sourceOrder,
      ...requirements,
      closedAcknowledged: false, pending: false, error: null, undoing,
    };
    if (exceptional.requiresClosedOverride) setMoveState(exceptional);
    else void executeMove(exceptional);
  };
  const reorderDay = async (date: string, draggedId: string, targetId: string, beforeTarget: boolean) => {
    const day = displayBoard.days.find((item) => item.date === date);
    if (!day) return;
    if(!canManageProduction&&day.cards.some((card)=>card.recordKind!=='calendar_item')){announce('error','Production use permission is required to change a mixed day order.');return;}
    const expected = day.cards.map((card) => card.bookingId);
    const ordered = reorderBookingIds(expected, draggedId, targetId, beforeTarget);
    if (ordered === expected || ordered.every((id, index) => id === expected[index])) return;
    const before = displayBoard;
    setDisplayBoard(reorderCalendarDayLocally(before, date, ordered));
    setDragBusy(true);
    const byId=new Map(day.cards.map((card)=>[card.bookingId,card]));
    const result = await reorderCalendarItems({ scheduledDate:date,expectedKeys:expected.map((id)=>calendarRecordKey(byId.get(id)!)),orderedKeys:ordered.map((id)=>calendarRecordKey(byId.get(id)!)) });
    setDragBusy(false);
    if (!result.ok) {
      setDisplayBoard(before);
      announce('error', result.message);
      if (result.code === 'stale_order') void reconcileDays([date]);
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
    if (consumeOutsideCalendarClick.current || !canInteract || dragBusy || card.locked || card.completedAt || (card.recordKind!=='calendar_item'&&!canManageProduction)) { event.preventDefault(); return; }
    draggedCard.current = card;
    if (card.productionDate !== null) {
      setNeedsAttentionDropReady(true);
    }
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', card.bookingId);
  };
  const onDayDragOver = (date: string, event: React.DragEvent<HTMLElement>) => {
    if ((!draggedCard.current&&!draggedOrder.current) || dragBusy) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-booking-id]');
    const targetId = target?.dataset.bookingId ?? null;
    const before = target ? event.clientY < target.getBoundingClientRect().top + target.getBoundingClientRect().height / 2 : false;
    setDropTarget((current) => current?.date === date && current.targetId === targetId && current.before === before ? current : { date, targetId, before });
  };
  const onDayDrop = (date: string, event: React.DragEvent<HTMLElement>) => {
    const orderDrag=draggedOrder.current;if(orderDrag){event.preventDefault();draggedOrder.current=null;const target=(event.target as HTMLElement).closest<HTMLElement>('[data-booking-id]')?.dataset.bookingId;setDragBusy(true);void moveFulfillmentOrder({commandId:createSecureCommandId(),sourceItemId:orderDrag.source.bookingId.slice(5),salesOrder:orderDrag.salesOrder,destinationDate:date,destinationItemId:target?.startsWith('item:')?target.slice(5):null}).then((result)=>{setDragBusy(false);if(!result.ok){announce('error',result.message);return;}announce('success',`${orderDrag.salesOrder} moved.`);void reconcileDays([orderDrag.source.productionDate,date].filter((value):value is string=>Boolean(value)));});return;}
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
  const onCardDragEnd = () => { draggedCard.current = null;draggedOrder.current=null; setDropTarget(null); setNeedsAttentionDropReady(false); };
  const needsAttentionModel = needsAttentionToolbarModel(displayBoard.needsAttentionCards, visibleLayers);
  const visibleNeedsAttention = needsAttentionModel.visibleCards;
  const onNeedsAttentionDrop = (event: React.DragEvent<HTMLElement>) => {
    const orderDrag=draggedOrder.current;if(orderDrag){event.preventDefault();draggedOrder.current=null;setDragBusy(true);void moveFulfillmentOrder({commandId:createSecureCommandId(),sourceItemId:orderDrag.source.bookingId.slice(5),salesOrder:orderDrag.salesOrder,destinationDate:null,destinationItemId:null}).then((result)=>{setDragBusy(false);if(!result.ok){announce('error',result.message);return;}announce('success',`${orderDrag.salesOrder} moved to Needs Attention.`);void reconcileDays([orderDrag.source.productionDate].filter((value):value is string=>Boolean(value)));});return;}
    const card = draggedCard.current;
    if (!card) return;
    event.preventDefault();
    draggedCard.current = null;
    setDropTarget(null);
    setNeedsAttentionDropReady(false);
    if (card.productionDate === null) {
      const target=(event.target as HTMLElement).closest<HTMLElement>('[data-booking-id]');
      const targetId=target?.dataset.bookingId;
      if(!targetId||targetId===card.bookingId)return;
      if(!canManageProduction&&displayBoard.needsAttentionCards.some((item)=>item.recordKind!=='calendar_item')){announce('error','Production use permission is required to change mixed Needs Attention ordering.');return;}
      const expected=displayBoard.needsAttentionCards.map((item)=>item.bookingId);
      const ordered=reorderBookingIds(expected,card.bookingId,targetId,event.clientY<target.getBoundingClientRect().top+target.getBoundingClientRect().height/2);
      setDisplayBoard((current)=>({...current,needsAttentionCards:ordered.map((id,index)=>{const item=current.needsAttentionCards.find((card)=>card.bookingId===id)!;return {...item,dayOrder:(index+1)*1024,revision:item.recordKind==='calendar_item'?(item.revision??0)+1:item.revision};})}));
       const byId=new Map(displayBoard.needsAttentionCards.map((item)=>[item.bookingId,item]));
       setDragBusy(true); void reorderCalendarItems({scheduledDate:null,expectedKeys:expected.map((id)=>calendarRecordKey(byId.get(id)!)),orderedKeys:ordered.map((id)=>calendarRecordKey(byId.get(id)!))}).then((result)=>{setDragBusy(false);if(!result.ok){announce('error',result.message);void reconcileDays([]);}});
      return;
    }
    const source = displayBoard.days.find((day) => day.date === card.productionDate);
    beginDateMove(card, null, source?.cards.map((item) => item.bookingId) ?? []);
  };

  return <div className="calendar-workspace" ref={workspaceRef}>
    <header className="calendar-toolbar" aria-label="Calendar controls" onPointerDownCapture={() => {
      const decision = resolveExpandedCalendarInteraction(expandedDate, { kind: 'toolbar' });
      if (decision.collapse) setExpandedDate(null);
    }} onPointerDown={(event) => { if (!(event.target as HTMLElement).closest('.calendar-needs-attention-toolbar')) setNeedsAttentionOpen(false); }}>
      <div className="calendar-toolbar-cluster" aria-label="Calendar date navigation">
        <ToolbarButton label="Previous month" disabled={pending||navigationMonday<=bounds.minimumMonday} onClick={() => navigate(addDaysToDateOnly(navigationMonday, -28))}>&lsaquo;</ToolbarButton>
        <ToolbarButton label="Current week" disabled={pending || navigationMonday === currentMonday} onClick={() => navigate(currentMonday)}>Today</ToolbarButton>
        <ToolbarButton label="Next month" disabled={pending||navigationMonday>=addDaysToDateOnly(bounds.maximumEndExclusive,-7)} onClick={() => navigate(addDaysToDateOnly(navigationMonday, 28))}>&rsaquo;</ToolbarButton>
      </div>
      <div className="calendar-search" ref={searchWrapper} onBlur={() => window.setTimeout(() => { if (!searchWrapper.current?.contains(document.activeElement)) setSearchOpen(false); }, 0)}>
        <label><span className="sr-only">Search by name or sales order</span><input aria-activedescendant={searchOpen&&activeSearchId?searchResultId(activeSearchId):undefined} aria-autocomplete="list" aria-controls="calendar-search-results" aria-expanded={searchOpen} onChange={(event) => { const value = event.target.value; setSearch(value);if(!value.trim())setRemoteSearchResults([]); setHighlightedResult(0); setSearchOpen(Boolean(value.trim())); }} onFocus={() => { setExpandedDate(null); setNeedsAttentionOpen(false); setSearchOpen(Boolean(search.trim())); }} onKeyDown={onSearchKeyDown} placeholder="Name / SO Search" role="combobox" type="search" value={search}/></label>
        {searchOpen ? <div className="calendar-search-results" id="calendar-search-results" role="listbox">
          {/* React's refs rule cannot trace that these callbacks run only from click events. */}
          {/* eslint-disable-next-line react-hooks/refs */}
          {searchOptions.length ? searchOptions.map((option,index)=>option.kind==='card'?<button aria-selected={index===highlightedResult} className="calendar-search-result" id={searchResultId(option.card.bookingId)} key={option.card.bookingId} onClick={()=>selectSearchResult(option.card)} onMouseDown={(event)=>event.preventDefault()} role="option" type="button"><span>{option.card.customer?.trim()||option.card.title?.trim()||'Untitled'}</span><small>{option.card.jobId?.trim()||'Unlinked'} · {calendarItemTypeLabel(option.card)} · {option.card.productionDate?formatSearchDate(option.card.productionDate):'Needs Attention'}</small></button>:<button aria-selected={index===highlightedResult} className="calendar-search-result" id={searchResultId(option.target.bookingId)} key={option.target.bookingId} onClick={()=>selectSearchTarget(option.target)} onMouseDown={(event)=>event.preventDefault()} role="option" type="button"><span>{option.target.customer}</span><small>{option.target.jobId?.trim()||'Unlinked'} · {searchTargetTypeLabel(option.target.calendarItemType)} · {formatSearchDate(option.target.productionDate)}</small></button>) : <p className="calendar-search-empty">No Calendar matches.</p>}
        </div> : null}
      </div>
      <LayersPicker layers={layers} open={layersOpen} setOpen={setLayersOpen} toggle={toggleLayer} visible={visibleLayers}/>
      <NeedsAttentionToolbar calendarWeek={displayBoard.startDate} canInteract={canInteract} canManageProduction={canManageProduction} canOpenJobs={canOpenJobs} cards={visibleNeedsAttention} count={displayBoard.needsAttentionCards.length} dropReady={needsAttentionDropReady} highlightedBookingId={highlightedBookingId} onAdd={()=>setQuickAdd({date:null})} onDetails={openDetails} onDragEnd={onCardDragEnd} onDragStart={onCardDragStart} onDrop={onNeedsAttentionDrop} onToggle={() => setNeedsAttentionOpen((open) => !open)} open={needsAttentionOpen} wrapperRef={needsAttentionWrapper}/>
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
    }} onPointerUpCapture={() => { window.setTimeout(() => { consumeOutsideCalendarClick.current = false; }, 0); }} onScroll={(event)=>{const stream=event.currentTarget;const top=stream.getBoundingClientRect().top+8;const visible=[...stream.querySelectorAll<HTMLElement>('[data-calendar-week]')].find((week)=>week.getBoundingClientRect().bottom>top);if(visible?.dataset.calendarWeek)setNavigationMonday(visible.dataset.calendarWeek);if(stream.scrollTop<480&&displayBoard.startDate>bounds.minimumMonday)void fetchChunk(displayBoard,'prepend',true);if(stream.scrollHeight-stream.scrollTop-stream.clientHeight<640&&displayBoard.endDateExclusive<bounds.maximumEndExclusive)void fetchChunk(displayBoard,'append',false);}} ref={streamRef}>
      {displayBoard.weekGroups.map((week) => <section className="calendar-week" data-calendar-week={week.startDate} key={week.startDate}>
        <div className="calendar-month-row" aria-hidden="true" style={calendarWeekGridStyle(week.days.map((day) => day.date), expandedDate)}>
          {calendarMonthSegments(week.days.map((day) => day.date)).map((segment) => <span key={`${week.startDate}-${segment.label}`} style={{ gridColumn: `${segment.startColumn} / span ${segment.span}` }}>{segment.label}</span>)}
        </div>
        <div className="calendar-days" style={calendarWeekGridStyle(week.days.map((day) => day.date), expandedDate)}>
          {week.days.map((day) => {
            const cards = day.cards.filter((card) => visibleLayers.includes(calendarItemLayerKey(card)));
            const overloaded = day.capacityKnown && day.availableHours !== null && day.totalKnownShopHours > day.availableHours;
            const expanded = expandedDate === day.date;
            return <article className="calendar-day" data-calendar-date={day.date} data-day-state={day.dateState} data-drop-target={dropTarget?.date === day.date || undefined} data-expanded={expanded || undefined} data-overloaded={overloaded || undefined} key={day.date} onClick={() => {
              const decision = resolveExpandedCalendarInteraction(expandedDate, { kind: 'day', date: day.date, interactiveChild: false });
              if (decision.collapse) setExpandedDate(null);
              else if (decision.interact) setExpandedDate(day.date);
            }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget((current) => current?.date === day.date ? null : current); }} onDragOver={(event) => onDayDragOver(day.date, event)} onDrop={(event) => onDayDrop(day.date, event)}>
              <header className="calendar-day-header">
                <div><strong>{formatDay(day.date)}</strong><span>{calendarCapacityLabel(day)}</span></div>
                <div className="calendar-day-actions">{expanded ? <button onClick={(event) => { event.stopPropagation(); setExpandedDate(null); }} type="button">Close</button> : null}<button onClick={(event) => { event.stopPropagation(); setQuickAdd({date:day.date}); }} type="button">+ Add</button></div>
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
    {detailCard ? <ProductionDetailPanel calendarWeek={displayBoard.startDate} canAddBackorders={canAddBackorders&&canInteract} canDelete={canInteract} canOpenJobs={canOpenJobs} card={detailCard} onCardCreated={(created)=>setDisplayBoard((current)=>insertCalendarCardLocally(current,created))} onCardDeleted={(deleted)=>{setDisplayBoard((current)=>removeCalendarCardLocally(current,deleted.bookingId));setDetailBookingId(null);announce('success','Deleted');void reconcileDays([deleted.productionDate].filter((value):value is string=>Boolean(value)));}} onCardUpdated={(updated)=>setDisplayBoard((current)=>replaceCalendarCardLocally(current,updated))} onClose={() => setDetailBookingId(null)} onOrderDragStart={(salesOrder,event)=>{draggedOrder.current={source:detailCard,salesOrder};setNeedsAttentionDropReady(detailCard.productionDate!==null);event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',`order:${salesOrder}`);}} position={detailPosition} setPosition={setDetailPosition} workspaceRef={workspaceRef}/> : null}
    {partialCompletion?<PartialFulfillmentCompletion card={partialCompletion} onCancel={()=>setPartialCompletion(null)} onSaved={(dates)=>{setPartialCompletion(null);void reconcileDays(dates);}}/>:null}
    {quickAdd ? <QuickAddPicker canManageProduction={canManageProduction} date={quickAdd.date} defaultSalesperson={defaultSalesperson} onClose={() => setQuickAdd(null)} onCreated={(card)=>{setDisplayBoard((current)=>insertCalendarCardLocally(current,card));setQuickAdd(null);announce('success','Calendar item added.');}} today={today}/> : null}
    {moveState ? <ExceptionalMovePanel state={moveState} onCancel={() => { if (!moveState.pending) setMoveState(null); }} onChange={(changes) => setMoveState((current) => current ? { ...current, ...changes, error: null } : current)} onSubmit={() => void executeMove(moveState)}/> : null}
    {moveUndo ? <div className="calendar-move-undo" role="status"><span>{moveUndo.toDate === null ? 'Moved to Needs Attention' : 'Scheduled'}</span><span aria-hidden="true">·</span><button disabled={dragBusy} onClick={beginUndo} type="button">Undo</button></div> : null}
    <AppConfirmationToast message={toast} onDismiss={() => setToast(null)}/>
  </div>;
}

function NeedsAttentionToolbar({ calendarWeek, canInteract, canManageProduction, canOpenJobs, cards, count, dropReady, highlightedBookingId, onAdd, onDetails, onDragEnd, onDragStart, onDrop, onToggle, open, wrapperRef }: {
  calendarWeek:string; canInteract:boolean;canManageProduction:boolean; canOpenJobs:boolean; cards:ProductionBoardCard[]; count:number; dropReady:boolean; highlightedBookingId:string|null;onAdd:()=>void;
  onDetails:(card:ProductionBoardCard)=>void; onDragEnd:()=>void; onDragStart:(card:ProductionBoardCard,event:React.DragEvent<HTMLElement>)=>void;
  onDrop:(event:React.DragEvent<HTMLElement>)=>void; onToggle:()=>void; open:boolean; wrapperRef:React.RefObject<HTMLDivElement|null>;
}) {
  const preview=cards[0]??null;
  return <div className="calendar-needs-attention-toolbar" data-drop-ready={dropReady||undefined} data-empty={!preview||undefined} onDragOver={(event)=>{event.preventDefault();event.dataTransfer.dropEffect='move';}} onDrop={onDrop} ref={wrapperRef}>
    <button aria-expanded={count>0&&open} className="calendar-needs-attention-toggle" onClick={count>0?onToggle:undefined} type="button">Needs Attention · {count}</button>
    {preview?<CalendarProductionCard canDrag={canInteract&&!preview.locked&&!preview.completedAt&&(preview.recordKind==='calendar_item'||canManageProduction)} card={preview} dropPosition={null} highlighted={preview.bookingId===highlightedBookingId} onDragEnd={onDragEnd} onDragStart={(event)=>onDragStart(preview,event)}/>:count>0?<span className="calendar-needs-attention-hidden">Hidden by Layers</span>:null}
    <button className="calendar-needs-attention-add" disabled={!canInteract} onClick={onAdd} type="button">+ Add</button>
    {count>0?<button aria-expanded={open} className="calendar-needs-attention-expand" onClick={onToggle} type="button">{open?'Collapse':'Expand'}</button>:null}
    {open&&count>0?<section aria-label="Needs Attention items" className="calendar-needs-attention-dropdown">
      <div className="calendar-needs-attention-list">
      {cards.length?cards.map((card)=><div className="calendar-needs-attention-item" data-booking-id={card.bookingId} data-completed={card.completedAt!==null||undefined} data-highlighted={card.bookingId===highlightedBookingId||undefined} draggable={canInteract&&!card.locked&&!card.completedAt&&(card.recordKind==='calendar_item'||canManageProduction)||undefined} id={`${bookingElementId(card.bookingId)}-needs-attention`} key={card.bookingId} onDragEnd={onDragEnd} onDragStart={(event)=>onDragStart(card,event)} style={{backgroundColor:calendarCardColor(card).background,color:calendarCardColor(card).foreground}}>
        <span aria-hidden="true" className="calendar-drag-handle">⋮⋮</span><CalendarItemIcon card={card}/><div><strong>{card.customer?.trim()||card.title?.trim()||'Untitled'}</strong><span>{calendarCardText(card)}</span></div>
        {card.completedAt?<span aria-label="Completed">✓</span>:null}{card.internalJobId&&canOpenJobs?<Link href={jobHref(card.internalJobId,calendarWeek)}>Open Job</Link>:null}<button aria-label="More details" onClick={()=>onDetails(card)} type="button">•••</button>
      </div>):<p className="calendar-needs-attention-empty">No visible Needs Attention items.</p>}
      </div>
    </section>:null}
  </div>;
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
  const color = calendarCardColor(card);
  const completed = card.completedAt !== null;
  const blocked = !canInteract || pending || (card.recordKind!=='calendar_item'&&getProductionScheduleCompletionBlockReason(card,false)!==null);
  return <div className="calendar-expanded-production" data-booking-id={card.bookingId} data-completed={completed || undefined} data-drop-position={dropPosition ?? undefined} data-highlighted={highlighted || undefined} draggable={canDrag || undefined} id={bookingElementId(card.bookingId)} onDragEnd={onDragEnd} onDragStart={onDragStart} style={{ backgroundColor: color.background, color: color.foreground }} onClick={(event) => event.stopPropagation()}>
    <span aria-hidden="true" className="calendar-drag-handle" title="Drag Calendar item">⋮⋮</span>
    <CalendarItemIcon card={card}/><div className="calendar-expanded-info"><strong>{card.customer?.trim() || card.title?.trim() || 'Untitled'}</strong><span>{calendarCardText(card)}</span></div>
    <div className="calendar-expanded-actions"><button disabled={blocked} onClick={completed ? onReopen : onComplete} type="button">{pending ? 'Saving…' : completed ? 'Reopen' : 'Complete'}</button>
    {card.internalJobId && canOpenJobs ? <Link href={jobHref(card.internalJobId, calendarWeek)}>Open Job</Link> : null}
    <button aria-label={`More details for ${card.customer?.trim() || card.title}`} onClick={onDetails} type="button">•••</button></div>
  </div>;
}

function ProductionDetailPanel({ calendarWeek, canAddBackorders, canDelete, canOpenJobs, card, onCardCreated, onCardDeleted, onCardUpdated, onClose, onOrderDragStart, position, setPosition, workspaceRef }: { calendarWeek: string; canAddBackorders:boolean;canDelete:boolean; canOpenJobs: boolean; card: ProductionBoardCard; onCardCreated:(card:ProductionBoardCard)=>void;onCardDeleted:(card:ProductionBoardCard)=>void;onCardUpdated:(card:ProductionBoardCard)=>void;onClose: () => void;onOrderDragStart:(salesOrder:string,event:React.DragEvent<HTMLElement>)=>void; position: { x: number; y: number } | null; setPosition: (position: { x: number; y: number }) => void; workspaceRef: React.RefObject<HTMLDivElement | null> }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [sendOrders,setSendOrders]=useState(card.sendOrders??card.includedOrders??[]);const [addingBackorder,setAddingBackorder]=useState(false);const [savingOrders,setSavingOrders]=useState(false);const [deleting,setDeleting]=useState(false);const [orderError,setOrderError]=useState<string|null>(null);
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
  const saveDispositions=async()=>{setSavingOrders(true);setOrderError(null);const result=await setFulfillmentOrderDispositions({commandId:createSecureCommandId(),itemId:card.bookingId.slice(5),expectedRevision:card.revision??0,sendSalesOrders:sendOrders});setSavingOrders(false);if(!result.ok){setOrderError(result.message);return;}onCardUpdated({...card,sendOrders:[...sendOrders].sort(),revision:Number(result.data.revision??(card.revision??0)+1)});};
  const deleteBackorder=async(order:string)=>{if(!window.confirm(`Delete backorder ${order}?`))return;setSavingOrders(true);setOrderError(null);const result=await deleteFulfillmentBackorder({commandId:createSecureCommandId(),itemId:card.bookingId.slice(5),expectedRevision:card.revision??0,salesOrder:order});setSavingOrders(false);if(!result.ok){setOrderError(result.message);return;}const remaining=result.data.remaining_orders as string[];if(result.data.item_deleted){onCardDeleted(card);return;}const nextSend=sendOrders.filter((value)=>value!==order);setSendOrders(nextSend);onCardUpdated({...card,includedOrders:remaining,availableFamilyOrders:(card.availableFamilyOrders??[]).filter((value)=>value!==order),sendOrders:nextSend,revision:Number(result.data.revision)});};
  const remove=async()=>{const label=card.calendarItemType==='customer_pickup'?'Customer Pickup':card.calendarItemType==='delivery'?'Delivery':'Note';if(!window.confirm(`Delete this ${label}?`))return;setDeleting(true);setOrderError(null);const result=await deleteCalendarItem({commandId:createSecureCommandId(),itemId:card.bookingId.slice(5),expectedRevision:card.revision??0});setDeleting(false);if(!result.ok){setOrderError(result.message);return;}onCardDeleted(card);};
  return <aside className="calendar-detail-panel" ref={panelRef} style={position ? { left: position.x, top: position.y } : undefined}>
    <header onPointerDown={(event) => { if ((event.target as HTMLElement).closest('button')) return; const panel = panelRef.current?.getBoundingClientRect(); if (!panel) return; dragOffset.current = { x: event.clientX - panel.left, y: event.clientY - panel.top }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={move} onPointerUp={(event) => { dragOffset.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}>
      <strong>{card.recordKind==='calendar_item'?`${card.calendarItemType==='customer_pickup'?'Customer Pickup':card.calendarItemType==='delivery'?'Delivery':'Note'} details`:'Production details'}</strong><button aria-label="Close Calendar details" onClick={onClose} type="button">×</button>
    </header>
    <dl>
      <Detail label="Customer / name" value={card.customer?.trim() || card.title?.trim() || 'Untitled'}/>
      <Detail label="Sales Order" value={card.jobId?.trim() || 'Unlinked'}/>
      <Detail label="Salesperson" value={card.salesperson?.trim() || 'Unassigned'}/>
      {card.recordKind!=='calendar_item'?<Detail label="Shop Hours" value={card.shopHoursKnown ? formatHours(card.shopHours ?? 0) : 'TBD'}/>:null}
      <Detail label={card.recordKind==='calendar_item'?'Scheduled date':'Production date'} value={card.productionDate ? formatSearchDate(card.productionDate) : 'Needs Attention'}/>
      {card.timing?<Detail label="Timing" value={card.timing}/>:null}
      {card.fulfillmentNote?<Detail label="Fulfillment note" value={card.fulfillmentNote}/>:null}
      {card.details?<Detail label="Details" value={card.details}/>:null}
      <Detail label="Status" value={card.completedAt ? 'Completed' : 'Scheduled'}/>
      <Detail label="Link status" value={card.internalJobId?'DoorGo-linked':'Unlinked'}/>
    </dl>
    {card.recordKind==='calendar_item'&&card.calendarItemType!=='note'&&card.includedOrders?.length?<section className="calendar-included-orders"><strong>Included Orders</strong>{card.includedOrders.map((order)=><div className="calendar-order-disposition" draggable key={order} onDragStart={(event)=>onOrderDragStart(order,event)}><span>{order}</span><div aria-label={`${order} fulfillment disposition`} className="calendar-segmented-control" role="group"><button aria-pressed={sendOrders.includes(order)} disabled={savingOrders||Boolean(card.completedAt)} onClick={()=>setSendOrders((current)=>current.includes(order)?current:[...current,order])} type="button">Send</button><button aria-pressed={!sendOrders.includes(order)} disabled={savingOrders||Boolean(card.completedAt)} onClick={()=>setSendOrders((current)=>current.filter((value)=>value!==order))} type="button">Don&apos;t send</button></div>{canDelete&&!card.completedAt&&order!==card.nativeSalesOrder?<button aria-label={`Delete backorder ${order}`} className="calendar-order-delete" disabled={savingOrders} onClick={()=>void deleteBackorder(order)} type="button">Delete</button>:null}</div>)}{!card.completedAt?<button disabled={savingOrders||JSON.stringify([...sendOrders].sort())===JSON.stringify([...(card.sendOrders??card.includedOrders??[])].sort())} onClick={()=>void saveDispositions()} type="button">{savingOrders?'Saving…':'Save Dispositions'}</button>:<small>Reopen before deleting</small>}{orderError?<p role="alert">{orderError}</p>:null}</section>:null}
    {card.internalJobId && canOpenJobs ? <Link className="calendar-detail-job-link" href={jobHref(card.internalJobId, calendarWeek)}>Open Job</Link> : null}
    {canAddBackorders&&card.internalJobId&&card.nativeSalesOrder&&card.recordKind==='calendar_item'&&card.calendarItemType!=='note'?<button className="calendar-detail-job-link" onClick={()=>setAddingBackorder(true)} type="button">Add Backorder</button>:null}
    {canDelete&&card.recordKind==='calendar_item'&&!card.completedAt?<button className="calendar-detail-delete" disabled={deleting} onClick={()=>void remove()} type="button">{deleting?'Deleting…':'Delete'}</button>:null}
    {addingBackorder&&card.internalJobId&&card.nativeSalesOrder?<AddBackorderDialog baseSalesOrder={card.nativeSalesOrder} customer={card.customer||card.nativeSalesOrder} linkedInternalJobId={card.internalJobId} onClose={()=>setAddingBackorder(false)} onCreated={onCardCreated}/>:null}
  </aside>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function PartialFulfillmentCompletion({card,onCancel,onSaved}:{card:ProductionBoardCard;onCancel:()=>void;onSaved:(dates:string[])=>void}){
  const orders=card.includedOrders??[];const fulfilled=card.sendOrders??orders;const remaining=orders.filter((order)=>!fulfilled.includes(order));const [pending,setPending]=useState(false);const [error,setError]=useState<string|null>(null);
  const submit=async(event:React.FormEvent)=>{event.preventDefault();if(!fulfilled.length){setError('No orders are marked Send.');return;}setPending(true);setError(null);const result=await completeFulfillmentOrders({commandId:createSecureCommandId(),itemId:card.bookingId.slice(5),expectedRevision:card.revision??0,fulfilledSalesOrders:fulfilled,remainingDate:null});setPending(false);if(!result.ok){setError(result.message);return;}onSaved([card.productionDate].filter((value):value is string=>typeof value==='string'));};
  return <div className="calendar-floating-backdrop"><form className="calendar-quick-add calendar-partial-completion" onSubmit={submit}><header><strong>Complete fulfillment</strong><button aria-label="Close fulfillment completion" onClick={onCancel} type="button">×</button></header><p>{fulfilled.length?`${fulfilled.join(', ')} will be completed.`:'No orders are marked Send.'}</p>{remaining.length?<p>{remaining.join(', ')} will move to Needs Attention.</p>:null}{error?<p role="alert">{error}</p>:null}<footer><button disabled={pending} onClick={onCancel} type="button">Cancel</button><button disabled={pending||fulfilled.length===0} type="submit">{pending?'Completing…':'Complete Fulfillment'}</button></footer></form></div>;
}

function QuickAddPicker({canManageProduction,date,defaultSalesperson,onClose,onCreated,today}:{canManageProduction:boolean;date:string|null;defaultSalesperson:string;onClose:()=>void;onCreated:(card:ProductionBoardCard)=>void;today:string}) {
  const panel=useRef<HTMLDivElement>(null);const savingRef=useRef(false);const [kind,setKind]=useState<CalendarCreateInput['itemType']|null>(null);
  const [form,setForm]=useState({find:'',linkedInternalJobId:null as string|null,name:'',salesOrder:'',salesperson:defaultSalesperson,shopHours:'',timing:'',fulfillmentNote:'',title:'',details:''});
  const [saving,setSaving]=useState(false);const [error,setError]=useState<string|null>(null);const [matches,setMatches]=useState<CalendarJobOption[]>([]);const [searching,setSearching]=useState(false);const [highlightedJob,setHighlightedJob]=useState(0);
  useEffect(()=>{const pointer=(event:PointerEvent)=>{if(!panel.current?.contains(event.target as Node)){event.preventDefault();event.stopPropagation();onClose();}};const key=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose();};document.addEventListener('pointerdown',pointer,true);document.addEventListener('keydown',key);return()=>{document.removeEventListener('pointerdown',pointer,true);document.removeEventListener('keydown',key);};},[onClose]);
  useEffect(()=>{const query=form.find.trim();if(!kind||!query||form.linkedInternalJobId)return;let cancelled=false;const timer=window.setTimeout(()=>{void searchCalendarLinkableJobs({query,itemType:kind}).then((result)=>{if(cancelled)return;setSearching(false);if(result.ok){setMatches(result.options);setHighlightedJob(0);setError(null);}else{setMatches([]);setError(result.message);}}).catch(()=>{if(!cancelled){setSearching(false);setMatches([]);setError('DoorGo jobs could not be searched. Please try again.');}});},200);return()=>{cancelled=true;window.clearTimeout(timer);};},[form.find,form.linkedInternalJobId,kind]);
  const choose=(job:CalendarJobOption)=>{setMatches([]);setSearching(false);setForm((current)=>({...current,find:[job.customer,job.salesOrder||job.doorGoReference].filter(Boolean).join(' · '),linkedInternalJobId:job.internalJobId,name:job.customer,salesOrder:job.salesOrder,salesperson:job.salesperson||current.salesperson}));};
  const submit=async(event:React.FormEvent)=>{event.preventDefault();if(!kind||savingRef.current)return;savingRef.current=true;setSaving(true);setError(null);const hours=form.shopHours.trim()===''?null:Number(form.shopHours);const boardStart=getMondayForDate(date??today);try{const result=await createCalendarItem({commandId:createSecureCommandId(),itemType:kind,scheduledDate:date,linkedInternalJobId:form.linkedInternalJobId,name:kind==='note'?form.title:form.name,salesOrder:form.salesOrder,salesperson:form.salesperson,shopHours:hours===null||Number.isFinite(hours)?hours:null,timing:form.timing,fulfillmentNote:form.fulfillmentNote,title:form.title,details:form.details,boardStart,boardEndExclusive:addDaysToDateOnly(boardStart,7),weeks:1,today});if(!result.ok){setError(result.message);return;}onCreated(result.card);}finally{savingRef.current=false;setSaving(false);}};
  const label=date?`Add to ${formatSearchDate(date)}`:'Add to Needs Attention';
  return <div className="calendar-floating-backdrop"><div className="calendar-quick-add" ref={panel} role="dialog" aria-label={label}><header><strong>{label}</strong><button aria-label="Close Add picker" onClick={onClose} type="button">×</button></header>
    {!kind?<div className="calendar-quick-add-types">{(['production','delivery','customer_pickup','note'] as const).map((value)=><button disabled={value==='production'&&!canManageProduction} key={value} onClick={()=>setKind(value)} type="button"><span>{value==='customer_pickup'?'Customer Pickup':value[0].toUpperCase()+value.slice(1)}</span></button>)}{date?<button disabled title="Staff Away date-range workflow is deferred" type="button"><span>Staff Away</span><small>Later</small></button>:null}</div>
    :<form className="calendar-quick-add-form" onSubmit={submit}>
      {kind==='note'?<label><span>Title *</span><input autoFocus required value={form.title} onChange={(event)=>setForm({...form,title:event.target.value})}/></label>:<label><span>Name *</span><input autoFocus required value={form.name} onChange={(event)=>setForm({...form,name:event.target.value,linkedInternalJobId:null})}/></label>}
      <label><span>Find job / Sales Order{kind==='note'?' (optional)':''}</span><input aria-autocomplete="list" aria-controls="calendar-quick-add-job-results" aria-expanded={matches.length>0} onChange={(event)=>{setMatches([]);setSearching(Boolean(event.target.value.trim()));setForm({...form,find:event.target.value,linkedInternalJobId:null});setHighlightedJob(0);}} onKeyDown={(event)=>{if(!matches.length)return;if(event.key==='ArrowDown'){event.preventDefault();setHighlightedJob((value)=>(value+1)%matches.length);}else if(event.key==='ArrowUp'){event.preventDefault();setHighlightedJob((value)=>(value-1+matches.length)%matches.length);}else if(event.key==='Enter'){event.preventDefault();choose(matches[highlightedJob]);}}} placeholder="Customer, Sales Order, or DoorGo reference" role="combobox" value={form.find}/>{searching?<small>Searching DoorGo Jobs…</small>:null}{matches.length?<div className="calendar-quick-add-results" id="calendar-quick-add-job-results" role="listbox">{matches.map((job,index)=><button aria-selected={index===highlightedJob} key={job.internalJobId} onClick={()=>choose(job)} role="option" type="button"><strong>{job.customer||'Unnamed'}</strong><span>{job.salesOrder||job.doorGoReference}</span><small>{job.fulfillmentPlan||'Fulfillment unspecified'}</small></button>)}</div>:null}</label>
      {!searching&&form.find.trim()&&!form.linkedInternalJobId&&!matches.length&&!error?<p className="calendar-quick-add-empty">No matching DoorGo jobs.</p>:null}
      {kind!=='note'?<label><span>Sales Order</span><input value={form.salesOrder} onChange={(event)=>setForm({...form,salesOrder:event.target.value,linkedInternalJobId:null})}/></label>:null}<label><span>Salesperson{kind==='production'?' *':''}</span><input required={kind==='production'} value={form.salesperson} onChange={(event)=>setForm({...form,salesperson:event.target.value})}/></label>
      {kind==='production'?<label><span>Shop Hours</span><input min="0" step="0.01" type="number" value={form.shopHours} onChange={(event)=>setForm({...form,shopHours:event.target.value})}/></label>:null}
      {(kind==='delivery'||kind==='customer_pickup')?<><label><span>Timing</span><input placeholder="AM, after lunch, before 3" value={form.timing} onChange={(event)=>setForm({...form,timing:event.target.value})}/></label><label><span>Fulfillment note</span><textarea value={form.fulfillmentNote} onChange={(event)=>setForm({...form,fulfillmentNote:event.target.value})}/></label></>:null}
      {kind==='note'?<label><span>Details</span><textarea value={form.details} onChange={(event)=>setForm({...form,details:event.target.value})}/></label>:null}{error?<p role="alert">{error}</p>:null}<footer><button disabled={saving} onClick={()=>setKind(null)} type="button">Back</button><button disabled={saving} type="submit">{saving?'Adding…':'Add'}</button></footer></form>}
  </div></div>;
}

// Retained for the historical reason-based schedule workflow; Calendar no longer renders it.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ReopenPanel({ state, onCancel, onChange, onSubmit }: { state: ReopenState; onCancel: () => void; onChange: (reason: string) => void; onSubmit: () => void }) {
  return <div className="calendar-floating-backdrop"><form className="calendar-reopen-panel" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}><h2>Reopen production booking?</h2><p>Reopening preserves its Production date and position.</p><label><span>Reason</span><textarea autoFocus disabled={state.pending} maxLength={500} onChange={(event) => onChange(event.target.value)} value={state.reason}/></label>{state.error ? <p role="alert">{state.error}</p> : null}<footer><button disabled={state.pending} onClick={onCancel} type="button">Cancel</button><button disabled={state.pending} type="submit">{state.pending ? 'Reopening…' : 'Reopen'}</button></footer></form></div>;
}

function ExceptionalMovePanel({ state, onCancel, onChange, onSubmit }: { state: CalendarMoveState; onCancel: () => void; onChange: (changes: Partial<CalendarMoveState>) => void; onSubmit: () => void }) {
  return <div className="calendar-floating-backdrop"><form className="calendar-move-panel" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}><h2>{state.undoing ? 'Confirm undo move' : state.destinationDate ? `Move to ${formatSearchDate(state.destinationDate)}` : 'Move to Needs Attention'}</h2>
    {state.requiresClosedOverride ? <label className="calendar-move-check"><input checked={state.closedAcknowledged} disabled={state.pending} onChange={(event) => onChange({ closedAcknowledged: event.target.checked })} type="checkbox"/><span>Confirm scheduling this item on the closed date.</span></label> : null}
    {state.error ? <p role="alert">{state.error}</p> : null}
    <footer><button disabled={state.pending} onClick={onCancel} type="button">Cancel</button><button disabled={state.pending} type="submit">{state.pending ? 'Moving…' : state.undoing ? 'Undo move' : 'Move'}</button></footer>
  </form></div>;
}

function CalendarProductionCard({ card, canDrag, dropPosition, highlighted, onDragEnd, onDragStart }: { card: ProductionBoardCard; canDrag: boolean; dropPosition: 'before' | 'after' | null; highlighted: boolean; onDragEnd: () => void; onDragStart: (event: React.DragEvent<HTMLElement>) => void }) {
  const color = calendarCardColor(card);
  const text = calendarCardText(card);
  const completed = card.completedAt !== null;
  return <div className="calendar-production-card" data-booking-id={card.bookingId} data-completed={completed || undefined} data-drop-position={dropPosition ?? undefined} data-highlighted={highlighted || undefined} draggable={canDrag || undefined} id={bookingElementId(card.bookingId)} onDragEnd={onDragEnd} onDragStart={onDragStart} style={{ backgroundColor: color.background, color: color.foreground }} title={text}>
    <CalendarItemIcon card={card}/><span className="calendar-production-card-text">{text}</span>
    {completed ? <span aria-label="Completed" className="calendar-completion-cue">✓</span> : null}
  </div>;
}

function CalendarItemIcon({card}:{card:ProductionBoardCard}){
  if(card.recordKind!=='calendar_item')return null;
  const path=card.calendarItemType==='delivery'?'M2 5h9v8H2zM11 8h4l3 3v2h-7zM5 16a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm10 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z':card.calendarItemType==='customer_pickup'?'M4 6h12l-1 11H5L4 6Zm3 1V5a3 3 0 0 1 6 0v2':'M4 2h12v16H4zM7 6h6M7 10h6M7 14h4';
  return <span aria-hidden="true" className="calendar-item-icon"><svg viewBox="0 0 20 20"><path d={path}/></svg></span>;
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

function searchTargetTypeLabel(type:CalendarSearchTarget['calendarItemType']):string {
  return type==='production'?'Production':type==='delivery'?'Delivery':type==='customer_pickup'?'Pickup':'Note';
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
