import React, { useRef, useImperativeHandle } from 'react';
import { ScrollSync } from 'react-virtualized';
import { useThrottleEffect } from 'ahooks';
import { CommonProp } from '../../interface/common_prop';
import { prefix } from '../../utils/deal_class_prefix';
import { parserPixelToTime, parserTimeToPixel } from '../../utils/deal_data';
import { RowDnd } from '../row_rnd/row_rnd';
import { RowRndApi } from '../row_rnd/row_rnd_interface';
import './cursor.less';

/** 动画时间轴组件参数 */
export type CursorProps = CommonProp & {
  theme?: string;
  /** 距离左侧滚动距离 */
  scrollLeft: number;
  /** 设置光标位置 */
  setCursor: (param: { left?: number; time?: number }) => boolean;
  /** 时间轴区域 dom ref */
  areaRef: React.MutableRefObject<HTMLDivElement>;
  /** 设置 scroll left */
  deltaScrollLeft: (delta: number) => void;
  /** 滚动同步 ref（TODO: 该数据用于临时解决 scrollLeft 拖住时不同步问题） */
  scrollSync: React.MutableRefObject<ScrollSync>;
};

export interface CursorApi {
  updateLeft: (left: number) => void;
}

export const Cursor = React.forwardRef<CursorApi, CursorProps>((props, ref) => {
  const {
    theme,
    disableDrag,
    cursorTime,
    setCursor,
    startLeft,
    timelineWidth,
    scaleWidth,
    scale,
    scrollLeft,
    scrollSync,
    areaRef,
    maxScaleCount,
    deltaScrollLeft,
    onCursorDragStart,
    onCursorDrag,
    onCursorDragEnd,
  } = props;

  const rowRnd = useRef<RowRndApi>();
  const draggingLeft = useRef<undefined | number>();

  useImperativeHandle(ref, () => ({
    updateLeft: (cursorTime: number) => {
      rowRnd.current.updateLeft(parserTimeToPixel(cursorTime, { startLeft, scaleWidth, scale }));
    },
  }));

  useThrottleEffect(
    () => {
      if (typeof draggingLeft.current === 'undefined') {
        // 非dragging时，根据穿参更新cursor刻度（防抖）
        rowRnd.current.updateLeft(parserTimeToPixel(cursorTime, { startLeft, scaleWidth, scale }));
      }
    },
    [cursorTime, startLeft, scaleWidth, scale],
    {
      wait: 10,
    },
  );

  const clientHeight = document.querySelector('#time-editor-container')?.scrollHeight || 0;

  return (
    <RowDnd
      top={theme === 'light' ? 26 : 0}
      start={startLeft}
      height={clientHeight}
      ref={rowRnd}
      parentRef={areaRef}
      bounds={{
        left: 0,
        right: Math.min(timelineWidth, maxScaleCount * scaleWidth + startLeft),
      }}
      deltaScrollLeft={deltaScrollLeft}
      enableDragging={!disableDrag}
      enableResizing={false}
      onDragStart={() => {
        onCursorDragStart && onCursorDragStart(cursorTime);
        draggingLeft.current = parserTimeToPixel(cursorTime, { startLeft, scaleWidth, scale });
        rowRnd.current.updateLeft(draggingLeft.current);
      }}
      onDragEnd={() => {
        const time = parserPixelToTime(draggingLeft.current, { startLeft, scale, scaleWidth });
        setCursor({ time });
        onCursorDragEnd && onCursorDragEnd(time);
        draggingLeft.current = undefined;
      }}
      onDrag={({ left }, scroll = 0) => {
        const scrollLeft = 0;// scrollSync.current.state.scrollLeft;

        if (!scroll || scrollLeft === 0) {
          // 拖拽时，如果当前left < left min，将数值设置为 left min
          if (left < startLeft - scrollLeft) draggingLeft.current = startLeft - scrollLeft;
          else draggingLeft.current = left;
        } else {
          // 自动滚动时，如果当前left < left min，将数值设置为 left min
          if (draggingLeft.current < startLeft - scrollLeft - scroll) {
            draggingLeft.current = startLeft - scrollLeft - scroll;
          }
        }
        rowRnd.current.updateLeft(draggingLeft.current);
        const time = parserPixelToTime(draggingLeft.current + scrollLeft, { startLeft, scale, scaleWidth });
        setCursor({ time });
        onCursorDrag && onCursorDrag(time);
        return false;
      }}
    >
      <div className={prefix('cursor')}>
        <svg className={prefix('cursor-top')} xmlns="http://www.w3.org/2000/svg" width="8" height="5" viewBox="0 0 8 5" fill="none">
          <path
            d="M7.11914 0C7.29043 3.70978e-05 7.38258 0.201535 7.27051 0.331055L3.81055 4.3252C3.73079 4.41725 3.58853 4.41727 3.50879 4.3252L0.0488281 0.331055C-0.06309 0.201578 0.0290597 0.000178682 0.200195 0H7.11914Z"
            fill={theme === 'light' ? '#111111' : '#5297FF'}
          />
        </svg>
        <div className={prefix('cursor-area')} />
      </div>
    </RowDnd>
  );
});
