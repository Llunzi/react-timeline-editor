import React, { FC, useState, useEffect, useMemo, useCallback } from 'react';
import { TimelineRow } from '../../interface/action';
import { CommonProp } from '../../interface/common_prop';
import { prefix } from '../../utils/deal_class_prefix';
import { parserPixelToTime } from '../../utils/deal_data';
import { DragLineData } from './drag_lines';
import { EditAction } from './edit_action';
import './edit_row.less';

export type EditRowProps = CommonProp & {
  areaRef: React.MutableRefObject<HTMLDivElement>;
  rowData?: TimelineRow;
  style?: React.CSSProperties;
  dragLineData?: DragLineData;
  setEditorData: (params: TimelineRow[]) => void;
  /** 距离左侧滚动距离 */
  scrollLeft: number;
  /** 设置 scroll left */
  deltaScrollLeft: (scrollLeft: number) => void;
  /** 允许拖拽创建新轨道 */
  allowCreateTrack?: boolean;
  /** 设置预览指示器位置 */
  setDropPreview?: (preview: { position: 'before' | 'after'; rowIndex: number } | null) => void;
  /** time-editor-container 的 ref 引用 */
  containerRef?: React.MutableRefObject<HTMLDivElement>;
  /** 选中的 action IDs */
  selectedActionIds?: string[];
  /** 设置光标位置 */
  setCursor?: (param: { left?: number; time?: number }) => void;
  uploadBgMusic?: (file: File[], row?: TimelineRow) => void;
};

export const EditRow: FC<EditRowProps> = (props) => {
  const {
    rowData,
    style = {},
    onClickRow,
    onDoubleClickRow,
    onContextMenuRow,
    areaRef,
    scrollLeft,
    startLeft,
    scale,
    scaleWidth,
    allowCreateTrack,
    containerRef,
    selectedActionIds = [],
    setCursor,
    hideCursor,
    uploadBgMusic,
  } = props;

  const [visibleCount, setVisibleCount] = useState(20);

  const classNames = ['edit-row'];
  if (rowData?.selected) classNames.push('selected');

  const clientWidth = document.documentElement.clientWidth;
  const timeStart = parserPixelToTime(scrollLeft - 400, { startLeft, scale, scaleWidth });
  const timeEnd = parserPixelToTime(scrollLeft + clientWidth + 400, { startLeft, scale, scaleWidth });

  const visibleActions = useMemo(() => {
    return (rowData?.actions || [])
      .filter((action) => action.end >= timeStart && action.start <= timeEnd)
      .sort((a, b) => a.start - b.start);
  }, [rowData?.actions, timeStart, timeEnd]);

  const renderActions = useMemo(() => {
    return visibleActions.slice(0, visibleCount);
  }, [visibleActions, visibleCount]);

  useEffect(() => {
    if (visibleCount < visibleActions.length) {
      const timer = requestAnimationFrame(() => {
        setVisibleCount((prev) => Math.min(prev + 20, visibleActions.length));
      });
      return () => cancelAnimationFrame(timer);
    }
  }, [visibleCount, visibleActions.length]);

  useEffect(() => {
    setVisibleCount(20);
  }, [rowData?.id]);

  const handleTime = useCallback(
    (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
      if (!areaRef.current) return;
      const rect = areaRef.current.getBoundingClientRect();
      const position = e.clientX - rect.x;
      const left = position + scrollLeft;
      const time = parserPixelToTime(left, { startLeft, scale, scaleWidth });
      return time;
    },
    [areaRef, scrollLeft, startLeft, scale, scaleWidth]
  );

  return (
    <div
      className={`${prefix(...classNames)} ${(rowData?.classNames || []).join(' ')}`}
      style={style}
      data-row-id={rowData?.id}
      data-y="0"
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();

        if (rowData.canUpload) {
          const files = e.dataTransfer.files;
          // @ts-expect-error 因为 files 是 FileList 类型，不能直接修改 uid 属性
          files[0].uid = new Date().getTime().toString();
          uploadBgMusic?.(Array.from(files), rowData);
        }
      }}
      onClick={(e) => {
        // const action = (e.target as HTMLElement)?.closest('.timeline-editor-action');
        const time = handleTime(e);
        if (rowData && onClickRow) {
          onClickRow(e, { row: rowData, time: time });
        }

        // if (hideCursor) return;
        // if (setCursor && !action) {
        //   setCursor({ time });
        // }
      }}
      onDoubleClick={(e) => {
        if (rowData && onDoubleClickRow) {
          const time = handleTime(e);
          onDoubleClickRow(e, { row: rowData, time: time });
        }
      }}
      onContextMenu={(e) => {
        if (rowData && onContextMenuRow) {
          const time = handleTime(e);
          onContextMenuRow(e, { row: rowData, time: time });
        }
      }}
    >
      {renderActions.map((action) => (
        <EditAction
          key={action.id}
          {...props}
          handleTime={handleTime}
          row={rowData}
          action={action}
          allowCreateTrack={allowCreateTrack}
          setDropPreview={props.setDropPreview}
          containerRef={containerRef}
          selectedActionIds={selectedActionIds}
        />
      ))}
    </div>
  );
};
