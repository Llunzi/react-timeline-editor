import React, { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, useMemo } from 'react';
import { ScrollSync, OnScrollParams } from 'react-virtualized';
import { ITimelineEngine, TimelineEngine } from '../engine/engine';
import { MIN_SCALE_COUNT, PREFIX, START_CURSOR_TIME } from '../interface/const';
import { TimelineEditor, TimelineRow, TimelineState } from '../interface/timeline';
import { checkProps } from '../utils/check_props';
import { getScaleCountByRows, parserPixelToTime, parserTimeToPixel } from '../utils/deal_data';
import { Cursor, CursorApi } from './cursor/cursor';
import { EditArea } from './edit_area/edit_area';
import './timeline.less';
import { TimeArea } from './time_area/time_area';
import { groupBy, throttle } from 'lodash-es';
import { DragLineController, DragLineControllerRef } from './edit_area/hooks/drag_line_controller';

export const Timeline = React.memo(React.forwardRef<TimelineState, TimelineEditor>((props, ref) => {
  const checkedProps = checkProps(props);
  const { style, className, theme } = props;
  let {
    effects,
    editorData: data,
    scrollTop,
    autoScroll,
    hideCursor,
    disableDrag,
    dragLine,
    scale,
    scaleWidth,
    startLeft,
    minScaleCount,
    maxScaleCount,
    onChange,
    engine,
    autoReRender = true,
    onScroll: onScrollVertical,
    allowCreateTrack = true,
  } = checkedProps;

  const engineRef = useRef<ITimelineEngine>(engine || new TimelineEngine());
  const domRef = useRef<HTMLDivElement>();
  const areaRef = useRef<HTMLDivElement>();
  const scrollSync = useRef<ScrollSync>();
  const containerRef = useRef<HTMLDivElement>();
  const cursorRef = useRef<CursorApi>(null);

  console.log(' Timeline mounted = ', areaRef);

  // 编辑器数据
  const [editorData, setEditorData] = useState(data);
  // scale数量
  const [scaleCount, setScaleCount] = useState(MIN_SCALE_COUNT);
  // 光标距离
  const [cursorTime, setCursorTime] = useState(START_CURSOR_TIME);
  // 是否正在运行
  const [isPlaying, setIsPlaying] = useState(false);
  // 当前时间轴宽度
  const [width, setWidth] = useState(Number.MAX_SAFE_INTEGER);

  const dragLineControllerRef = useRef<DragLineControllerRef>(null);

  const groupedData: Record<string, TimelineRow[]> = groupBy(editorData, 'type');
  const areaCount = Object.keys(groupedData).length;
  const keys = Object.keys(groupedData);

  /** 监听数据变化 */
  useLayoutEffect(() => {
    handleSetScaleCount(getScaleCountByRows(data, { scale }));
    setEditorData(data);
  }, [data, minScaleCount, maxScaleCount, scale]);

  useEffect(() => {
    engineRef.current.effects = effects;
  }, [effects]);

  useEffect(() => {
    engineRef.current.data = editorData;
  }, [editorData]);

  useEffect(() => {
    autoReRender && engineRef.current.reRender();
  }, [editorData]);

  // deprecated
  useEffect(() => {
    scrollSync.current && scrollSync.current.setState({ scrollTop: scrollTop });
  }, [scrollTop]);

  /** 动态设置 scale count */
  const handleSetScaleCount = useCallback((value: number) => {
    const data = Math.min(maxScaleCount, Math.max(minScaleCount, value));
    setScaleCount(data);
  }, [maxScaleCount, minScaleCount]);

  /** 处理主动数据变化 */
  const handleEditorDataChange = (updatedData: TimelineRow[]) => {
    const result = onChange?.(updatedData);
    if (result !== false) {
      setEditorData(updatedData);
      engineRef.current.data = updatedData;
      autoReRender && engineRef.current.reRender();
    }
  };

  /** 处理光标 */
  const handleSetCursor = useCallback((param: { left?: number; time?: number; updateTime?: boolean }) => {
    let { left, time, updateTime = true } = param;
    if (typeof left === 'undefined' && typeof time === 'undefined') return;

    if (typeof time === 'undefined') {
      if (typeof left === 'undefined') left = parserTimeToPixel(time, { startLeft, scale, scaleWidth });
      time = parserPixelToTime(left, { startLeft, scale, scaleWidth });
    }

    let result = true;
    if (updateTime) {
      result = engineRef.current.setTime(time);
      autoReRender && engineRef.current.reRender();
    }
    result && setCursorTime(time);
    return result;
  }, [startLeft, scale, scaleWidth, autoReRender]);

  /** 设置 scrollLeft */
  const handleDeltaScrollLeft = useCallback((delta: number) => {
    // 当超过最大距离时，禁止自动滚动
    const data = scrollSync.current.state.scrollLeft + delta;
    if (data > scaleCount * (scaleWidth - 1) + startLeft - width) return;
    scrollSync.current && scrollSync.current.setState({ scrollLeft: Math.max(scrollSync.current.state.scrollLeft + delta, 0) });
  }, [scaleCount, scaleWidth, startLeft, width]);

  const handleInitDragLine = useCallback((data: any) => {
    checkedProps.onActionMoveStart?.(data);
    checkedProps.onActionResizeStart?.(data);
    dragLineControllerRef.current?.initDragLine(data);
  }, [checkedProps]);

  const handleUpdateDragLine = useCallback((data: any) => {
    checkedProps.onActionMoving?.(data);
    checkedProps.onActionResizing?.(data);
    dragLineControllerRef.current?.updateDragLine(data);
  }, [checkedProps]);

  const handleDisposeDragLine = useCallback((data: any) => {
    checkedProps.onActionMoveEnd?.(data);
    checkedProps.onActionResizeEnd?.(data);
    dragLineControllerRef.current?.disposeDragLine();
  }, [checkedProps]);

  /** 处理滚动回调 */
  const onScroll = useCallback((params: OnScrollParams) => {
    onScrollVertical && onScrollVertical(params);
  }, [onScrollVertical]);

  // 处理运行器相关数据
  useEffect(() => {
    const handleTime = ({ time }) => {
      handleSetCursor({ time, updateTime: false });
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePaused = () => setIsPlaying(false);
    engineRef.current.on('setTimeByTick', handleTime);
    engineRef.current.on('play', handlePlay);
    engineRef.current.on('paused', handlePaused);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      engineRef.current.trigger('mousedown', {
        target,
        evt: e,
      });
    };

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // ref 数据
  useImperativeHandle(ref, () => ({
    get target() {
      return domRef.current;
    },
    get listener() {
      return engineRef.current;
    },
    get isPlaying() {
      return engineRef.current.isPlaying;
    },
    get isPaused() {
      return engineRef.current.isPaused;
    },
    setPlayRate: engineRef.current.setPlayRate.bind(engineRef.current),
    getPlayRate: engineRef.current.getPlayRate.bind(engineRef.current),
    setTime: (time: number) => handleSetCursor({ time }),
    getTime: engineRef.current.getTime.bind(engineRef.current),
    reRender: engineRef.current.reRender.bind(engineRef.current),
    play: (param: Parameters<TimelineState['play']>[0]) => engineRef.current.play({ ...param }),
    pause: engineRef.current.pause.bind(engineRef.current),
    setScrollLeft: (val) => {
      scrollSync.current && scrollSync.current.setState({ scrollLeft: Math.max(val, 0) });
    },
    setScrollTop: (val) => {
      scrollSync.current && scrollSync.current.setState({ scrollTop: Math.max(val, 0) });
    },
  }));

  const onClickTimeline = useCallback((e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    if (!domRef.current) return;
    const rect = domRef.current.getBoundingClientRect();;
    const position = e.clientX - rect.x;
    const left = position + scrollSync.current.state.scrollLeft;
    const time = parserPixelToTime(left, { startLeft, scale, scaleWidth });

    const action = (e.target as HTMLElement)?.closest('.timeline-editor-action');
    if (action || hideCursor) return;
    
    console.log('onClickTimeline = ', time);

    handleSetCursor({ time });
  }, [startLeft, scale, scaleWidth, hideCursor, handleSetCursor]);

  // 监听timeline区域宽度变化
  useEffect(() => {
    if (areaRef.current) {
      const resizeObserver = new ResizeObserver(() => {
        if (!areaRef.current) return;
        setWidth(areaRef.current.getBoundingClientRect().width + 10);
      });
      resizeObserver.observe(areaRef.current!);
      return () => {
        resizeObserver && resizeObserver.disconnect();
      };
    }
  }, []);

  useEffect(() => {
    const containerEl = document.querySelector('.timeline-editor');
    
    const handleScroll = throttle((e: Event) => {
      console.log('scroll', e);
      scrollSync.current && scrollSync.current.setState({ scrollLeft: (e.target as HTMLElement).scrollLeft || 0 });
    }, 100);

    containerEl.addEventListener('scroll', handleScroll);

    return () => {
      containerEl.removeEventListener('scroll', handleScroll);
      handleScroll.cancel();
    };
  }, []);

  return (
    <div ref={domRef} style={style} className={`${className || ''} ${theme || ''} ${PREFIX} ${disableDrag ? PREFIX + '-disable' : ''}`}>
      <ScrollSync ref={scrollSync}>
        {({ scrollLeft, scrollTop, onScroll }) => (
          <>
            <TimeArea
              {...checkedProps}
              timelineWidth={width}
              disableDrag={disableDrag || isPlaying}
              setCursor={handleSetCursor}
              cursorTime={cursorTime}
              editorData={editorData}
              scaleCount={scaleCount}
              setScaleCount={handleSetScaleCount}
              onScroll={onScroll}
              scrollLeft={scrollLeft}
              cursorRef={cursorRef}
            />

            {areaCount === 1 ? (
              <EditArea
                {...checkedProps}
                timelineWidth={width}
                ref={(ref) => ((areaRef.current as any) = ref?.domRef.current)}
                disableDrag={disableDrag || isPlaying}
                editorData={editorData}
                cursorTime={cursorTime}
                scaleCount={scaleCount}
                setScaleCount={handleSetScaleCount}
                scrollTop={scrollTop}
                scrollLeft={scrollLeft}
                engineRef={engineRef}
                setEditorData={handleEditorDataChange}
                setCursor={handleSetCursor}
                deltaScrollLeft={autoScroll && handleDeltaScrollLeft}
                allowCreateTrack={allowCreateTrack}
                onMutiSelectChange={props?.onMutiSelectChange}
                onActionMoveStart={handleInitDragLine}
                onActionResizeStart={handleInitDragLine}
                onActionMoving={handleUpdateDragLine}
                onActionResizing={handleUpdateDragLine}
                onActionMoveEnd={handleDisposeDragLine}
                onActionResizeEnd={handleDisposeDragLine}
                onScroll={(params) => {
                  onScroll(params);
                  onScrollVertical && onScrollVertical(params);
                }}
              />
            ) : null}
            {areaCount > 1 ? (
              <div id="time-editor-container" ref={containerRef} style={{ height: '100%' }} onClick={onClickTimeline}>
                {Object.keys(groupedData).map((key, index) => {
                  const handleGroupDataChange = (updatedData: TimelineRow[]) => {
                    const mergedData = editorData.filter((item) => String(item.type) !== key).concat(updatedData);
                    const sortedMergedData = [...mergedData].sort((a, b) => {
                      const indexA = keys.indexOf(String(a.type));
                      const indexB = keys.indexOf(String(b.type));
                      return indexA - indexB;
                    });
                    const result = onChange?.(sortedMergedData);
                    if (result !== false) {
                      setEditorData(sortedMergedData);
                      engineRef.current.data = sortedMergedData;
                      autoReRender && engineRef.current.reRender();
                    }
                  };

                  const tEditorData = groupedData[Object.keys(groupedData)[0]];
                  const _totalHeight = tEditorData.reduce((prev, cur) => prev + (cur.rowHeight || tEditorData[0]?.rowHeight), 0) + ((className || '').indexOf('1') > -1 ? 12 : 32);

                  return (
                    <EditArea
                      key={key}
                      isMulti={areaCount > 1}
                      {...checkedProps}
                      className={index !== 0 ? `no-flex ${key} ${index} overflow-hidden` : `overflow-hidden ${key} ${index}`}
                      timelineWidth={width}
                      ref={(ref) => ((areaRef.current as any) = ref?.domRef.current)}
                      disableDrag={disableDrag || isPlaying}
                      editorData={groupedData[key]}
                      cursorTime={cursorTime}
                      scaleCount={scaleCount}
                      setScaleCount={handleSetScaleCount}
                      scrollTop={scrollTop}
                      scrollLeft={scrollLeft}
                      setEditorData={handleGroupDataChange}
                      setCursor={handleSetCursor}
                      deltaScrollLeft={autoScroll && handleDeltaScrollLeft}
                      allowCreateTrack={allowCreateTrack}
                      minHeight={index === 0 ? undefined : _totalHeight}
                      containerRef={containerRef}
                      onMutiSelectChange={props?.onMutiSelectChange}
                      engineRef={engineRef}
                      onActionMoveStart={handleInitDragLine}
                      onActionResizeStart={handleInitDragLine}
                      onActionMoving={handleUpdateDragLine}
                      onActionResizing={handleUpdateDragLine}
                      onActionMoveEnd={handleDisposeDragLine}
                      onActionResizeEnd={handleDisposeDragLine}
                      onScroll={onScroll}
                    />
                  );
                })}
              </div>
            ) : null}

            {!hideCursor && (
              <Cursor
                {...checkedProps}
                ref={cursorRef}
                timelineWidth={width}
                disableDrag={isPlaying}
                scrollLeft={scrollLeft}
                scaleCount={scaleCount}
                setScaleCount={handleSetScaleCount}
                setCursor={handleSetCursor}
                cursorTime={cursorTime}
                editorData={editorData}
                areaRef={areaRef}
                scrollSync={scrollSync}
                deltaScrollLeft={autoScroll && handleDeltaScrollLeft}
              />
            )}
            <DragLineController
              ref={dragLineControllerRef}
              dragLine={dragLine}
              editorData={editorData}
              cursorTime={cursorTime}
              scale={scale}
              scaleWidth={scaleWidth}
              startLeft={startLeft}
              hideCursor={hideCursor}
              scrollLeft={scrollLeft}
              getAssistDragLineActionIds={checkedProps.getAssistDragLineActionIds}
            />
          </>
        )}
      </ScrollSync>
    </div>
  );
}));
