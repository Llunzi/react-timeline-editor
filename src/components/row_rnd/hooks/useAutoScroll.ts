import { DragEvent, ResizeEvent } from '@interactjs/types/index';
import { useRef } from 'react';

const DEFAULT_SPEED = 2;
const MAX_SPEED = 8;
const CRITICAL_SIZE = 5;
const EDGE_THRESHOLD = 20; // 距离边缘多少像素开始触发滚动

export function useAutoScroll(target: React.MutableRefObject<HTMLDivElement>, verticalScrollTarget?: React.MutableRefObject<HTMLDivElement>) {
  const leftBoundRef = useRef(Number.MIN_SAFE_INTEGER);
  const rightBoundRef = useRef(Number.MAX_SAFE_INTEGER);
  const topBoundRef = useRef(Number.MIN_SAFE_INTEGER);
  const bottomBoundRef = useRef(Number.MAX_SAFE_INTEGER);

  const speed = useRef(DEFAULT_SPEED);
  const frame = useRef<number>();

  const initAutoScroll = () => {
    if (target?.current) {
      const { left, width, top, height } = target.current.getBoundingClientRect();
      leftBoundRef.current = left;
      rightBoundRef.current = left + width;

      // Use verticalScrollTarget for Y-axis bounds if provided
      if (verticalScrollTarget?.current) {
        const verticalRect = verticalScrollTarget.current.getBoundingClientRect();
        topBoundRef.current = verticalRect.top;
        bottomBoundRef.current = verticalRect.top + verticalRect.height;
      } else {
        topBoundRef.current = top;
        bottomBoundRef.current = top + height;
      }
    }
  };

  const dealDragAutoScroll = (e: DragEvent, deltaScroll?: (delta: number) => void, deltaScrollTop?: (delta: number) => void) => {
    // X轴滚动 - 在边缘附近就开始触发
    const distanceToRightEdge = rightBoundRef.current - e.clientX;
    const distanceToLeftEdge = e.clientX - leftBoundRef.current;

    if (distanceToRightEdge < EDGE_THRESHOLD && distanceToRightEdge > 0) {
      // 接近右边缘
      cancelAnimationFrame(frame.current);
      const proximity = EDGE_THRESHOLD - distanceToRightEdge;
      speed.current = Math.min(Math.max(1, Number((proximity / CRITICAL_SIZE).toFixed(0)) * DEFAULT_SPEED), MAX_SPEED);

      const delta = speed.current;
      const loop = () => {
        deltaScroll && deltaScroll(delta);
        frame.current = requestAnimationFrame(loop);
      };

      frame.current = requestAnimationFrame(loop);
      return false;
    } else if (distanceToLeftEdge < EDGE_THRESHOLD && distanceToLeftEdge > 0) {
      // 接近左边缘
      cancelAnimationFrame(frame.current);
      const proximity = EDGE_THRESHOLD - distanceToLeftEdge;
      speed.current = Math.min(Math.max(1, Number((proximity / CRITICAL_SIZE).toFixed(0)) * DEFAULT_SPEED), MAX_SPEED);

      const delta = -speed.current;
      const loop = () => {
        deltaScroll && deltaScroll(delta);
        frame.current = requestAnimationFrame(loop);
      };

      frame.current = requestAnimationFrame(loop);
      return false;
    }
    // Y轴滚动 - 根据拖拽方向判断
    else if (deltaScrollTop) {
      const distanceToBottomEdge = bottomBoundRef.current - e.clientY;
      const distanceToTopEdge = e.clientY - topBoundRef.current;

      // console.log('Y-axis check:', {
      //   clientY: e.clientY,
      //   dy: e.dy,
      //   topBound: topBoundRef.current,
      //   bottomBound: bottomBoundRef.current,
      //   distanceToTop: distanceToTopEdge,
      //   distanceToBottom: distanceToBottomEdge,
      // });

      // 向下拖拽且接近底部边缘
      if (e.dy > 0 && distanceToBottomEdge < EDGE_THRESHOLD && distanceToBottomEdge > 0) {
        // console.log('Triggering BOTTOM scroll (dragging DOWN), delta will be POSITIVE');
        cancelAnimationFrame(frame.current);
        const proximity = EDGE_THRESHOLD - distanceToBottomEdge;
        speed.current = Math.min(Math.max(1, Number((proximity / CRITICAL_SIZE).toFixed(0)) * DEFAULT_SPEED), MAX_SPEED);

        const delta = speed.current;
        const loop = () => {
          deltaScrollTop && deltaScrollTop(delta);
          frame.current = requestAnimationFrame(loop);
        };

        frame.current = requestAnimationFrame(loop);
        return false;
      }
      // 向上拖拽且接近顶部边缘
      else if (e.dy < 0 && distanceToTopEdge < EDGE_THRESHOLD && distanceToTopEdge > 0) {
        // console.log('Triggering TOP scroll (dragging UP), delta will be NEGATIVE');
        cancelAnimationFrame(frame.current);
        const proximity = EDGE_THRESHOLD - distanceToTopEdge;
        speed.current = Math.min(Math.max(1, Number((proximity / CRITICAL_SIZE).toFixed(0)) * DEFAULT_SPEED), MAX_SPEED);

        const delta = -speed.current;
        const loop = () => {
          deltaScrollTop && deltaScrollTop(delta);
          frame.current = requestAnimationFrame(loop);
        };

        frame.current = requestAnimationFrame(loop);
        return false;
      } else {
        cancelAnimationFrame(frame.current);
      }
    } else {
      cancelAnimationFrame(frame.current);
    }

    return true;
  };

  const dealResizeAutoScroll = (e: ResizeEvent, dir: 'left' | 'right', deltaScroll?: (delta: number) => void) => {
    // X轴滚动 - 在边缘附近就开始触发
    const distanceToRightEdge = rightBoundRef.current - e.clientX;
    const distanceToLeftEdge = e.clientX - leftBoundRef.current;

    if (distanceToRightEdge < EDGE_THRESHOLD && distanceToRightEdge > 0) {
      // 接近右边缘
      cancelAnimationFrame(frame.current);
      const proximity = EDGE_THRESHOLD - distanceToRightEdge;
      speed.current = Math.min(Math.max(1, Number((proximity / CRITICAL_SIZE).toFixed(0)) * DEFAULT_SPEED), MAX_SPEED);

      const delta = speed.current;
      const loop = () => {
        deltaScroll && deltaScroll(delta);
        frame.current = requestAnimationFrame(loop);
      };

      frame.current = requestAnimationFrame(loop);
      return false;
    } else if (distanceToLeftEdge < EDGE_THRESHOLD && distanceToLeftEdge > 0) {
      // 接近左边缘
      cancelAnimationFrame(frame.current);
      const proximity = EDGE_THRESHOLD - distanceToLeftEdge;
      speed.current = Math.min(Math.max(1, Number((proximity / CRITICAL_SIZE).toFixed(0)) * DEFAULT_SPEED), MAX_SPEED);

      const delta = -speed.current;
      const loop = () => {
        deltaScroll && deltaScroll(delta);
        frame.current = requestAnimationFrame(loop);
      };

      frame.current = requestAnimationFrame(loop);
      return false;
    } else {
      cancelAnimationFrame(frame.current);
    }
    return true;
  };

  const stopAutoScroll = () => {
    leftBoundRef.current = Number.MIN_SAFE_INTEGER;
    rightBoundRef.current = Number.MAX_SAFE_INTEGER;
    speed.current = DEFAULT_SPEED;
    cancelAnimationFrame(frame.current);
  };

  return {
    initAutoScroll,
    dealDragAutoScroll,
    dealResizeAutoScroll,
    stopAutoScroll,
  };
}
