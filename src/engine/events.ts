import { TimelineEngine } from "./engine";

export class Events {
  handlers = {};

  constructor(handlers = {}) {
    this.handlers = {
      beforeSetTime: [],
      afterSetTime: [],
      setTimeByTick: [],
      beforeSetPlayRate: [],
      afterSetPlayRate: [],
      setActiveActionIds: [],
      play: [],
      paused: [],
      ended: [],
      mousedown: [],
       "effect-play": [],
       "effect-leave": [],
       "upload-bg-music": [],
      ...handlers,
    };
  }
}

export interface EventTypes {
  /**
   * 设置时间前(手动)
   * @type {{ time: number, engine: TimelineEngine }}
   * @memberof EventTypes
   */
  beforeSetTime: { time: number; engine: TimelineEngine };
  /**
   * 设置时间后(手动)
   * @type {{ time: number, engine: TimelineEngine }}
   * @memberof EventTypes
   */
  afterSetTime: { time: number; engine: TimelineEngine };
  /**
   * tick设置时间后
   * @type {{ time: number, engine: TimelineEngine }}
   * @memberof EventTypes
   */
  setTimeByTick: { time: number; engine: TimelineEngine };
  /**
   * 设置运行速率前
   * return false 将阻止设置速率
   * @type {{ speed: number, engine: TimelineEngine }}
   * @memberof EventTypes
   */
  beforeSetPlayRate: { rate: number; engine: TimelineEngine };
  /**
   * 设置运行速率后
   * @type {{ speed: number, engine: TimelineEngine }}
   * @memberof EventTypes
   */
  afterSetPlayRate: { rate: number; engine: TimelineEngine };
  /**
   * 运行
   * @type {{engine: TimelineEngine}}
   * @memberof EventTypes
   */
  play: { engine: TimelineEngine };
  /**
   * 停止
   * @type {{ engine: TimelineEngine }}
   * @memberof EventTypes
   */
  paused: { engine: TimelineEngine };
  /**
   * 运行结束
   * @type {{ engine: TimelineEngine }}
   * @memberof EventTypes
   */
  ended: { engine: TimelineEngine };

  /**
   * 鼠标点击事件
   * @type {{ target: HTMLElement, engine: TimelineEngine }}
   * @memberof EventTypes
   */
  mousedown: { target: HTMLElement; evt: MouseEvent };

  /**
   * 特效播放事件
   * @type {{ id: string }}
   * @memberof EventTypes
   */
  "effect-play": { id: string };

  /**
   * 特效离开事件
   * @type {{ id: string }}
   * @memberof EventTypes
   */
  "effect-leave": { id: string };

  /**
   * 上传背景音乐事件
   * @type {{ file: File }}
   * @memberof EventTypes
   */
  "upload-bg-music": { file: File };
}
