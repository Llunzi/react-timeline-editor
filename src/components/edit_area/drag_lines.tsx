import React, { FC, memo, useEffect, useState } from "react";
import { prefix } from "../../utils/deal_class_prefix";
import './drag_lines.less';
import useSize from "ahooks/es/useSize";

export interface DragLineData {
  isMoving: boolean;
  movePositions: number[];
  assistPositions: number[];
}

export type DragLineProps = DragLineData & {scrollLeft: number};

/** 拖拽辅助线 */
export const DragLines: FC<DragLineProps> = memo(({
  isMoving,
  movePositions = [],
  assistPositions = [],
  scrollLeft,
}) => {

  const { height = 0 } = useSize(document.querySelector('#time-editor-container')) || {};

  const tolerance = 5; // 容差范围，单位像素

  return(
    <div className={prefix('drag-line-container')} style={{ height: height || '100%' }}>
      {
         isMoving && movePositions.map((movePos) => {
          // 查找在容差范围内的辅助线位置
          const matchedAssistPos = assistPositions.find(assistPos => 
            Math.abs(movePos - assistPos) <= tolerance
          );
          if (matchedAssistPos) {
            return (
              <div key={matchedAssistPos} className={prefix('drag-line')} style={{left: matchedAssistPos - scrollLeft}} />
            );
          }
          return null;
        })
      }
    </div>
  );
});