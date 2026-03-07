import React, { memo, useCallback, useState, useMemo, forwardRef, useImperativeHandle } from "react";
import { TimelineAction, TimelineRow } from "../../../interface/action";
import { parserActionsToPositions, parserTimeToPixel, parserTimeToTransform } from "../../../utils/deal_data";
import { DragLines, DragLineProps } from "../drag_lines";

export interface DragLineControllerRef {
  initDragLine: (data: { action: TimelineAction; row: TimelineRow }) => void;
  updateDragLine: (data: { start: number; end: number; dir?: "right" | "left" }) => void;
  disposeDragLine: () => void;
}

interface DragLineControllerProps {
  dragLine: boolean;
  editorData: TimelineRow[];
  cursorTime: number;
  scale: number;
  scaleWidth: number;
  startLeft: number;
  hideCursor: boolean;
  scrollLeft: number;
  getAssistDragLineActionIds?: (params: { action: TimelineAction; row: TimelineRow; editorData: TimelineRow[] }) => string[];
}

const defaultGetAssistPosition = (
  data: {
    editorData: TimelineRow[];
    assistActionIds?: string[];
    action: TimelineAction;
    row: TimelineRow;
    startLeft: number;
    scale: number;
    scaleWidth: number;
    hideCursor: boolean;
    cursorLeft: number;
  }
) => {
  const { editorData, assistActionIds, action, row, scale, scaleWidth, startLeft, cursorLeft, hideCursor } = data;
  const otherActions: TimelineAction[] = [];
  if (assistActionIds) {
    editorData.forEach((rowItem) => {
      rowItem.actions.forEach((actionItem) => {
        if (assistActionIds.includes(actionItem.id)) otherActions.push(actionItem);
      });
    });
  } else {
    editorData.forEach((rowItem) => {
      if (rowItem.id !== row.id) {
        otherActions.push(...rowItem.actions);
      } else {
        rowItem.actions.forEach((actionItem) => {
          if (actionItem.id !== action.id) otherActions.push(actionItem);
        });
      }
    });
  }

  const positions = parserActionsToPositions(otherActions, {
    startLeft,
    scale,
    scaleWidth,
  });
  if (!hideCursor) positions.push(cursorLeft);

  return positions;
};

const defaultGetMovePosition = (data: { start: number; end: number; dir?: "right" | "left"; startLeft: number; scale: number; scaleWidth: number }) => {
  const { start, end, dir, scale, scaleWidth, startLeft } = data;
  const { left, width } = parserTimeToTransform({ start, end }, { startLeft, scaleWidth, scale });
  if (!dir) return [left, left + width];
  return dir === "right" ? [left + width] : [left];
};

interface DragLineDataState {
  isMoving: boolean;
  movePositions: number[];
  assistPositions: number[];
}

export const DragLineController = memo(
  forwardRef<DragLineControllerRef, DragLineControllerProps>((props, ref) => {
    const {
      dragLine,
      editorData,
      cursorTime,
      scale,
      scaleWidth,
      startLeft,
      hideCursor,
      scrollLeft,
      getAssistDragLineActionIds,
    } = props;

    const [dragLineData, setDragLineData] = useState<DragLineDataState>({
      isMoving: false,
      movePositions: [],
      assistPositions: [],
    });


    console.log('dragLineData = ', dragLineData);

    const initDragLine = useCallback(
      (data: { action: TimelineAction; row: TimelineRow }) => {
        if (dragLine) {
          const assistActionIds =
            getAssistDragLineActionIds &&
            getAssistDragLineActionIds({
              action: data.action,
              row: data.row,
              editorData,
            });
          const cursorLeft = parserTimeToPixel(cursorTime, { scaleWidth, scale, startLeft });
          const assistPositions = defaultGetAssistPosition({
            editorData,
            assistActionIds,
            action: data.action,
            row: data.row,
            scale,
            scaleWidth,
            startLeft,
            hideCursor,
            cursorLeft,
          });
          setDragLineData({
            isMoving: true,
            movePositions: [],
            assistPositions,
          });
        }
      },
      [dragLine, editorData, cursorTime, scale, scaleWidth, startLeft, hideCursor, getAssistDragLineActionIds]
    );

    const updateDragLine = useCallback(
      (data: { start: number; end: number; dir?: "right" | "left" }) => {
        if (dragLine) {
          const movePositions = defaultGetMovePosition({
            ...data,
            startLeft,
            scaleWidth,
            scale,
          });
          setDragLineData((prev) => ({
            ...prev,
            movePositions,
          }));
        }
      },
      [dragLine, startLeft, scaleWidth, scale]
    );

    const disposeDragLine = useCallback(() => {
      setDragLineData({
        isMoving: false,
        movePositions: [],
        assistPositions: [],
      });
    }, []);

    useImperativeHandle(ref, () => ({
      initDragLine,
      updateDragLine,
      disposeDragLine,
    }), [initDragLine, updateDragLine, disposeDragLine]);

    const dragLinesProps: DragLineProps = useMemo(
      () => ({
        isMoving: dragLineData.isMoving,
        movePositions: dragLineData.movePositions,
        assistPositions: dragLineData.assistPositions,
        scrollLeft,
      }),
      [dragLineData.isMoving, dragLineData.movePositions, dragLineData.assistPositions, scrollLeft]
    );

    if (!dragLine) return null;

    return <DragLines {...dragLinesProps} />;
  })
);

DragLineController.displayName = "DragLineController";
