import { useCallback, useEffect, useState } from 'react';
import { useSelectionContainer } from '@air/react-drag-to-select';
import { TimelineRow } from '../../../interface/action';

export interface UseRowSelectionOptions {
  editorData: TimelineRow[];
  rowHeight: number;
  scrollTop: number;
  scrollLeft: number;
  onSelectionChange: (selectedActionIds: string[]) => void;
  disabled?: boolean;
  containerRef?: React.RefObject<HTMLDivElement>;
}

export const useRowSelection = (options: UseRowSelectionOptions) => {
  const {
    editorData,
    rowHeight,
    scrollTop,
    scrollLeft,
    onSelectionChange,
    disabled = false,
    containerRef,
  } = options;

  const [selectedActionIds, setSelectedActionIds] = useState<Set<string>>(new Set());

  // 计算框选区域与 action 的交集
  const getIntersectedActions = useCallback(
    (box: { left: number; top: number; width: number; height: number }) => {
      const intersectedActionIds: string[] = [];

      // 直接从 container 获取滚动值
      const currentScrollLeft = containerRef.current?.scrollLeft || 0;
      const currentScrollTop = containerRef.current?.scrollTop || 0;

      // box 坐标是相对于可视区域的，需要减去滚动偏移量才能得到相对于 container 的坐标
      const boxTop = box.top - currentScrollTop;
      const boxBottom = boxTop + box.height;
      const boxLeft = box.left - currentScrollLeft;
      const boxRight = boxLeft + box.width;

      editorData.forEach((row) => {
        // 检查框选区域是否与 action 相交
        row.actions.forEach((action) => {
          if (action.is_disabled) return;
          const actionEl = containerRef.current?.querySelector(`.timeline-editor-action[data-action-id="${action.id}"]`) as HTMLElement;
          if (actionEl) {
            const actionRect = actionEl.getBoundingClientRect();
            const actionLeft = actionRect.left;
            const actionTop = actionRect.top;
            const actionWidth = actionRect.width;
            const actionHeight = actionRect.height;
            const actionRight = actionLeft + actionWidth;
            const actionBottom = actionTop + actionHeight;

            // 检查框选区域是否与 action 相交
            const isActionIntersecting = boxLeft < actionRight && boxRight > actionLeft &&
              boxTop < actionBottom && boxBottom > actionTop;

            if (isActionIntersecting) {
              intersectedActionIds.push(action.id);
            }
          }
        });
      });

      return { actionIds: intersectedActionIds };
    },
    [editorData, rowHeight, scrollTop, scrollLeft, containerRef]
  );

  // 使用 @air/react-drag-to-select 的框选功能
  const { DragSelection } = useSelectionContainer({
    onSelectionChange: (box) => {
      if (disabled) return;

      // 边界检查：确保框选区域有效
      if (!box || box.width < 5 || box.height < 5) {
        return;
      }

      const { actionIds } = getIntersectedActions(box);

      const newSelectedActionIds = new Set(actionIds);

      // 只在选中状态变化时更新
      if (
        newSelectedActionIds.size !== selectedActionIds.size ||
        ![...newSelectedActionIds].every((id) => selectedActionIds.has(id))
      ) {
        setSelectedActionIds(newSelectedActionIds);
        onSelectionChange(actionIds);
      }
    },
    onSelectionStart: () => {
      if (!disabled) {
        // 清除之前的选择
        setSelectedActionIds(new Set());
        onSelectionChange([]);
      }
    },
    onSelectionEnd: () => {
      // 框选结束时的处理（可用于性能优化）
    },
    shouldStartSelecting: (target) => {
      if (disabled) return false;

      // 不在 action 元素上启动框选
      const element = target as HTMLElement;

      if (
        element.closest?.('.timeline-editor-action[data-action-disabled="0"]') ||
        element.closest?.('.timeline-editor-edit-action') ||
        element.closest?.('[data-draggable="true"]') ||
        element.closest?.('.timeline-editor-edit-row.dragging')
      ) {
        return false;
      }

      return true;
    },
    selectionProps: {
      className: 'timeline-editor-selection-box',
      style: {
        border: '2px solid #1890ff',
        backgroundColor: 'rgba(24, 144, 255, 0.1)',
        zIndex: 9999,
      },
    },
    isEnabled: !disabled,
    eventsElement: containerRef?.current,
  });

  // 清除选择
  const clearSelection = useCallback(() => {
    setSelectedActionIds(new Set());
    onSelectionChange([]);
  }, [onSelectionChange]);

  // 处理 Ctrl+ 点击选择
  const handleCtrlClick = useCallback(
    (actionId: string, event: MouseEvent) => {
      if (disabled) return;

      const newSelectedActionIds = new Set(selectedActionIds);

      if (newSelectedActionIds.has(actionId)) {
        // 如果已选中，则取消选中
        newSelectedActionIds.delete(actionId);
      } else {
        // 如果未选中，则添加选中
        newSelectedActionIds.add(actionId);
      }

      setSelectedActionIds(newSelectedActionIds);
      onSelectionChange(Array.from(newSelectedActionIds));
    },
    [disabled, selectedActionIds, onSelectionChange]
  );

  // 点击空白区域取消选择
  const handleClickOutside = useCallback(
    (target: HTMLElement) => {
      if (disabled) return;
      
      // 如果点击的不是选中的 action 或框选框，清除选择
      if (
        !target.closest('.timeline-editor-selection-box') &&
        !target.closest('.timeline-editor-action') &&
        !target.closest('[data-draggable="true"]') &&
        !target.closest('.voice-studio-right-config-panel') &&
        !target.closest('.voice-studio-main-content-panel') &&
        !target.closest('.ant-modal')
      ) {
        clearSelection();
      }
    },
    [disabled, clearSelection]
  );

  // 监听 Escape 键取消选择
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (disabled) return;
      
      if (e.key === 'Escape' && selectedActionIds.size > 0) {
        clearSelection();
      }
    },
    [disabled, selectedActionIds.size, clearSelection]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  return {
    DragSelection,
    selectedActionIds: Array.from(selectedActionIds),
    clearSelection,
    onClickOutside: handleClickOutside,
    onCtrlClick: handleCtrlClick,
    setSelectedActionIds,
  };
};
