import React, { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AutoSizer, Grid, GridCellRenderer, OnScrollParams } from 'react-virtualized';
import { TimelineAction, TimelineRow } from '../../interface/action';
import { CommonProp } from '../../interface/common_prop';
import { EditData } from '../../interface/timeline';
import { prefix } from '../../utils/deal_class_prefix';
import { parserPixelToTime, parserTimeToTransform } from '../../utils/deal_data';
import './edit_area.less';
import { EditRow } from './edit_row';
import { useRowSelection } from './hooks/use_row_selection';
import { type UploadProps } from 'antd/es';
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
  /** 设置 scroll left */
  deltaScrollLeft: (scrollLeft: number) => void;
  /** 设置光标位置 */
  setCursor: (param: { left?: number; time?: number }) => void;
  /** 是否可以上传 */
  canUpload?: boolean;
  /** 自定义上传请求 */
  customRequest?: UploadProps['customRequest'];
  /** 允许拖拽创建新轨道 */
  allowCreateTrack?: boolean;
  /** time-editor-container 的 ref 引用 */
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
    setCursor,
    allowCreateTrack = true,
    containerRef,
    engineRef,
    minHeight,
  } = props;

  // 支持 mp3\wav 格式上传
  const onBeforeUpload = (file: File) => {
    if (file.type !== 'audio/mp3' && file.type !== 'audio/wav' && file.type !== 'audio/mpeg') {
      message.error('只能上传mp3、wav格式的音频');
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
      if (!info.file) return;
      const maxSize = 100 * 1024 * 1024;
      if (info.file.size > maxSize) return false;
      if (info.file.type !== 'audio/mp3' && info.file.type !== 'audio/wav' && info.file.type !== 'audio/mpeg') {
        return false;
      }
      if (info.file.status === 'error') {
        onUpdateEditorData?.(row, [
          {
            id: info.file.uid,
            isUploading: false,
            start: 0,
            end: 0,
            effectId: 'custom_video_effect',
            isError: true,
            segment_type: 'bgm',
            uid: info.file.uid,
          },
        ]);
        return;
      }
      if (!info.file.response) {
        const hasDefault = row.actions.some((action) => action.id === 'upload-bg-music');
        const totalDuration = hasDefault
          ? 0
          : row.actions.reduce(
              (max, current) => {
                const currentEnd = current.end || 0;
                const maxEnd = max?.end ?? 0;
                return currentEnd > maxEnd ? current : max;
              },
              { end: 0 },
            ).end || 0;

        const newAction: TimelineAction = {
          id: info.file.uid,
          effectId: 'custom_video_effect',
          flexible: true,
          url: '',
          start: totalDuration,
          end: totalDuration + 5,
          isUpload: true,
          segment_type: 'bgm',
          isUploading: info.isUploading || false,
        };

        onUpdateEditorData?.(row, [newAction]);
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
        segment_type: 'bgm',
        isUploading: false,
        uid: info.file?.uid,
      };

      onUpdateEditorData?.(row, [newAction]);
    };
  };

  const editAreaRef = useRef<HTMLDivElement>();
  const gridRef = useRef<Grid>();
  const [currentMouseTime, setCurrentMouseTime] = useState<number>(0);
  const heightRef = useRef(-1);
  const uploadRef = useRef<any>();

  // ---- drag overlay: imperative DOM updates to avoid React re-renders on every mousemove ----
  const insertPreviewDomRef = useRef<HTMLDivElement>(null);
  const trackPreviewRowDomRef = useRef<HTMLDivElement>(null);
  const trackPreviewLineDomRef = useRef<HTMLDivElement>(null);
  const dragIndicatorDomRef = useRef<HTMLDivElement>(null);

  // Latest data refs for re-applying positions on scroll
  const insertPreviewDataRef = useRef<{
    actionId: string; rowId: string; start: number; end: number; shiftByActionId: Record<string, number>;
  } | null>(null);
  const trackPreviewDataRef = useRef<
    | { kind: 'row'; rowId: string }
    | { kind: 'new-row'; insertIndex: number; sourceRow: TimelineRow }
    | null
  >(null);
  const dragIndicatorDataRef = useRef<{ targetIndex: number; rowsMoved: number } | null>(null);

  // Always-current snapshot of render-time props, read safely inside stable callbacks
  const liveRef = useRef({ scrollTop, startLeft, scale, scaleWidth, editorData, rowHeight });
  liveRef.current = { scrollTop, startLeft, scale, scaleWidth, editorData, rowHeight };

  const setInsertPreview = useCallback((preview: typeof insertPreviewDataRef['current']) => {
    insertPreviewDataRef.current = preview;
    const div = insertPreviewDomRef.current;
    if (!div) return;
    if (!preview) { div.style.display = 'none'; return; }
    const { scrollTop: st, startLeft: sl, scale: sc, scaleWidth: sw, editorData: ed, rowHeight: rh } = liveRef.current;
    const targetIndex = ed.findIndex((item) => item.id === preview.rowId);
    if (targetIndex < 0) { div.style.display = 'none'; return; }
    let top = 0;
    for (let i = 0; i < targetIndex; i++) top += (ed[i].rowHeight || rh) + 2;
    const rowH = ed[targetIndex].rowHeight || rh;
    const t = parserTimeToTransform({ start: preview.start, end: preview.end }, { startLeft: sl, scale: sc, scaleWidth: sw });
    div.style.display = 'block';
    div.style.left = `${t.left}px`;
    div.style.width = `${t.width}px`;
    div.style.top = `${top - st + 18}px`;
    div.style.height = `${Math.max(rowH - 4, 8)}px`;
  }, []);

  const setTrackPreview = useCallback((preview: typeof trackPreviewDataRef['current']) => {
    trackPreviewDataRef.current = preview;
    const rowDiv = trackPreviewRowDomRef.current;
    const lineDiv = trackPreviewLineDomRef.current;
    if (!rowDiv || !lineDiv) return;
    if (!preview) { rowDiv.style.display = 'none'; lineDiv.style.display = 'none'; return; }
    const { scrollTop: st, editorData: ed, rowHeight: rh } = liveRef.current;
    if (preview.kind === 'new-row') {
      rowDiv.style.display = 'none';
      const insertIndex = preview.insertIndex;
      const srcH = preview.sourceRow.rowHeight || rh;
      let lineTop: number;
      if (insertIndex === 0) {
        lineTop = 16 - st;
      } else {
        let t = 0;
        const clamped = Math.min(insertIndex, ed.length);
        for (let i = 0; i < clamped; i++) t += (ed[i].rowHeight || rh) + 2;
        lineTop = t - st + 16;
      }
      lineDiv.style.display = 'block';
      lineDiv.style.top = `${lineTop - 1}px`;
      void srcH; // used for rowHeight fallback above
    } else {
      lineDiv.style.display = 'none';
      const targetIndex = ed.findIndex((item) => item.id === preview.rowId);
      if (targetIndex < 0) { rowDiv.style.display = 'none'; return; }
      let top = 0;
      for (let i = 0; i < targetIndex; i++) top += (ed[i].rowHeight || rh) + 2;
      const rowH = ed[targetIndex].rowHeight || rh;
      rowDiv.style.display = 'block';
      rowDiv.style.top = `${top - st + 17}px`;
      rowDiv.style.height = `${Math.max(rowH - 2, 8)}px`;
    }
  }, []);

  const setDragIndicator = useCallback((indicator: typeof dragIndicatorDataRef['current']) => {
    dragIndicatorDataRef.current = indicator;
    const div = dragIndicatorDomRef.current;
    if (!div) return;
    if (!indicator) { div.style.display = 'none'; return; }
    const { scrollTop: st, editorData: ed, rowHeight: rh } = liveRef.current;
    let top = 0;
    for (let i = 0; i < Math.min(indicator.targetIndex, ed.length); i++) top += ed[i].rowHeight || rh;
    div.style.display = 'block';
    div.style.top = `${top - st + 16}px`;
  }, []);

  // Re-apply overlay positions whenever scroll changes during an active drag
  useLayoutEffect(() => {
    if (insertPreviewDataRef.current) setInsertPreview(insertPreviewDataRef.current);
    if (trackPreviewDataRef.current) setTrackPreview(trackPreviewDataRef.current);
    if (dragIndicatorDataRef.current) setDragIndicator(dragIndicatorDataRef.current);
  }, [scrollTop]);


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

  // 监听拖拽位置指示器事件（命令式 DOM，不触发 React 重渲染）
  useEffect(() => {
    const handleDragMove = (e: CustomEvent) => setDragIndicator(e.detail);
    const handleDragEnd = () => setDragIndicator(null);
    window.addEventListener('row-drag-move', handleDragMove as EventListener);
    window.addEventListener('row-drag-end', handleDragEnd);
    return () => {
      window.removeEventListener('row-drag-move', handleDragMove as EventListener);
      window.removeEventListener('row-drag-end', handleDragEnd);
    };
  }, [setDragIndicator]);

  // 处理拖拽上传事件
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!editAreaRef.current) return;
    const rect = editAreaRef.current.getBoundingClientRect();
    const position = e.clientX - rect.x;
    const left = position + scrollLeft;
    const time = parserPixelToTime(left, { startLeft, scale, scaleWidth });
    setCurrentMouseTime(time);
  };

  // ref 数据
  useImperativeHandle(ref, () => ({
    get domRef() {
      return editAreaRef;
    },
  }));

  const handleInitDragLine: EditData['onActionMoveStart'] = (data) => {
    onActionMoveStart?.(data);
  };

  const handleUpdateDragLine: EditData['onActionMoving'] = (data) => {
    onActionMoving?.(data);
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

      if (row.type !== editorData[0]?.type) {
        return;
      }

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

  const saveUploader = (uploader: any) => {
    uploadRef.current = uploader;
  };

  const uploadBgMusic = useCallback(
    (file: File[], row?: TimelineRow) => {
      const canUpload = onBeforeUpload?.(file[0]);
      if (!canUpload) return;

      const onSuccess = handleUploadChange(row);
      onSuccess({ file: file[0], isUploading: true });
      customRequest?.({
        file: file[0],
        onSuccess,
        method: 'POST',
        action: 'bgm',
        onError: (err) => {
          onSuccess({ file: file[0], isUploading: false });
          console.error('Upload error:', err);
        },
      });
    },
    [onBeforeUpload, handleUploadChange, customRequest],
  );

  /** 获取每个cell渲染内容 */
  const cellRenderer: GridCellRenderer = ({ rowIndex, key, style }) => {
    const row = editorData[rowIndex]; // 行数据

    const editRow = (
      <EditRow
        {...props}
        uploadBgMusic={uploadBgMusic}
        style={{
          ...style,
          zIndex: rowIndex + 10,
          backgroundPositionX: `0, ${startLeft}px`,
          backgroundSize: `${startLeft}px, ${scaleWidth}px`,
        }}
        scrollLeft={scrollLeft}
        areaRef={editAreaRef}
        key={key}
        rowHeight={row?.rowHeight || rowHeight}
        rowData={row}
        allowCreateTrack={allowCreateTrack}
        setInsertPreview={setInsertPreview}
        setTrackPreview={setTrackPreview}
        containerRef={containerRef}
        selectedActionIds={selectedActionIds}
        setCursor={setCursor}
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
            gap: data.offsetX || 0,
          });
          return onActionMoving && onActionMoving(data);
        }}
        onActionResizing={(data) => {
          handleUpdateDragLine(data);
          return onActionResizing && onActionResizing(data);
        }}
        onActionResizeEnd={(data) => {
          return onActionResizeEnd && onActionResizeEnd(data);
        }}
        onActionMoveEnd={(data) => {
          // 传递拖拽结束参数给多选拖拽处理
          onDragEnd({
            actionId: data.action.id,
            left: data.left || 0,
            width: data.width || 0,
            top: data.top || 0,
            height: data.height || 0,
            up: data.up || 0,
              action: data.action,
              row: data.row,
          });
          if (!data.isMultiDrag) {
            return onActionMoveEnd && onActionMoveEnd(data);
          }
          return;
        }}
      />
    );

    // if (!!row && (canUpload || row?.canUpload)) {
    //   const isDefaultMusic = row.actions?.[0]?.id === 'upload-bg-music';

    //   const tChildren = isDefaultMusic ? editRow : null;
    //   return (
    //     <>
    //       <Upload
    //         ref={uploadRef}
    //         key={key + 'upload'}
    //         style={{ width: '100%', display: 'block', position: 'relative', ...style }}
    //         beforeUpload={onBeforeUpload}
    //         onChange={handleUploadChange(row)}
    //         showUploadList={false}
    //         openFileDialogOnClick={row.actions?.filter((item) => item.effectId === 'effect2').length > 0}
    //         customRequest={customRequest}
    //         onDrop={handleDrop}
    //         type="drag"
    //         accept="audio/mp3,audio/wav,audio/mpeg"
    //       >
    //         {tChildren}
    //       </Upload>
    //       {tChildren ? null : editRow}
    //     </>
    //   );
    // }

    return editRow;
  };

  useLayoutEffect(() => {
    gridRef.current?.scrollToPosition({ scrollTop, scrollLeft });
  }, [scrollTop, scrollLeft]);

  useEffect(() => {
    gridRef.current.recomputeGridSize();
  }, [editorData]);

  useEffect(() => {
    const row = editorData[0]; // 行数据
    if (!row || row.type !== 'bg') {
      return;
    }
    engineRef.current?.on('upload-bg-music', (e) => {
      uploadBgMusic([e.file], row);
    });
    return () => {
      engineRef.current?.off('upload-bg-music');
    };
  }, [engineRef, uploadBgMusic, editorData]);

  let _totalHeight: number | string = editorData.reduce((prev, cur) => prev + (cur.rowHeight || rowHeight), 0) + ((className || '').indexOf('1') > -1 ? 12 : 32);
  if (minHeight) {
    const calcHeight = `calc(100% - ${minHeight + 16}px)`;
    _totalHeight = `max(${_totalHeight}px, ${calcHeight})`;
  }

  const getPreviewRowTop = (targetRowId: string) => {
    const targetIndex = editorData.findIndex((item) => item.id === targetRowId);
    if (targetIndex < 0) return null;

    let top = 0;
    for (let i = 0; i < targetIndex; i++) {
      top += (editorData[i].rowHeight || rowHeight) + 2;
    }

    return {
      top,
      height: editorData[targetIndex].rowHeight || rowHeight,
    };
  };

  /** 为 new-row 预览计算纯像素位置，不修改 editorData */
  const getNewRowPreviewPosition = (insertIndex: number, sourceRowHeight: number) => {
    let top = 0;
    const clampedIndex = Math.min(insertIndex, editorData.length);
    for (let i = 0; i < clampedIndex; i++) {
      top += (editorData[i].rowHeight || rowHeight) + 2;
    }
    return { top, height: sourceRowHeight || rowHeight };
  };

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
              rowHeight={({ index }) => heights[index] || rowHeight || 0}
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
      {/* Drag overlays: always in DOM, positions updated imperatively to avoid React re-renders */}
      <div
        ref={trackPreviewLineDomRef}
        style={{
          display: 'none',
          position: 'absolute',
          left: 8,
          right: 8,
          height: 3,
          background: 'rgba(24, 144, 255, 0.9)',
          borderRadius: 2,
          zIndex: 1002,
          pointerEvents: 'none',
          boxShadow: '0 0 0 1px rgba(24, 144, 255, 0.25), 0 0 8px rgba(24, 144, 255, 0.55)',
        }}
      />
      <div
        ref={trackPreviewRowDomRef}
        style={{
          display: 'none',
          position: 'absolute',
          left: 2,
          right: 2,
          background: 'rgba(160, 160, 160, 0.08)',
          boxShadow: 'inset 0 0 0 1.5px rgba(160, 160, 160, 0.5)',
          borderRadius: 8,
          zIndex: 999,
          pointerEvents: 'none',
        }}
      />
      <div
        ref={insertPreviewDomRef}
        style={{
          display: 'none',
          position: 'absolute',
          background: 'rgba(160, 160, 160, 0.12)',
          border: '1.5px dashed rgba(150, 150, 150, 0.7)',
          borderRadius: 8,
          zIndex: 1001,
          pointerEvents: 'none',
        }}
      />
      <div
        ref={dragIndicatorDomRef}
        style={{
          display: 'none',
          position: 'absolute',
          left: 0,
          right: 0,
          height: 3,
          backgroundColor: '#1890ff',
          boxShadow: '0 0 8px rgba(24, 144, 255, 0.6)',
          zIndex: 1001,
          pointerEvents: 'none',
        }}
      />
    </div>
  );
});

export const EditArea = React.memo(EditAreaO);
