import { TimelineEffect, TimelineRow } from '@xzdarcy/react-timeline-editor';

export const mockEffect: Record<string, TimelineEffect> = {
  effect0: {
    id: "effect0",
    name: "效果0",
  },
  effect1: {
    id: "effect1",
    name: "效果1",
  },
};


export const mockData: TimelineRow[] = [
  {
    id: "1",
    actions: [
      {
        id: "action10",
        start: 0,
        end: 0.5,
        effectId: "effect1",
      }
    ],
    type: "audio",
  },
  {
    id: "2",
    actions: [
      {
        id: "action20",
        // flexible: false,
        // movable: false,
        start: 3,
        end: 4,
        effectId: "effect0",
      },
    ],
     type: "audio",
  },
  {
    id: "3",
    actions: [
      {
        id: "action30",
        start: 4,
        end: 4.5,
        effectId: "effect0",
      },
      {
        id: "action31",
        start: 6,
        end: 8,
        effectId: "effect0",
      },
    ],
     type: "audio",
  },
];
