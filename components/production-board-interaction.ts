import type { DragEvent, MouseEvent } from 'react';
import type { ProductionBoardCard } from '@/lib/production-board/types';

export type ProductionBoardInteraction = {
  mode: 'reschedule';
  pendingBookingId: string | null;
  hoveredDate: string | null;
  getMoveBlockReason: (card: ProductionBoardCard) => string | null;
  canDragCard: (card: ProductionBoardCard) => boolean;
  onMoveRequest: (card: ProductionBoardCard, origin: HTMLElement) => void;
  getCompletionBlockReason: (card: ProductionBoardCard) => string | null;
  onCompletionRequest: (card: ProductionBoardCard, origin: HTMLElement) => void;
  onCardDragStart: (card: ProductionBoardCard, event: DragEvent<HTMLElement>) => void;
  onCardDragEnd: (card: ProductionBoardCard) => void;
  onCardClickCapture: (card: ProductionBoardCard, event: MouseEvent<HTMLElement>) => void;
  onDayDragEnter: (date: string, event: DragEvent<HTMLElement>) => void;
  onDayDragOver: (date: string, event: DragEvent<HTMLElement>) => void;
  onDayDragLeave: (date: string, event: DragEvent<HTMLElement>) => void;
  onDayDrop: (date: string, event: DragEvent<HTMLElement>) => void;
};
