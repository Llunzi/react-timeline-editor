import React, { FC, useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { TimelineAction, TimelineRow } from '../../interface/action';
import { CommonProp } from '../../interface/common_prop';
import { DEFAULT_ADSORPTION_DISTANCE, DEFAULT_MOVE_GRID } from '../../interface/const';
import { prefix } from '../../utils/deal_class_prefix';
import { getScaleCountByPixel, parserActionsToPositions, parserTimeToPixel, parserTimeToTransform, parserTransformToTime } from '../../utils/deal_data';
import { RowDnd } from '../row_rnd/row_rnd';
import { RndDragCallback, RndDragEndCallback, RndDragStartCallback, RndResizeCallback, RndResizeEndCallback, RndResizeStartCallback, RowRndApi } from '../row_rnd/row_rnd_interface';
import { DragLineData } from './drag_lines';
import './edit_action.less';
import stretchIcon from '../../assets/stretch.svg';

export type EditActionProps = CommonProp & {
  row: TimelineRow;
  action: TimelineAction;
  dragLineData?: DragLineData;
  insertPreview?: {
    actionId: string;
    rowId: string;
    start: number;
    end: number;
    shiftByActionId: Record<string, number>;
  } | null;
  setEditorData: (params: TimelineRow[]) => void;
  handleTime: (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => number;
  areaRef: React.MutableRefObject<HTMLDivElement>;
  /** 设置scroll left */
  deltaScrollLeft?: (delta: number) => void;
  /** 允许拖拽创建新轨道 */
  allowCreateTrack?: boolean;
  setInsertPreview?: (
    preview: {
      actionId: string;
      rowId: string;
      start: number;
      end: number;
      shiftByActionId: Record<string, number>;
    } | null,
  ) => void;
  trackPreview?:
    | {
        kind: 'row';
        rowId: string;
      }
    | {
        kind: 'new-row';
        insertIndex: number;
        sourceRow: TimelineRow;
      }
    | null;
  setTrackPreview?: (
    preview:
      | {
          kind: 'row';
          rowId: string;
        }
      | {
          kind: 'new-row';
          insertIndex: number;
          sourceRow: TimelineRow;
        }
      | null,
  ) => void;
  /** time-editor-container的ref引用 */
  containerRef?: React.MutableRefObject<HTMLDivElement>;
  selectedActionIds?: string[];
};

const resolveTargetRowPlacement = ({
  editorData,
  row,
  top,
  rowHeight,
  allowCreateTrack,
}: {
  editorData: TimelineRow[];
  row: TimelineRow;
  top?: number;
  rowHeight: number;
  allowCreateTrack: boolean;
}) => {
  let targetRowIndex = editorData.findIndex((item) => item.id === row.id);
  let needCreateNewRow = false;
  let newRowPosition: 'before' | 'after' = 'after';

  if (top !== undefined) {
    const currentRowIndex = editorData.findIndex((item) => item.id === row.id);
    const threshold = 0.2;
    const preciseOffset = top / rowHeight;
    const preciseIndex = currentRowIndex + preciseOffset;

    if (allowCreateTrack) {
      if (preciseIndex < -threshold) {
        needCreateNewRow = true;
        newRowPosition = 'before';
        targetRowIndex = 0;
      } else if (preciseIndex >= editorData.length - 1 + threshold) {
        needCreateNewRow = true;
        newRowPosition = 'after';
        targetRowIndex = editorData.length;
      } else {
        const rowOffset = Math.round(preciseOffset);
        targetRowIndex = Math.max(0, Math.min(currentRowIndex + rowOffset, editorData.length - 1));
      }
    } else {
      const rowOffset = Math.round(preciseOffset);
      targetRowIndex = Math.max(0, Math.min(currentRowIndex + rowOffset, editorData.length - 1));
    }
  }

  return { targetRowIndex, needCreateNewRow, newRowPosition };
};

/**
 * 从 initialTargetRowIndex 开始向下查找第一个在 [start, end) 时间段没有片段冲突的行。
 * 找不到时若允许新建则返回 needCreateNewRow=true，否则回退到原行。
 */
const resolveSmartRow = ({
  editorData,
  initialTargetRowIndex,
  actionId,
  start,
  end,
  allowCreateTrack,
}: {
  editorData: TimelineRow[];
  initialTargetRowIndex: number;
  actionId: string;
  start: number;
  end: number;
  allowCreateTrack: boolean;
}): { targetRowIndex: number; needCreateNewRow: boolean } => {
  for (let i = initialTargetRowIndex; i < editorData.length; i++) {
    const candidate = editorData[i];
    const hasConflict = candidate.actions.some((a) => a.id !== actionId && a.start < end && a.end > start);
    if (!hasConflict) {
      return { targetRowIndex: i, needCreateNewRow: false };
    }
  }
  if (allowCreateTrack) {
    return { targetRowIndex: editorData.length, needCreateNewRow: true };
  }
  return { targetRowIndex: Math.min(initialTargetRowIndex, editorData.length - 1), needCreateNewRow: false };
};

const hasMultiDragConflict = ({
  editorData,
  selectedActionIds,
  primaryAction,
  timeOffset,
  rowDelta,
}: {
  editorData: TimelineRow[];
  selectedActionIds: string[];
  primaryAction: TimelineAction;
  timeOffset: number;
  rowDelta: number;
}) => {
  const selectedSet = new Set(selectedActionIds);

  return selectedActionIds.some((selectedId) => {
    let sourceRowIndex = -1;
    let sourceAction: TimelineAction | undefined;

    editorData.some((candidateRow, rowIndex) => {
      const action = candidateRow.actions.find((item) => item.id === selectedId);
      if (!action) return false;
      sourceRowIndex = rowIndex;
      sourceAction = action;
      return true;
    });

    const initialAction = sourceAction || (selectedId === primaryAction.id ? primaryAction : undefined);
    if (!initialAction || sourceRowIndex < 0) return true;

    const targetRow = editorData[sourceRowIndex + rowDelta];
    if (!targetRow) return true;

    const nextStart = initialAction.start + timeOffset;
    const nextEnd = initialAction.end + timeOffset;

    return targetRow.actions.some(
      (item) => !selectedSet.has(item.id) && item.start < nextEnd && item.end > nextStart,
    );
  });
};

const buildInsertPreview = ({
  targetRow,
  actionId,
  start,
  end,
}: {
  targetRow: TimelineRow;
  actionId: string;
  start: number;
  end: number;
}) => {
  const duration = Math.max(end - start, 0);
  const insertStart = Math.max(0, start);
  const shiftByActionId: Record<string, number> = {};
  let rippleCursor = insertStart + duration;

  const sortedActions = targetRow.actions
    .filter((item) => item.id !== actionId)
    .sort((a, b) => a.start - b.start);

  for (const item of sortedActions) {
    if (item.end <= insertStart) continue;
    if (item.start >= rippleCursor) break;

    shiftByActionId[item.id] = rippleCursor - item.start;
    rippleCursor += item.end - item.start;
  }

  return {
    actionId,
    rowId: targetRow.id,
    start: insertStart,
    end: insertStart + duration,
    shiftByActionId,
  };
};

const clearRipplePreview = (container?: HTMLDivElement | null) => {
  if (!container) return;

  const previewNodes = container.querySelectorAll<HTMLElement>('[data-ripple-preview="true"]');
  previewNodes.forEach((node) => {
    node.style.transform = '';
    node.style.transition = '';
    node.style.zIndex = '';
    node.removeAttribute('data-ripple-preview');
  });
};

const applyRipplePreview = ({
  container,
  shiftByActionId,
  scale,
  scaleWidth,
}: {
  container?: HTMLDivElement | null;
  shiftByActionId: Record<string, number>;
  scale: number;
  scaleWidth: number;
}) => {
  if (!container) return;

  clearRipplePreview(container);

  Object.entries(shiftByActionId).forEach(([actionId, shift]) => {
    const node = container.querySelector<HTMLElement>(`[data-action-id="${actionId}"]`);
    if (!node) return;

    const shiftPx = (shift / scale) * scaleWidth;
    node.style.transform = `translateX(${shiftPx}px)`;
    node.style.transition = 'transform 90ms ease-out';
    node.style.zIndex = '6';
    node.setAttribute('data-ripple-preview', 'true');
  });
};

const EditActionO: FC<EditActionProps> = ({
  editorData,
  row,
  action,
  effects,
  rowHeight,
  scale,
  scaleWidth,
  scaleSplitCount,
  startLeft,
  gridSnap,
  disableDrag,

  scaleCount,
  maxScaleCount,
  setScaleCount,
  onActionMoveStart,
  onActionMoving,
  onActionMoveEnd,
  onActionResizeStart,
  onActionResizeEnd,
  onActionResizing,

  dragLineData,
  setEditorData,
  onClickAction,
  onClickActionOnly,
  onDoubleClickAction,
  onContextMenuAction,
  getActionRender,
  handleTime,
  areaRef,
  deltaScrollLeft,
  allowCreateTrack = true,
  insertPreview,
  setInsertPreview,
  trackPreview,
  setTrackPreview,
  containerRef,
  selectedActionIds,
}) => {
  const rowRnd = useRef<RowRndApi>();
  const isDragWhenClick = useRef(false);
  const originalPosition = useRef({ start: 0, end: 0 });
  const isMounted = useRef(true); // 组件挂载状态
  const { id, maxEnd, minStart, end, start, selected, flexible = true, movable = true, effectId } = action;
  const [dragging, setDragging] = useState(false);

  let originStart = start;

  parserTimeToPixel(originStart, {
    startLeft,
    scale,
    scaleWidth,
  });

  const handleDeltaScrollTop = (delta: number) => {
    if (containerRef?.current) {
      containerRef.current.scrollTop += delta * 2;
    }
  };

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  // 获取最大/最小 像素范围
  const leftLimit = parserTimeToPixel(minStart || 0, {
    startLeft,
    scale,
    scaleWidth,
  });
  const rightLimit = Math.min(
    maxScaleCount * scaleWidth + startLeft, // 根据maxScaleCount限制移动范围
    parserTimeToPixel(maxEnd || Number.MAX_VALUE, {
      startLeft,
      scale,
      scaleWidth,
    }),
  );

  // 初始化动作坐标数据
  const [transform, setTransform] = useState(() => {
    return { ...parserTimeToTransform({ start, end }, { startLeft, scale, scaleWidth }), top: 0 };
  });

  useLayoutEffect(() => {
    setTransform({ ...parserTimeToTransform({ start, end }, { startLeft, scale, scaleWidth }), top: 0 });
  }, [end, start, startLeft, scaleWidth, scale]);

  const adsorptionPositions = React.useMemo(() => {
    const otherActions = editorData.flatMap((rowItem) => rowItem.actions).filter((item) => item.id !== action.id);

    return parserActionsToPositions(otherActions, {
      startLeft,
      scale,
      scaleWidth,
    });
  }, [action.id, editorData, scale, scaleWidth, startLeft]);

  // 配置拖拽网格对其属性
  const gridSize = scaleWidth / scaleSplitCount;

  // 动作的名称
  const classNames = ['action'];
  if (movable) classNames.push('action-movable');
  if (selected) classNames.push('action-selected');
  if (flexible) classNames.push('action-flexible');
  if (effects[effectId]) classNames.push(`action-effect-${effectId}`);

  /** 计算scale count */
  const handleScaleCount = (left: number, width: number) => {
    const curScaleCount = getScaleCountByPixel(left + width, {
      startLeft,
      scaleCount,
      scaleWidth,
    });
    if (curScaleCount !== scaleCount) setScaleCount(curScaleCount);
  };

  //#region [rgba(100,120,156,0.08)] 回调
  const handleDragStart: RndDragStartCallback = () => {
    window.dispatchEvent(new CustomEvent('timeline-action-dragging-change', { detail: true }));
    // 保存原始位置
    setDragging(true);
    clearRipplePreview(areaRef.current);
    originalPosition.current = { start: action.start, end: action.end };
    // 将所在行的 z-index 临时提升到最顶层，突破 Grid 的 stacking context 限制
    const actionEl = areaRef.current?.querySelector<HTMLElement>(`[data-action-id="${action.id}"]`);
    const rowEl = actionEl?.closest<HTMLElement>('[class*="edit-row"]');
    if (rowEl) {
      rowEl.dataset.prevZIndex = rowEl.style.zIndex;
      rowEl.style.zIndex = '99999';
    }
    // 多选拖拽时，解除 overflow:hidden 限制，防止次级片段拖出边界后被裁剪
    if (areaRef.current) {
      areaRef.current.dataset.prevOverflow = areaRef.current.style.overflow;
      areaRef.current.style.overflow = 'visible';
      // Grid 容器同步处理
      const gridEl = areaRef.current.querySelector<HTMLElement>('.ReactVirtualized__Grid');
      if (gridEl) {
        gridEl.dataset.prevOverflow = gridEl.style.overflow;
        gridEl.style.overflow = 'visible';
      }
    }
    onActionMoveStart && onActionMoveStart({ action, row });
  };
  const handleDrag: RndDragCallback = ({ left, width, top, ...args }) => {
    isDragWhenClick.current = true;

    const currentRange = parserTransformToTime({ left, width }, { scaleWidth, scale, startLeft });
    const isSelectionMultiDrag = ((selectedActionIds?.length || 0) > 1) && selectedActionIds?.includes(action.id);
    const multiDragConflict = isSelectionMultiDrag
      ? hasMultiDragConflict({
          editorData,
          selectedActionIds: selectedActionIds || [],
          primaryAction: action,
          timeOffset: currentRange.start - action.start,
          rowDelta: Math.round((top || 0) / rowHeight),
        })
      : false;

    if (multiDragConflict) {
      setInsertPreview?.({
        actionId: action.id,
        rowId: row.id,
        start: action.start,
        end: action.end,
        shiftByActionId: {},
      });
      setTrackPreview?.(null);
    } else if (isSelectionMultiDrag) {
      clearRipplePreview(areaRef.current);
    }

    if (!multiDragConflict) {
      const placement = resolveTargetRowPlacement({
        editorData,
        row,
        top,
        rowHeight,
        allowCreateTrack,
      });
  
      const currentRowIndex = editorData.findIndex((item) => item.id === row.id);
      if (placement.needCreateNewRow) {
        // 鼠标已拖到所有轨道的边界外，直接显示新轨道插入线
        setInsertPreview?.(null);
        setTrackPreview?.({
          kind: 'new-row',
          insertIndex: placement.targetRowIndex,
          sourceRow: row,
        });
      } else {
        // 用 smart row 找真实可用行（冲突则往下级联）
        const smart = resolveSmartRow({
          editorData,
          initialTargetRowIndex: placement.targetRowIndex,
          actionId: action.id,
          start: currentRange.start,
          end: currentRange.end,
          allowCreateTrack,
        });
  
        if (smart.needCreateNewRow) {
          setInsertPreview?.(null);
          setTrackPreview?.({
            kind: 'new-row',
            insertIndex: smart.targetRowIndex,
            sourceRow: row,
          });
        } else {
          const targetRow = editorData[smart.targetRowIndex];
          const isSameRow = smart.targetRowIndex === currentRowIndex;
          if (targetRow) {
            setInsertPreview?.({
              actionId: action.id,
              rowId: targetRow.id,
              start: currentRange.start,
              end: currentRange.end,
              shiftByActionId: {},
            });
            setTrackPreview?.(isSameRow ? null : { kind: 'row', rowId: targetRow.id });
          } else {
            setInsertPreview?.(null);
            setTrackPreview?.(null);
          }
        }
      }
    }

    if (onActionMoving) {
      const g1 = parserTimeToPixel(originStart, {
        startLeft,
        scale,
        scaleWidth,
      });

      const currentStartPixel = parserTimeToPixel(currentRange.start, {
        startLeft,
        scale,
        scaleWidth,
      });

      const result = onActionMoving({
        action,
        row,
        start: currentRange.start,
        end: currentRange.end,
        left,
        width,
        top,
        offsetX: currentStartPixel - g1,
        ...args,
      });

      if (result === false) return false;
    }
    if (isMounted.current) {
      setTransform({ left, width, top: top || 0 });
    }
    handleScaleCount(left, width);
  };

  const handleDragEndBase = useCallback<RndDragEndCallback>(
    ({ left, width, top, height, isMultiDrag, fn: fnCallback }) => {
      window.dispatchEvent(new CustomEvent('timeline-action-dragging-change', { detail: false }));
        setDragging(false);
      setInsertPreview?.(null);
      setTrackPreview?.(null);
      clearRipplePreview(areaRef.current);
      // 还原被临时提升 z-index 的行
      const actionEl = areaRef.current?.querySelector<HTMLElement>(`[data-action-id="${action.id}"]`);
      const rowEl = actionEl?.closest<HTMLElement>('[class*="edit-row"]');
      if (rowEl) {
        rowEl.style.zIndex = rowEl.dataset.prevZIndex ?? '';
        delete rowEl.dataset.prevZIndex;
      }
      // 还原 overflow
      if (areaRef.current) {
        areaRef.current.style.overflow = areaRef.current.dataset.prevOverflow ?? '';
        delete areaRef.current.dataset.prevOverflow;
        const gridEl = areaRef.current.querySelector<HTMLElement>('.ReactVirtualized__Grid');
        if (gridEl) {
          gridEl.style.overflow = gridEl.dataset.prevOverflow ?? '';
          delete gridEl.dataset.prevOverflow;
        }
      }

      // 计算时间
      let { start, end } = parserTransformToTime({ left, width }, { scaleWidth, scale, startLeft });

      const isSelectionMultiDrag = (selectedActionIds?.length || 0) > 1 && selectedActionIds?.includes(action.id);
      if (isSelectionMultiDrag || isMultiDrag) {
        const originalTransform = parserTimeToTransform(
          { start: action.start, end: action.end },
          { startLeft, scale, scaleWidth }
        );
        setTransform({ ...originalTransform, top: 0 });
        if (onActionMoveEnd) {
          onActionMoveEnd({
            action,
            row,
            start,
            end,
            left,
            width,
            top,
            height,
            up: 0,
            isMultiDrag: true,
          });
        }
        return;
      }

      // Step 1: 根据鼠标垂直位置确定初始目标行
      const placement = resolveTargetRowPlacement({
        editorData,
        row,
        top,
        rowHeight,
        allowCreateTrack,
      });

      // Step 2: 如果初始目标行有冲突，用 smart row 向下级联寻找空位
      let finalTargetRowIndex: number;
      let finalNeedCreateNewRow: boolean;
      let finalNewRowPosition: 'before' | 'after' = placement.newRowPosition;

      if (placement.needCreateNewRow) {
        // 鼠标已在边界外，直接新建
        finalTargetRowIndex = placement.targetRowIndex;
        finalNeedCreateNewRow = true;
      } else {
        const smart = resolveSmartRow({
          editorData,
          initialTargetRowIndex: placement.targetRowIndex,
          actionId: id,
          start,
          end,
          allowCreateTrack,
        });
        finalTargetRowIndex = smart.targetRowIndex;
        finalNeedCreateNewRow = smart.needCreateNewRow;
        if (finalNeedCreateNewRow) finalNewRowPosition = 'after';
      }

      // 设置数据
      const sourceRowItem = editorData.find((item) => item.id === row.id);
      let targetRowItem: TimelineRow;

      if (finalNeedCreateNewRow) {
        const newRowId = `row_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const existingOrders = editorData.map((r) => r.order || 0);
        const newOrder =
          finalNewRowPosition === 'before'
            ? Math.min(...existingOrders) - 1
            : Math.max(...existingOrders) + 1;

        targetRowItem = {
          id: newRowId,
          actions: [],
          rowHeight: rowHeight,
          type: row.type,
          classNames: row.classNames,
          canUpload: row.canUpload,
          order: newOrder,
        };

        if (finalNewRowPosition === 'before') {
          editorData.unshift(targetRowItem);
          finalTargetRowIndex = 0;
        } else {
          editorData.push(targetRowItem);
          finalTargetRowIndex = editorData.length - 1;
        }
      } else {
        targetRowItem = editorData[finalTargetRowIndex];
      }

      const actionItem = sourceRowItem.actions.find((item) => item.id === id);

      // 直接使用拖拽落点时间，不做 ripple 推移
      actionItem.start = start;
      actionItem.end = end;

      // 如果拖拽到了不同的行，移动 action
      if (targetRowItem.id !== row.id) {
        sourceRowItem.actions = sourceRowItem.actions.filter((item) => item.id !== id);
        actionItem.order = targetRowItem.order;
        targetRowItem.actions.push(actionItem);

        // 源轨道空了则删除
        if (sourceRowItem.actions.length === 0) {
          const sourceRowIndex = editorData.findIndex((item) => item.id === sourceRowItem.id);
          if (sourceRowIndex !== -1) editorData.splice(sourceRowIndex, 1);
        }
      }

      targetRowItem.actions = targetRowItem.actions
        .map((item) => (item.id === actionItem.id ? actionItem : item))
        .sort((a, b) => a.start - b.start);

      setEditorData([...editorData]);

      // 更新transform以反映新位置
      const newTransform = parserTimeToTransform({ start, end }, { startLeft, scale, scaleWidth });

      setTransform({ ...newTransform, top: 0 });

      let up = 0; // -1 向上移动，1 向下移动，0 不移动

      if (targetRowItem.id !== row.id) {
        up = top > 0 ? 1 : -1;
      }

      fnCallback?.(actionItem);
      // 执行回调
      if (onActionMoveEnd)
        onActionMoveEnd({ action: actionItem, row: targetRowItem, start, end, isNewRow: finalNeedCreateNewRow, left, width, top, height, up, isMultiDrag: selectedActionIds?.length > 1 || isMultiDrag });
    },
    [action, allowCreateTrack, editorData, id, onActionMoveEnd, parserTimeToTransform, parserTransformToTime, row, scale, scaleWidth, setEditorData, setInsertPreview, setTrackPreview, startLeft, selectedActionIds],
  );

  const handleDragEnd = handleDragEndBase;

  const handleResizeStart: RndResizeStartCallback = (dir) => {
    onActionResizeStart && onActionResizeStart({ action, row, dir });
  };

  const handleResizing: RndResizeCallback = (dir, { left, width }) => {
    isDragWhenClick.current = true;
    if (onActionResizing) {
      const { start, end } = parserTransformToTime({ left, width }, { scaleWidth, scale, startLeft });
      const result = onActionResizing({ action, row, start, end, dir });
      if (result === false) return false;
    }
    setTransform({ left, width, top: transform.top });
    handleScaleCount(left, width);
  };

  const handleResizeEnd: RndResizeEndCallback = (dir, { left, width }) => {
    // 计算时间
    const { start, end } = parserTransformToTime({ left, width }, { scaleWidth, scale, startLeft });

    // 设置数据
    const rowItem = editorData.find((item) => item.id === row.id);
    const action = rowItem.actions.find((item) => item.id === id);

    const originalStart = action.start;
    const originalEnd = action.end;

    action.start = start;
    action.end = end;
    setEditorData(editorData);

    // 触发回调
    if (onActionResizeEnd) onActionResizeEnd({ action, row, start, end, dir, originalStart, originalEnd });
  };
  //#endregion

  const nowAction = {
    ...action,
    ...parserTransformToTime({ left: transform.left, width: transform.width }, { startLeft, scaleWidth, scale }),
  };

  const nowRow: TimelineRow = {
    ...row,
    actions: [...row.actions],
  };
  if (row.actions.includes(action)) {
    nowRow.actions[row.actions.indexOf(action)] = nowAction;
  }

  const currentRowIndex = editorData.findIndex((item) => item.id === row.id);

  useEffect(() => {
    const handleActionMoveEnd = (e: CustomEvent) => {
      const { left, width, top, height, id, fn } = e.detail || {};

      if (id === action.id) {
        handleDragEnd({ left, width, top, height, fn });
      }
    };
    window.addEventListener('action-move-end', handleActionMoveEnd);

    return () => {
      window.removeEventListener('action-move-end', handleActionMoveEnd);
    };
  }, [containerRef, handleDragEnd]);

  return (
    <RowDnd
      ref={rowRnd}
      parentRef={areaRef}
      verticalScrollRef={containerRef}
      start={startLeft}
      left={transform.left}
      width={transform.width}
      top={transform.top}
      height={rowHeight}
      grid={(gridSnap && gridSize) || DEFAULT_MOVE_GRID}
      adsorptionDistance={gridSnap ? Math.max((gridSize || DEFAULT_MOVE_GRID) / 2, DEFAULT_ADSORPTION_DISTANCE) : DEFAULT_ADSORPTION_DISTANCE}
      adsorptionPositions={adsorptionPositions}
      bounds={{
        left: leftLimit,
        right: rightLimit,
        top: -(currentRowIndex + 1) * rowHeight,
        bottom: (editorData.length - currentRowIndex + 1) * rowHeight,
      }}
      edges={{
        left: !disableDrag && flexible && `.${prefix('action-left-stretch')}`,
        right: !disableDrag && flexible && `.${prefix('action-right-stretch')}`,
      }}
      enableDragging={!disableDrag && movable}
      enableResizing={!disableDrag && flexible}
      onDragStart={handleDragStart}
      onDrag={handleDrag}
      onDragEnd={handleDragEnd}
      onResizeStart={handleResizeStart}
      onResize={handleResizing}
      onResizeEnd={handleResizeEnd}
      deltaScrollLeft={deltaScrollLeft}
      deltaScrollTop={handleDeltaScrollTop}
    >
      <div
        data-action-id={action.id}
        data-action-drag={dragging}
        data-action-name={action.file_name}
        data-action-disabled={action.is_disabled ? 1 : 0}
        onMouseDown={() => {
          isDragWhenClick.current = false;
          if ((selectedActionIds?.length || 0) > 0 && !selectedActionIds?.includes(action.id)) {
            window.dispatchEvent(
              new CustomEvent('replace-selection-action', {
                detail: {
                  actionId: action.id,
                  row,
                },
              }),
            );
          }
        }}
        onClick={(e) => {
          let time: number;
          if (onClickAction) {
            time = handleTime(e);
            onClickAction(e, { row, action, time: time });
          }
          if (!isDragWhenClick.current && onClickActionOnly) {
            if (!time) time = handleTime(e);
            onClickActionOnly(e, { row, action, time: time });
          }

          // 处理 Ctrl+ 点击选择
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            e.stopPropagation();
            const event = new CustomEvent('ctrl-click-action', {
              detail: {
                actionId: action.id,
                row,
                originalEvent: e.nativeEvent,
              },
            });
            window.dispatchEvent(event);
          }
        }}
        onDoubleClick={(e) => {
          if (onDoubleClickAction) {
            const time = handleTime(e);
            onDoubleClickAction(e, { row, action, time: time });
          }
        }}
        onContextMenu={(e) => {
          if (onContextMenuAction) {
            const time = handleTime(e);
            onContextMenuAction(e, { row, action, time: time });
          }
        }}
        className={prefix((classNames || []).join(' '))}
        style={{ height: rowHeight }}
      >
        {getActionRender && getActionRender(nowAction, nowRow)}
        {flexible && (
          <div className={prefix('action-left-stretch')}>
            <img src={stretchIcon} alt="" />
          </div>
        )}
        {flexible && (
          <div className={prefix('action-right-stretch')}>
            <img src={stretchIcon} alt="" />
          </div>
        )}
      </div>
    </RowDnd>
  );
};

export const EditAction = React.memo(EditActionO);
