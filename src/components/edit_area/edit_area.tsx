import React, { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { AutoSizer, Grid, GridCellRenderer, OnScrollParams } from 'react-virtualized';
import { TimelineAction, TimelineRow } from '../../interface/action';
import { CommonProp } from '../../interface/common_prop';
import { EditData } from '../../interface/timeline';
import { prefix } from '../../utils/deal_class_prefix';
import { parserTimeToPixel, parserPixelToTime } from '../../utils/deal_data';
import { DragLines } from './drag_lines';
import './edit_area.less';
import { EditRow } from './edit_row';
import { useDragLine } from './hooks/use_drag_line';
import { useRowSelection } from './hooks/use_row_selection';
import { Upload, type UploadProps } from 'antd/es';
import { message } from 'antd/es';
import { Howl } from 'howler';
import { useRowDrag } from './hooks/use_row_drag';
import { ITimelineEngine } from '@/engine/engine';

// 获取音频时长
const getAudioDuration = (url: string): Promise<number> => {
  return new Promise((resolve) => {
    const sound = new Howl({ src: url });
    sound.on('load', () => {
      resolve(sound.duration());
      sound.unload();
    });

    setTimeout(() => {
      resolve(2); // 加载失败时返回默认时长2秒
      sound.unload();
    }, 6 * 1000); // 60秒超时 60 * 1000

    sound.on('loaderror', () => {
      resolve(2); // 加载失败时返回默认时长2秒
      sound.unload();
    });
  });
};

export type EditAreaProps = CommonProp & {
  className?: string;
  isMulti?: boolean;
  /** 距离左侧滚动距离 */
  scrollLeft: number;
  /** 距离顶部滚动距离 */
  scrollTop: number;
  /** 滚动回调，用于同步滚动 */
  onScroll: (params: OnScrollParams) => void;
  /** 设置编辑器数据 */
  setEditorData: (params: TimelineRow[]) => void;
  /** 设置scroll left */
  deltaScrollLeft: (scrollLeft: number) => void;
  /** 是否可以上传 */
  canUpload?: boolean;
  /** 自定义上传请求 */
  customRequest?: UploadProps['customRequest'];
  /** 允许拖拽创建新轨道 */
  allowCreateTrack?: boolean;
  /** time-editor-container的ref引用 */
  containerRef?: React.MutableRefObject<HTMLDivElement>;
  engineRef?: React.MutableRefObject<ITimelineEngine>;
  /** 最小高度 */
  minHeight?: number;
};

/** edit area ref数据 */
export interface EditAreaState {
  domRef: React.MutableRefObject<HTMLDivElement>;
}

const EditAreaO = React.forwardRef<EditAreaState, EditAreaProps>((props, ref) => {
  const {
    className,
    isMulti = false,
    editorData,
    rowHeight,
    scaleWidth,
    scaleCount,
    startLeft,
    scrollLeft,
    scrollTop,
    scale,
    hideCursor,
    cursorTime,
    onScroll,
    dragLine,
    getAssistDragLineActionIds,
    onActionMoveEnd,
    onActionMoveStart,
    onActionMoving,
    onActionResizeEnd,
    onActionResizeStart,
    onActionResizing,
    onUpdateEditorData,
    onMutiSelectChange,
    canUpload = false,
    customRequest,
    setEditorData,
    allowCreateTrack = true,
    containerRef,
    engineRef,
    minHeight,
  } = props;

  // 支持 mp3\wav 格式上传
  const onBeforeUpload = (file: File) => {
    if (file.type !== 'audio/mp3' && file.type !== 'audio/wav' && file.type !== 'audio/mpeg') {
      message.error('只能上传 mp3wav 格式的音频');
      return false;
    }

    const maxSize = 100 * 1024 * 1024;
    if (file.size > maxSize) {
      message.error('文件大小不能超过 100MB');
      return false;
    }

    return true;
  };

  const handleUploadChange = (row: TimelineRow) => {
    return async (info: any) => {
      console.log('Upload info:', info);
      if (!info.file || !info.file.response) {
        return;
      }
      const uid = info.file.uid;
      const duration = await getAudioDuration(info.file.response.url);

      const newAction: TimelineAction = {
        id: info.file.response?.id || uid,
        effectId: 'custom_video_effect',
        flexible: true,
        url: info.file.response.url,
        start: currentMouseTime,
        end: currentMouseTime + duration,
        isUpload: true,
      };

      onUpdateEditorData?.(row, [newAction]);
    };
  };

  const { dragLineData, initDragLine, updateDragLine, disposeDragLine, defaultGetAssistPosition, defaultGetMovePosition } = useDragLine();
  const editAreaRef = useRef<HTMLDivElement>();
  const gridRef = useRef<Grid>();
  const [currentMouseTime, setCurrentMouseTime] = useState<number>(0);
  const heightRef = useRef(-1);
  const uploadRef = useRef<any>();
  const [dropPreview, setDropPreview] = useState<{ position: 'before' | 'after'; rowIndex: number } | null>(null);
  const [dragIndicator, setDragIndicator] = useState<{ targetIndex: number; rowsMoved: number } | null>(null);

  // 框选功能
  const handleSelectionChange = useCallback(
    (selectedActionIds: string[]) => {
      // 更新 editorData 中每个 action 的选中状态
      const updatedData = editorData.map((row) => ({
        ...row,
        actions: row.actions.map((action) => ({
          ...action,
          selected: selectedActionIds.includes(action.id),
        })),
      }));
      setEditorData(updatedData);
      onMutiSelectChange?.(selectedActionIds);
    },
    [editorData, setEditorData, onMutiSelectChange],
  );

  const { DragSelection, selectedActionIds, onClickOutside, onCtrlClick, setSelectedActionIds } = useRowSelection({
    editorData,
    rowHeight,
    scrollTop,
    scrollLeft,
    onSelectionChange: handleSelectionChange,
    disabled: false,
    containerRef: editAreaRef,
  });

  const { onDragStart, onDragMove, onDragEnd } = useRowDrag({
    selectedActionIds,
    editorData,
    containerRef: editAreaRef as React.RefObject<HTMLDivElement>,
    scale,
    scaleWidth,
    startLeft,
    setEditorData,
    allowCreateTrack,
    rowHeight,
    onUpdateEditorData,
  });

  // 监听拖拽位置指示器事件
  useEffect(() => {
    const handleDragMove = (e: CustomEvent) => {
      setDragIndicator(e.detail);
    };

    const handleDragEnd = () => {
      setDragIndicator(null);
    };

    window.addEventListener('row-drag-move', handleDragMove as EventListener);
    window.addEventListener('row-drag-end', handleDragEnd);

    return () => {
      window.removeEventListener('row-drag-move', handleDragMove as EventListener);
      window.removeEventListener('row-drag-end', handleDragEnd);
    };
  }, []);

  // 处理拖拽上传事件
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    // 计算鼠标所在位置的时间
    if (!editAreaRef.current) return;
    const rect = editAreaRef.current.getBoundingClientRect();
    const position = e.clientX - rect.x;
    const left = position + scrollLeft;
    const time = parserPixelToTime(left, { startLeft, scale, scaleWidth });
    setCurrentMouseTime(time);

    console.log('拖拽上传位置的时间:', time);
  };

  // ref 数据
  useImperativeHandle(ref, () => ({
    get domRef() {
      return editAreaRef;
    },
  }));

  const handleInitDragLine: EditData['onActionMoveStart'] = (data) => {
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
      initDragLine({ assistPositions });
    }
  };

  const handleUpdateDragLine: EditData['onActionMoving'] = (data) => {
    if (dragLine) {
      const movePositions = defaultGetMovePosition({
        ...data,
        startLeft,
        scaleWidth,
        scale,
      });
      updateDragLine({ movePositions });
    }
  };

  useEffect(() => {
    if (!engineRef?.current) return;
    engineRef.current.on('mousedown', (data) => {
      console.log('mousedown', data);
      onClickOutside(data.target);
    });

    return () => {
      engineRef?.current?.off('mousedown');
    };
  }, [engineRef, onClickOutside]);

  // 监听 Ctrl+ 点击事件
  useEffect(() => {
    const handleCtrlClickAction = (e: CustomEvent) => {
      const { actionId, row } = e.detail;

      console.log('ctrl-click-action', row, ', editorData = ', editorData);
      setSelectedActionIds((ids) => {
        const newIds = new Set<string>();
        ids.forEach((id) => {
          editorData.forEach((item) => {
            item.actions.forEach((action) => {
              if (item.type === row.type && action.id === id) {
                newIds.add(id);
              } 
            });
          });
        });

        newIds.add(actionId);
        handleSelectionChange(Array.from(newIds));
        return new Set(newIds);
      });
    };

    window.addEventListener('ctrl-click-action', handleCtrlClickAction as EventListener);

    return () => {
      window.removeEventListener('ctrl-click-action', handleCtrlClickAction as EventListener);
    };
  }, [onCtrlClick, editorData, handleSelectionChange]);

  /** 获取每个cell渲染内容 */
  const cellRenderer: GridCellRenderer = ({ rowIndex, key, style }) => {
    const row = editorData[rowIndex]; // 行数据

    const editRow = (
      <EditRow
        {...props}
        style={{
          ...style,
          backgroundPositionX: `0, ${startLeft}px`,
          backgroundSize: `${startLeft}px, ${scaleWidth}px`,
        }}
        areaRef={editAreaRef}
        key={key}
        rowHeight={row?.rowHeight || rowHeight}
        rowData={row}
        dragLineData={dragLineData}
        allowCreateTrack={allowCreateTrack}
        setDropPreview={setDropPreview}
        containerRef={containerRef}
        selectedActionIds={selectedActionIds}
        onActionMoveStart={(data) => {
          handleInitDragLine(data);
          onDragStart({ action: data.action, row: data.row });
          return onActionMoveStart && onActionMoveStart(data);
        }}
        onActionResizeStart={(data) => {
          handleInitDragLine(data);

          return onActionResizeStart && onActionResizeStart(data);
        }}
        onActionMoving={(data) => {
          handleUpdateDragLine(data);
          // 传递拖拽参数给多选拖拽处理
          onDragMove({
            actionId: data.action.id,
            left: data.left,
            width: data.width,
            top: data.top || 0,
            height: data.height || 0,
            dx: (data.left || 0) - (data.lastLeft || 0),
            dy: (data.top || 0) - (data.lastTop || 0),
            lastLeft: data.lastLeft,
            lastWidth: data.lastWidth,
            lastTop: data.lastTop,
            lastHeight: data.lastHeight,
          });
          return onActionMoving && onActionMoving(data);
        }}
        onActionResizing={(data) => {
          handleUpdateDragLine(data);
          return onActionResizing && onActionResizing(data);
        }}
        onActionResizeEnd={(data) => {
          disposeDragLine();
          return onActionResizeEnd && onActionResizeEnd(data);
        }}
        onActionMoveEnd={(data) => {
          disposeDragLine();
          // 传递拖拽结束参数给多选拖拽处理
          onDragEnd({
            actionId: data.action.id,
            left: data.left || 0,
            width: data.width || 0,
            top: data.top || 0,
            height: data.height || 0,
            up: data.up || 0,
          });
          if (!data.isMultiDrag) {
            return onActionMoveEnd && onActionMoveEnd(data);
          }
          return;
        }}
      />
    );

    if (!!row && (canUpload || row?.canUpload)) {
      return (
        <Upload
          ref={uploadRef}
          key={key + 'upload'}
          style={{ width: '100%', display: 'block', ...style, top: 0 }}
          beforeUpload={onBeforeUpload}
          onChange={handleUploadChange(row)}
          showUploadList={false}
          openFileDialogOnClick={row.actions?.filter((item) => item.effectId === 'effect2').length > 0}
          customRequest={customRequest}
          onDrop={handleDrop}
          type="drag"
        >
          {editRow}
        </Upload>
      );
    }

    return editRow;
  };

  useLayoutEffect(() => {
    gridRef.current?.scrollToPosition({ scrollTop, scrollLeft });
  }, [scrollTop, scrollLeft]);

  useEffect(() => {
    gridRef.current.recomputeGridSize();
  }, [editorData]);

  let _totalHeight: number | string = editorData.reduce((prev, cur) => prev + (cur.rowHeight || rowHeight), 0) + ((className || '').indexOf('1') > -1 ? 12 : 32);
  if (minHeight) {
    _totalHeight = `calc(100% - ${minHeight + 16}px)`;
  }

  return (
    <div
      ref={editAreaRef}
      className={prefix('edit-area') + ` ${(className || '').replace('timeline-editor', '') || ''}`}
      style={{
        height: isMulti ? _totalHeight : 'unset',
        maxHeight: isMulti ? _totalHeight : 'unset',
        width: isMulti ? Math.max(scaleCount * scaleWidth + startLeft, 0) : 'unset',
        minWidth: isMulti ? '100%' : 'unset',
        minHeight: minHeight,
      }}
    >
      <AutoSizer style={{ height: isMulti ? _totalHeight : 'unset' }}>
        {({ width, height }) => {
          // 获取全部高度
          let totalHeight = 0;
          // 高度列表
          const heights = editorData.map((row) => {
            const itemHeight = (row.rowHeight || rowHeight) + 2;
            totalHeight += itemHeight;
            return itemHeight;
          });
          if (totalHeight < height && !isMulti) {
            heights.push(height - totalHeight);
            if (heightRef.current !== height && heightRef.current >= 0) {
              setTimeout(() =>
                gridRef.current?.recomputeGridSize({
                  rowIndex: heights.length - 1,
                }),
              );
            }
          }
          heightRef.current = height;

          return (
            <Grid
              columnCount={1}
              rowCount={heights.length}
              ref={gridRef}
              cellRenderer={cellRenderer}
              columnWidth={Math.max(scaleCount * scaleWidth + startLeft, width)}
              width={width}
              height={height}
              rowHeight={({ index }) => heights[index] || rowHeight}
              overscanRowCount={10}
              overscanColumnCount={0}
              onScroll={(param) => {
                onScroll(param);
              }}
            />
          );
        }}
      </AutoSizer>
      <DragSelection />
      {dragLine && <DragLines scrollLeft={scrollLeft} {...dragLineData} />}
      {dragIndicator &&
        (() => {
          // 计算拖拽位置指示器的位置
          let top = 0;
          const targetIndex = dragIndicator.targetIndex;

          for (let i = 0; i < Math.min(targetIndex, editorData.length); i++) {
            top += editorData[i].rowHeight || rowHeight;
          }

          return (
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: top - scrollTop + 16,
                height: '3px',
                backgroundColor: '#1890ff',
                boxShadow: '0 0 8px rgba(24, 144, 255, 0.6)',
                zIndex: 1001,
                pointerEvents: 'none',
                transition: 'top 0.05s ease-out',
              }}
            />
          );
        })()}
      {dropPreview &&
        (() => {
          // 计算预览指示器的位置
          let top = 0;
          for (let i = 0; i < editorData.length; i++) {
            if (dropPreview.position === 'before' && i === dropPreview.rowIndex) {
              break;
            }
            top += editorData[i].rowHeight || rowHeight;
            if (dropPreview.position === 'after' && i === dropPreview.rowIndex) {
              break;
            }
          }

          return (
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: top - scrollTop + 16,
                height: '2px',
                backgroundColor: 'transparent',
                borderTop: '2px dashed #1890ff',
                zIndex: 1000,
                pointerEvents: 'none',
              }}
            />
          );
        })()}
    </div>
  );
});

export const EditArea = React.memo(EditAreaO);
