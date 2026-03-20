import React from 'react';
import { TimelineAction, TimelineRow } from '../../../interface/action';
import { parserTimeToTransform, parserTransformToTime } from '../../../utils/deal_data';

export interface UseRowDragOptions {
  selectedActionIds: string[];
  editorData: TimelineRow[];
  containerRef?: React.RefObject<HTMLDivElement>;
  /** scale 参数 */
  scale?: number;
  /** 单个刻度的显示宽度 */
  scaleWidth?: number;
  /** 刻度开始距离左侧的距离 */
  startLeft?: number;
  /** 设置编辑器数据 */
  setEditorData?: (data: TimelineRow[]) => void;
  allowCreateTrack?: boolean;
  rowHeight?: number;
  onUpdateEditorData?: (editorData: TimelineRow, actions: TimelineAction[]) => void;
}

export interface MultiDragState {
  /** 是否正在多选拖拽 */
  isMultiDrag: boolean;
  /** 拖拽的主 action ID */
  primaryActionId?: string | null;
  /** 所有选中 action 的初始位置信息 */
  initialPositions: Map<string, StoredActionPosition>;
  /** 当前拖拽的偏移量 */
  dragOffset: { dx: number; dy: number };
  /** 拖拽开始时的光标位置 */
  startCursor?: { x: number; y: number } | null;
  /** 是否正在拖拽选中的元素 */
  isDraggingSelection: boolean;

  offsetX?: number;
  offsetY?: number;
  /** 初始元素位置（用于拖拽计算） */
  initialElementPositions?: Map<string, { x: number; y: number }>;

  start: number;
  end: number;
}

type StoredActionPosition = {
  rowId: string;
  rowIndex: number;
  start: number;
  end: number;
  left: number;
  width: number;
};

type MultiDragPlacement = {
  actionId: string;
  rowId: string;
  start: number;
  end: number;
  conflicted: boolean;
};

type MultiDragPlan = {
  placements: MultiDragPlacement[];
  rows: TimelineRow[];
};

const resetMultiDragState = (): MultiDragState => ({
  isMultiDrag: false,
  primaryActionId: null,
  initialPositions: new Map(),
  dragOffset: { dx: 0, dy: 0 },
  startCursor: null,
  isDraggingSelection: false,
  start: 0,
  end: 0,
});

const cloneRows = (rows: TimelineRow[]) => rows.map((row) => ({ ...row, actions: [...row.actions] }));

const createEmptyRow = ({
  templateRow,
  order,
}: {
  templateRow: TimelineRow;
  order: number;
}): TimelineRow => ({
  ...templateRow,
  id: `row_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
  actions: [],
  order,
  selected: false,
  isPreview: false,
});

const removeActionFromRows = (rows: TimelineRow[], actionId: string) => {
  for (let i = 0; i < rows.length; i++) {
    const actionIndex = rows[i].actions.findIndex((item) => item.id === actionId);
    if (actionIndex !== -1) {
      const [action] = rows[i].actions.splice(actionIndex, 1);
      return { rowIndex: i, action };
    }
  }
  return { rowIndex: -1, action: undefined as TimelineAction | undefined };
};

const buildMultiDragPlacements = ({
  editorData,
  initialPositions,
  selectedActionIds,
  timeOffset,
  rowDelta,
  allowCreateTrack,
}: {
  editorData: TimelineRow[];
  initialPositions: Map<string, StoredActionPosition>;
  selectedActionIds: string[];
  timeOffset: number;
  rowDelta: number;
  allowCreateTrack: boolean;
}): MultiDragPlan => {
  const selectedSet = new Set(selectedActionIds);
  const selectedInitials = selectedActionIds
    .map((actionId) => {
      const initial = initialPositions.get(actionId);
      return initial ? { actionId, initial } : null;
    })
    .filter(Boolean) as Array<{ actionId: string; initial: StoredActionPosition }>;

  if (selectedInitials.length === 0) {
    return { placements: [], rows: editorData };
  }

  const targetIndexes = selectedInitials.map(({ initial }) => initial.rowIndex + rowDelta);
  const minTargetIndex = Math.min(...targetIndexes);
  const maxTargetIndex = Math.max(...targetIndexes);
  const prependCount = minTargetIndex < 0 ? -minTargetIndex : 0;
  const appendCount = maxTargetIndex >= editorData.length ? maxTargetIndex - editorData.length + 1 : 0;

  if (!allowCreateTrack && (prependCount > 0 || appendCount > 0)) {
    return {
      rows: editorData,
      placements: selectedInitials.map(({ actionId, initial }) => ({
        actionId,
        rowId: initial.rowId,
        start: initial.start,
        end: initial.end,
        conflicted: true,
      })),
    };
  }

  const minOrder = Math.min(...editorData.map((row) => Number(row.order ?? 0)));
  const maxOrder = Math.max(...editorData.map((row) => Number(row.order ?? 0)));
  const prependTemplateRow = editorData[0];
  const appendTemplateRow = editorData[editorData.length - 1];

  const prependRows = Array.from({ length: prependCount }, (_, index) =>
    createEmptyRow({
      templateRow: prependTemplateRow,
      order: minOrder - prependCount + index,
    })
  );
  const appendRows = Array.from({ length: appendCount }, (_, index) =>
    createEmptyRow({
      templateRow: appendTemplateRow,
      order: maxOrder + index + 1,
    })
  );
  const expandedRows = [...prependRows, ...editorData, ...appendRows];

  const placements = selectedInitials.map(({ actionId, initial }) => {
    const candidateRow = expandedRows[initial.rowIndex + rowDelta + prependCount];
    const nextStart = initial.start + timeOffset;
    const nextEnd = initial.end + timeOffset;

    if (!candidateRow) {
      return {
        actionId,
        rowId: initial.rowId,
        start: initial.start,
        end: initial.end,
        conflicted: true,
      };
    }

    const hasConflict = candidateRow.actions.some(
      (item) => !selectedSet.has(item.id) && item.start < nextEnd && item.end > nextStart,
    );

    if (hasConflict) {
      return {
        actionId,
        rowId: initial.rowId,
        start: initial.start,
        end: initial.end,
        conflicted: true,
      };
    }

    return {
      actionId,
      rowId: candidateRow.id,
      start: nextStart,
      end: nextEnd,
      conflicted: false,
    };
  });

  return {
    placements,
    rows: expandedRows,
  };
};

export const useRowDrag = (options: UseRowDragOptions) => {
  const {
    selectedActionIds,
    editorData,
    containerRef,
    scale = 1,
    scaleWidth = 160,
    startLeft = 20,
    setEditorData,
    allowCreateTrack = true,
    rowHeight = 35,
    onUpdateEditorData,
  } = options;

  // 多选拖拽状态
  const multiDragState = React.useRef<MultiDragState>(resetMultiDragState());

  // 获取选中的 action DOM 元素
  const getSelectedActionEls = React.useCallback(() => {
    if (!containerRef?.current) return [];
    const actions = containerRef.current.querySelectorAll('.timeline-editor-action-selected');
    return Array.from(actions) as HTMLElement[];
  }, [containerRef]);

  // 拖拽开始
  const onDragStart = React.useCallback(({ action }: { action: TimelineAction; row: TimelineRow }) => {
    if (selectedActionIds.length <= 1) {
      multiDragState.current = resetMultiDragState();
      return;
    }

    if (!selectedActionIds.includes(action.id)) {
      multiDragState.current = resetMultiDragState();
      return;
    }

    const selectedEls = getSelectedActionEls();
    if (selectedEls.length <= 1) {
      return;
    }

    const initialElementPositions = new Map<string, { x: number; y: number }>();

    selectedEls.forEach(el => {
      const actionId = el.getAttribute('data-action-id');
      if (!actionId) return;

      const style = window.getComputedStyle(el);
      const transform = style.transform;

      let x = 0, y = 0;
      if (transform && transform !== 'none') {
        const matrix = transform.match(/matrix\(([^)]+)\)/);
        if (matrix) {
          const values = matrix[1].split(', ');
          x = parseFloat(values[4]) || 0;
          y = parseFloat(values[5]) || 0;
        }
      }

      initialElementPositions.set(actionId, { x, y });
      el.setAttribute('data-x', x.toString());
      el.setAttribute('data-y', y.toString());
    });

    const initialPositions = new Map<string, StoredActionPosition>();
    editorData.forEach((r, rowIndex) => {
      r.actions.forEach((a) => {
        if (selectedActionIds.includes(a.id)) {
          const transform = parserTimeToTransform({ start: a.start, end: a.end }, { startLeft, scale, scaleWidth });
          initialPositions.set(a.id, {
            rowId: r.id,
            rowIndex,
            start: a.start,
            end: a.end,
            left: transform.left,
            width: transform.width,
          });
        }
      });
    });

    multiDragState.current = {
      isMultiDrag: true,
      initialPositions,
      dragOffset: { dx: 0, dy: 0 },
      isDraggingSelection: true,
      primaryActionId: action.id,
      offsetX: 0,
      offsetY: 0,
      initialElementPositions,
      start: action.start,
      end: action.end,
    };
  }, [selectedActionIds, editorData, getSelectedActionEls, scale, scaleWidth, startLeft]);

  // 拖拽移动
  const onDragMove = React.useCallback((params: {
    actionId: string;
    left: number;
    width: number;
    top: number;
    height: number;
    dx: number;
    dy: number;
    lastLeft?: number;
    lastWidth?: number;
    lastTop?: number;
    lastHeight?: number;
    gap?: number;
  }) => {
    const { actionId, dx, dy } = params;
    const state = multiDragState.current;

    if (!state.isMultiDrag || !state.isDraggingSelection || !state.initialElementPositions) {
      return;
    }

    const selectedEls = getSelectedActionEls();
    if (selectedEls.length === 0) return;

    state.offsetX = params.gap ?? 0;
    state.offsetY = (state.offsetY || 0) + dy;

    selectedEls.forEach(el => {
      const elActionId = el.getAttribute('data-action-id');
      if (!elActionId || elActionId === actionId) return;

      const initialPos = state.initialElementPositions.get(elActionId);
      if (!initialPos) return;

      const newX = initialPos.x + state.offsetX;
      const newY = initialPos.y + state.offsetY;

      el.style.transform = `translate(${newX}px, ${newY}px)`;
      el.setAttribute('data-x', newX.toString());
      el.setAttribute('data-y', newY.toString());
    });
  }, [getSelectedActionEls]);

  // 拖拽结束
  const onDragEnd = React.useCallback((params?: {
    actionId: string;
    left: number;
    width: number;
    top: number;
    height: number;
    dx?: number;
    dy?: number;
    up: number;
    action?: TimelineAction;
    row?: TimelineRow;
  }) => {
    const state = multiDragState.current;

    const selectedEls = getSelectedActionEls();
    selectedEls.forEach(el => {
      el.removeAttribute('data-x');
      el.removeAttribute('data-y');
      el.style.transform = '';
    });

    if (!state.isMultiDrag || !params || params?.actionId !== state.primaryActionId) {
      multiDragState.current = resetMultiDragState();
      return;
    }

    const { left, width, top, height, action: primaryAction, row: primaryRow } = params;
    const { initialPositions, primaryActionId } = state;
    if (!setEditorData || initialPositions.size === 0) {
      multiDragState.current = resetMultiDragState();
      return;
    }

    const primaryInitial = initialPositions.get(primaryActionId!);
    if (!primaryInitial) {
      multiDragState.current = resetMultiDragState();
      return;
    }

    const primaryFinalTime = parserTransformToTime({ left, width }, { startLeft, scale, scaleWidth });
    const timeOffset = primaryFinalTime.start - primaryInitial.start;
    const rowDelta = Math.round((top || 0) / rowHeight);
    if (Math.abs(timeOffset) < 0.001 && rowDelta === 0) {
      multiDragState.current = resetMultiDragState();
      return;
    }

    const { placements, rows: plannedRows } = buildMultiDragPlacements({
      editorData,
      initialPositions,
      selectedActionIds,
      timeOffset,
      rowDelta,
      allowCreateTrack,
    });
    const hasConflict = placements.some((placement) => placement.conflicted);
    if (hasConflict) {
      multiDragState.current = resetMultiDragState();
      return;
    }

    const rows = cloneRows(plannedRows);
    const updatedActions: TimelineAction[] = [];
    const removedActions = new Map<string, TimelineAction>();

    selectedActionIds.forEach((selectedId) => {
      const removal = removeActionFromRows(rows, selectedId);
      if (removal.action) {
        removedActions.set(selectedId, removal.action);
      }
    });

    placements.forEach((placement) => {
      const actionItem =
        removedActions.get(placement.actionId) ||
        (placement.actionId === primaryActionId ? primaryAction : undefined);
      if (!actionItem) return;

      const targetRow = rows.find((item) => item.id === placement.rowId);
      if (!targetRow) return;

      const nextAction: TimelineAction = {
        ...actionItem,
        start: placement.start,
        end: placement.end,
        order: targetRow.order,
      };

      targetRow.actions.push(nextAction);
      targetRow.actions.sort((a, b) => a.start - b.start);
      updatedActions.push(nextAction);
    });

    const nextRows = rows
      .filter((row) => row.actions.length > 0)
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));

    const primaryPlacement = placements.find((item) => item.actionId === primaryActionId);
    const primaryTargetRow = primaryPlacement
      ? nextRows.find((item) => item.id === primaryPlacement.rowId)
      : primaryRow;

    setEditorData(nextRows);
    if (primaryTargetRow) {
      onUpdateEditorData?.(primaryTargetRow, updatedActions);
    }

    multiDragState.current = resetMultiDragState();
  }, [allowCreateTrack, editorData, getSelectedActionEls, onUpdateEditorData, rowHeight, scale, scaleWidth, selectedActionIds, setEditorData, startLeft]);

  // 检查是否是多选拖拽模式
  const isMultiDragging = React.useCallback((): boolean => {
    return multiDragState.current.isMultiDrag;
  }, []);

  return {
    onDragStart,
    onDragMove,
    onDragEnd,
    isMultiDragging,
    isMultiDrag: multiDragState.current.isMultiDrag,
  };
};
