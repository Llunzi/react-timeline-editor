import React, { FC, useLayoutEffect, useRef, useState } from 'react';
import { TimelineAction, TimelineRow } from '../../interface/action';
import { CommonProp } from '../../interface/common_prop';
import { DEFAULT_ADSORPTION_DISTANCE, DEFAULT_MOVE_GRID } from '../../interface/const';
import { prefix } from '../../utils/deal_class_prefix';
import { getScaleCountByPixel, parserTimeToPixel, parserTimeToTransform, parserTransformToTime } from '../../utils/deal_data';
import { RowDnd } from '../row_rnd/row_rnd';
import { RndDragCallback, RndDragEndCallback, RndDragStartCallback, RndResizeCallback, RndResizeEndCallback, RndResizeStartCallback, RowRndApi } from '../row_rnd/row_rnd_interface';
import { DragLineData } from './drag_lines';
import './edit_action.less';
import stretchIcon from '../../assets/stretch.svg';

export type EditActionProps = CommonProp & {
  row: TimelineRow;
  action: TimelineAction;
  dragLineData: DragLineData;
  setEditorData: (params: TimelineRow[]) => void;
  handleTime: (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => number;
  areaRef: React.MutableRefObject<HTMLDivElement>;
  /** 设置scroll left */
  deltaScrollLeft?: (delta: number) => void;
};

export const EditAction: FC<EditActionProps> = ({
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
}) => {
  const rowRnd = useRef<RowRndApi>();
  const isDragWhenClick = useRef(false);
  const { id, maxEnd, minStart, end, start, selected, flexible = true, movable = true, effectId } = action;

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
    onActionMoveStart && onActionMoveStart({ action, row });
  };
  const handleDrag: RndDragCallback = ({ left, width, top }) => {
    isDragWhenClick.current = true;

    if (onActionMoving) {
      const { start, end } = parserTransformToTime({ left, width }, { scaleWidth, scale, startLeft });
      const result = onActionMoving({ action, row, start, end });
      if (result === false) return false;
    }
    setTransform({ left, width, top: top || 0 });
    handleScaleCount(left, width);
  };

  const handleDragEnd: RndDragEndCallback = ({ left, width, top, height }) => {
    // 计算时间
    let { start, end } = parserTransformToTime({ left, width }, { scaleWidth, scale, startLeft });

    // 检测目标row
    let targetRowIndex = editorData.findIndex((item) => item.id === row.id);
    if (top !== undefined && height !== undefined) {
      // 通过Y轴位置计算目标row的索引
      const currentRowIndex = editorData.findIndex((item) => item.id === row.id);
      const rowHeightValue = rowHeight || 32; // 使用默认行高或传入的行高
      const rowOffset = Math.round(top / rowHeightValue);
      targetRowIndex = Math.max(0, Math.min(currentRowIndex + rowOffset, editorData.length - 1));
    }

    // 设置数据
    const sourceRowItem = editorData.find((item) => item.id === row.id);
    const targetRowItem = editorData[targetRowIndex];
    const actionItem = sourceRowItem.actions.find((item) => item.id === id);

    // 碰撞检测函数 - 适用于同一row和跨row
    const checkAndAdjustCollision = () => {
      // 获取目标row中除了当前action之外的所有actions
      const otherActions = targetRowItem.actions.filter((act) => act.id !== id);

      console.log('=== Collision Detection ===');
      console.log('Current action:', id, 'position:', start, '-', end);
      console.log('Other actions in target row:', otherActions.map(a => `${a.id}(${a.start}-${a.end})`));

      // 如果没有其他actions,直接使用原时间
      if (otherActions.length === 0) {
        console.log('No other actions, using original position');
        return { start, end, found: true };
      }

      // 检查是否有碰撞 - 使用更严格的重叠检测
      const collisions = otherActions.filter((existingAction) => {
        const hasOverlap = !(end <= existingAction.start || start >= existingAction.end);
        if (hasOverlap) {
          console.log('Collision detected with:', existingAction.id, `(${existingAction.start}-${existingAction.end})`);
        }
        return hasOverlap;
      });

      const hasCollision = collisions.length > 0;
      console.log('Has collision:', hasCollision);

      if (hasCollision) {
        // 如果有碰撞,尝试找到最近的可用位置
        const sortedActions = [...otherActions].sort((a, b) => a.start - b.start);
        const duration = end - start;
        let foundPosition = false;
        let minDistance = Number.MAX_SAFE_INTEGER;
        let bestPosition = { start, end };

        console.log('Sorted actions:', sortedActions.map(a => `${a.id}(${a.start}-${a.end})`).join(', '));
        console.log('Duration:', duration);

        // 检查第一个action之前的空间
        if (start < sortedActions[0].start) {
          if (end <= sortedActions[0].start) {
            // 当前位置可用,直接使用
            console.log('Position before first action is available');
            return { start, end, found: true };
          } else {
            // 需要调整到第一个action之前
            const candidateEnd = sortedActions[0].start;
            const candidateStart = candidateEnd - duration;
            const distance = Math.abs(candidateStart - start);
            console.log('Candidate before first action:', candidateStart, '-', candidateEnd, 'distance:', distance);
            if (distance < minDistance) {
              minDistance = distance;
              bestPosition = { start: candidateStart, end: candidateEnd };
              foundPosition = true;
            }
          }
        }

        // 检查每个action之间的间隙
        for (let i = 0; i < sortedActions.length; i++) {
          const currentAction = sortedActions[i];
          const nextAction = sortedActions[i + 1];

          if (nextAction) {
            const gapStart = currentAction.end;
            const gapEnd = nextAction.start;
            const gapSize = gapEnd - gapStart;

            if (gapSize >= duration) {
              // 间隙足够大,考虑这个位置
              const candidateStart = gapStart;
              const candidateEnd = candidateStart + duration;
              const distance = Math.abs(candidateStart - start);
              console.log(`Gap between ${currentAction.id} and ${nextAction.id}:`, gapStart, '-', gapEnd, 'size:', gapSize, 'candidate:', candidateStart, '-', candidateEnd, 'distance:', distance);
              if (distance < minDistance) {
                minDistance = distance;
                bestPosition = { start: candidateStart, end: candidateEnd };
                foundPosition = true;
              }
            }
          } else {
            // 最后一个action之后
            const candidateStart = Math.max(start, currentAction.end);
            const candidateEnd = candidateStart + duration;
            const distance = Math.abs(candidateStart - start);
            console.log('Candidate after last action:', candidateStart, '-', candidateEnd, 'distance:', distance);
            if (distance < minDistance) {
              minDistance = distance;
              bestPosition = { start: candidateStart, end: candidateEnd };
              foundPosition = true;
            }
          }
        }

        console.log('Best position found:', foundPosition, bestPosition);
        if (foundPosition) {
          return { start: bestPosition.start, end: bestPosition.end, found: true };
        } else {
          return { start, end, found: false };
        }
      }

      console.log('No collision, using original position');
      return { start, end, found: true };
    };

    // 执行碰撞检测和调整
    const adjustmentResult = checkAndAdjustCollision();

    if (!adjustmentResult.found) {
      // 如果找不到合适位置,取消移动
      console.warn('Cannot find suitable position, cancelling move');
      return;
    }

    // 使用调整后的时间
    start = adjustmentResult.start;
    end = adjustmentResult.end;

    console.log('Final position:', start, '-', end);

    // 更新action的时间
    actionItem.start = start;
    actionItem.end = end;

    // 如果拖拽到了不同的row,需要移动action
    if (targetRowItem.id !== row.id) {
      // 从原row中移除
      sourceRowItem.actions = sourceRowItem.actions.filter((item) => item.id !== id);
      // 添加到目标row
      targetRowItem.actions.push(actionItem);
    }

    setEditorData([...editorData]);

    // 更新transform以反映新位置
    const newTransform = parserTimeToTransform({ start, end }, { startLeft, scale, scaleWidth });
    setTransform({ ...newTransform, top: 0 });

    // 执行回调
    if (onActionMoveEnd) onActionMoveEnd({ action: actionItem, row: targetRowItem, start, end });
  };

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
    action.start = start;
    action.end = end;
    setEditorData(editorData);

    // 触发回调
    if (onActionResizeEnd) onActionResizeEnd({ action, row, start, end, dir });
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

  return (
    <RowDnd
      ref={rowRnd}
      parentRef={areaRef}
      start={startLeft}
      left={transform.left}
      width={transform.width}
      top={transform.top}
      height={rowHeight}
      grid={(gridSnap && gridSize) || DEFAULT_MOVE_GRID}
      adsorptionDistance={gridSnap ? Math.max((gridSize || DEFAULT_MOVE_GRID) / 2, DEFAULT_ADSORPTION_DISTANCE) : DEFAULT_ADSORPTION_DISTANCE}
      adsorptionPositions={dragLineData.assistPositions}
      bounds={{
        left: leftLimit,
        right: rightLimit,
        top: -(editorData.findIndex(item => item.id === row.id)) * rowHeight,
        bottom: (editorData.length - editorData.findIndex(item => item.id === row.id)) * rowHeight,
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
    >
      <div
        onMouseDown={() => {
          isDragWhenClick.current = false;
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
        {flexible && <div className={prefix('action-left-stretch')} >
          <img src={stretchIcon} alt="" />
        </div>}
        {flexible && <div className={prefix('action-right-stretch')} >
          <img src={stretchIcon} alt="" />
        </div>}
      </div>
    </RowDnd>
  );
};
