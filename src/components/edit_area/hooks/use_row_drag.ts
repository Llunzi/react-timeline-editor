import React from 'react';
import { TimelineAction, TimelineRow } from '../../../interface/action';
import { parserTimeToPixel, parserTimeToTransform, parserTransformToTime } from '../../../utils/deal_data';

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
}

export interface MultiDragState {
  /** 是否正在多选拖拽 */
  isMultiDrag: boolean;
  /** 拖拽的主 action ID */
  primaryActionId?: string | null;
  /** 所有选中 action 的初始位置信息 */
  initialPositions: Map<string, { rowId: string; start: number; end: number; left: number; width: number }>;
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

export const useRowDrag = (options: UseRowDragOptions) => {
  const { selectedActionIds, editorData, containerRef, scale = 1, scaleWidth = 160, startLeft = 20, setEditorData } = options;

  // 多选拖拽状态
  const multiDragState = React.useRef<MultiDragState>({
    isMultiDrag: false,
    primaryActionId: null,
    initialPositions: new Map(),
    dragOffset: { dx: 0, dy: 0 },
    startCursor: null,
    isDraggingSelection: false, // 是否正在拖拽选中的元素
    start: 0,
    end: 0,
  });

  // 获取选中的 action DOM 元素
  const getSelectedActionEls = React.useCallback(() => {
    if (!containerRef?.current) return [];
    // 查找所有选中的 action 元素（action-selected 是选中状态的类名）
    const actions = containerRef.current.querySelectorAll('.timeline-editor-action-selected');
    return Array.from(actions) as HTMLElement[];
  }, [containerRef]);

  const actionEls = getSelectedActionEls();

  // 存储所有选中 action 的当前预览位置
  const [previewPositions, setPreviewPositions] = React.useState<Map<string, { left: number; width: number }>>(new Map());

  // 拖拽开始
  const onDragStart = React.useCallback(({ action, row }: { action: TimelineAction; row: TimelineRow }) => {
    // 检查是否有多选
    if (selectedActionIds.length <= 1) {
      console.log('useRowDrag: 单选拖拽，不进行多选处理');
      return;
    }

    // 获取当前选中的元素
    const selectedEls = getSelectedActionEls();
    if (selectedEls.length <= 1) {
      console.log('useRowDrag: DOM元素不足，跳过');
      return;
    }

    // 记录每个选中元素的初始位置
    const initialElementPositions = new Map<string, { x: number; y: number }>();

    selectedEls.forEach(el => {
      // 获取 action id
      const actionId = el.getAttribute('data-action-id');
      if (!actionId) return;

      // 获取当前 transform
      const style = window.getComputedStyle(el);
      const transform = style.transform;

      let x = 0, y = 0;
      if (transform && transform !== 'none') {
        // 解析 matrix
        const matrix = transform.match(/matrix\(([^)]+)\)/);
        if (matrix) {
          const values = matrix[1].split(', ');
          x = parseFloat(values[4]) || 0;
          y = parseFloat(values[5]) || 0;
        }
      }

      // 存储初始位置
      initialElementPositions.set(actionId, { x, y });

      // 初始化 data 属性
      el.setAttribute('data-x', x.toString());
      el.setAttribute('data-y', y.toString());

      console.log('useRowDrag: 初始化元素位置', { actionId, x, y });
    });

    // 记录初始位置信息（用于计算时间偏移）
    const initialPositions = new Map<string, { rowId: string; start: number; end: number; left: number; width: number }>();
    editorData.forEach((r) => {
      r.actions.forEach((a) => {
        if (selectedActionIds.includes(a.id)) {
          const transform = parserTimeToTransform(
            { start: a.start, end: a.end },
            { startLeft, scale, scaleWidth }
          );
          initialPositions.set(a.id, {
            rowId: r.id,
            start: a.start,
            end: a.end,
            left: transform.left,
            width: transform.width,
          });
        }
      });
    });

    // 记录初始位置
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

    console.log('useRowDrag: 开始多选拖拽', {
      actionId: action.id,
      selectedCount: selectedActionIds.length,
      elementCount: selectedEls.length
    });
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
  }) => {
    const { actionId, dx, dy } = params;
    const state = multiDragState.current;

    if (!state.isMultiDrag || !state.isDraggingSelection || !state.initialElementPositions) {
      return;
    }

    // 获取当前选中的元素
    const selectedEls = getSelectedActionEls();
    if (selectedEls.length === 0) return;

    // 更新偏移量
    state.offsetX = (state.offsetX || 0) + dx;
    state.offsetY = (state.offsetY || 0) + dy;

    // 遍历所有选中的元素，同步移动
    selectedEls.forEach(el => {
      const elActionId = el.getAttribute('data-action-id');
      if (!elActionId || elActionId === actionId) return;

      // 获取元素初始位置
      const initialPos = state.initialElementPositions.get(elActionId);
      if (!initialPos) return;

      // 计算新位置 = 初始位置 + 总偏移量
      const newX = initialPos.x + state.offsetX;
      const newY = initialPos.y + state.offsetY;

      // 更新元素位置
      el.style.transform = `translate(${newX}px, ${newY}px)`;

      // 存储当前位置数据
      el.setAttribute('data-x', newX.toString());
      el.setAttribute('data-y', newY.toString());
    });

    console.log('useRowDrag: 拖拽移动', {
      actionId,
      dx,
      dy,
      offsetX: state.offsetX,
      offsetY: state.offsetY,
      elementCount: selectedEls.length
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
  }) => {
    const state = multiDragState.current;
    const { up } = params || {};

    console.log('useRowDrag: 拖拽结束', params);

    // 清理 DOM 元素上的 data 属性
    const selectedEls = getSelectedActionEls();
    selectedEls.forEach(el => {
      el.removeAttribute('data-x');
      el.removeAttribute('data-y');
      // 清除 transform 样式
      el.style.transform = '';
    });

    if (!state.isMultiDrag || !params || params?.actionId !== state.primaryActionId) {
      // 清理状态
      multiDragState.current = {
        isMultiDrag: false,
        primaryActionId: null,
        initialPositions: new Map(),
        dragOffset: { dx: 0, dy: 0 },
        startCursor: null,
        isDraggingSelection: false,
        start: 0,
        end: 0,
      };
      setPreviewPositions(new Map());
      return;
    }

    const { actionId, left, width,  height, dx = 0, dy = 0 } = params;
    let { top } = params;
    const { initialPositions, primaryActionId, offsetX = 0, offsetY = 0 } = state;

    if (up === 0) {
      top = 0;
    } else if (up === 1) {
      top = -20;
    } else if (up === -1) {
      top = 20;
    }

    // 如果没有初始位置数据，说明不是有效的多选拖拽
    if (!setEditorData || initialPositions.size === 0) {
      // 清理状态
      multiDragState.current = {
        isMultiDrag: false,
        primaryActionId: null,
        initialPositions: new Map(),
        dragOffset: { dx: 0, dy: 0 },
        startCursor: null,
        isDraggingSelection: false,
        start: 0,
        end: 0,
      };
      setPreviewPositions(new Map());
      return;
    }

    // 计算主 action 的最终时间
    const primaryFinalTime = parserTransformToTime(
      { left, width },
      { startLeft, scale, scaleWidth }
    );

    // 计算主 action 的偏移量（时间）
    const primaryInitial = initialPositions.get(primaryActionId!);
    if (!primaryInitial) {
      multiDragState.current = {
        isMultiDrag: false,
        primaryActionId: null,
        initialPositions: new Map(),
        dragOffset: { dx: 0, dy: 0 },
        startCursor: null,
        isDraggingSelection: false,
        start: 0,
        end: 0,
      };
      setPreviewPositions(new Map());
      return;
    }

    const timeOffset = primaryFinalTime.start - primaryInitial.start;

    console.log('useRowDrag: 拖拽结束', {
      actionId,
      primaryInitialStart: primaryInitial.start,
      primaryFinalStart: primaryFinalTime.start,
      timeOffset,
      selectedCount: initialPositions.size,
      offsetX,
      offsetY
    });

    // 如果时间偏移太小，不更新数据
    if (Math.abs(timeOffset) < 0.001) {
      console.log('useRowDrag: 偏移太小，跳过更新');
      multiDragState.current = {
        isMultiDrag: false,
        primaryActionId: null,
        initialPositions: new Map(),
        dragOffset: { dx: 0, dy: 0 },
        startCursor: null,
        isDraggingSelection: false,
        start: 0,
        end: 0,
      };
      setPreviewPositions(new Map());
      return;
    }

    // ------------------------------------------------------------

    const { start, end, isMultiDrag } = multiDragState.current;
    // 如果是多选拖拽，处理所有选中的 actions
    if (isMultiDrag) {
      // 计算当前 action 的偏移量
      const currentStart = parserTransformToTime({ left, width }, { scaleWidth, scale, startLeft }).start;
      const deltaTime = currentStart - start;

      console.log('Multi-drag ended, deltaTime:', deltaTime);

      // 更新所有选中的 actions 的最终位置
      const updatedData = editorData.map((r) => ({
        ...r,
        actions: r.actions.map((a) => {
          if (selectedActionIds.includes(a.id) && primaryActionId !== a.id) {
            const newStart = a.start + deltaTime;
            const newEnd = a.end + deltaTime;

            // 计算 left, width, top, height
            const { left, width } = parserTimeToTransform({ start: newStart, end: newEnd }, { scaleWidth, scale, startLeft })

           setTimeout(() => {
            console.log('useRowDrag 1222: 拖拽结束', { left, width, top, height, id: a.id });
            window.dispatchEvent(new CustomEvent('action-move-end', { detail: { left, width, top, height, id: a.id } }));
           }, 0);
            return { ...a, start: newStart, end: newEnd };
          }
          return a;
        }),
      }));

      // setEditorData([...updatedData]);
      return;
    }

    // ------------------------------------------------------------

    // 清理状态
    multiDragState.current = {
      isMultiDrag: false,
      primaryActionId: null,
      initialPositions: new Map(),
      dragOffset: { dx: 0, dy: 0 },
      startCursor: null,
      isDraggingSelection: false,
      start: 0,
      end: 0,
    };
    setPreviewPositions(new Map());

    console.log('useRowDrag: 多选拖拽完成', { updatedCount: initialPositions.size });
  }, [editorData, setEditorData, scale, scaleWidth, startLeft, getSelectedActionEls, selectedActionIds]);

  // 获取指定 action 的预览位置
  const getPreviewPosition = React.useCallback((actionId: string): { left: number; width: number } | null => {
    return previewPositions.get(actionId) || null;
  }, [previewPositions]);

  // 检查是否是多选拖拽模式
  const isMultiDragging = React.useCallback((): boolean => {
    return multiDragState.current.isMultiDrag;
  }, []);

  // 获取当前拖拽状态
  const getMultiDragState = React.useCallback((): MultiDragState => {
    return multiDragState.current;
  }, []);

  return {
    onDragStart,
    onDragMove,
    onDragEnd,
    getPreviewPosition,
    isMultiDragging,
    getMultiDragState,
    isMultiDrag: multiDragState.current.isMultiDrag,
  };
};
