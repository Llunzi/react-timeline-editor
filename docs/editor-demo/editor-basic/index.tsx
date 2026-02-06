import { Timeline } from '@xzdarcy/react-timeline-editor';
import { cloneDeep } from 'lodash';
import React, { useEffect, useState } from 'react';
import './index.less';
import { mockData, mockEffect } from './mock';

const defaultEditorData = cloneDeep(mockData);

const TimelineEditor = () => {
  const [data, setData] = useState(defaultEditorData);

  return (
    <div className="timeline-editor-example0">
      <Timeline
        theme="light"
        onChange={setData}
        editorData={data}
        effects={mockEffect}
        canUpload={true}
        hideCursor={false}
        autoScroll={true}
        customRequest={({ file, onSuccess, onError, ...rest }) => {
          // 创建FormData对象
          const formData = new FormData();
          formData.append('file', file);

          // 模拟上传请求
          fetch('/v1/files/upload', {
            method: 'POST',
            body: formData,
          })
            .then((response) => response.json())
            .then((data) => {
              console.log('Upload success:', data);
              const mockData = {
                id: 'file-Gxew69rWkkTLxW69cF5SdA',
                filename: '周星驰语音包 (1) (0m 07s).mp3',
                bytes: 1400104,
                purpose: 'voice_clone',
                url: 'https://dynamic.staging.senseaudio.cn/83f564f2-e2e2-4d5f-acee-85fe7cd2b246/59bdd0b3-d660-4c40-8976-f8253f3cbdd2/______(1)(0m07s).wav',
                created_at: 1770358142,
              };
              onSuccess({
                file,
                url: mockData.url,
                purpose: mockData.purpose,
              });
            })
            .catch((error) => {
              // console.error('Upload error:', error);
              // onError(error);

              const mockData = {
                id: 'file-Gxew69rWkkTLxW69cF5SdA',
                filename: '周星驰语音包 (1) (0m 07s).mp3',
                bytes: 1400104,
                purpose: 'voice_clone',
                url: 'https://dynamic.staging.senseaudio.cn/83f564f2-e2e2-4d5f-acee-85fe7cd2b246/59bdd0b3-d660-4c40-8976-f8253f3cbdd2/______(1)(0m07s).wav',
                created_at: 1770358142,
              };
              onSuccess({
                file,
                url: mockData.url,
                purpose: mockData.purpose,
              });
            });

          // 返回一个对象，用于取消请求等操作
          return {
            ...rest,
            file,
            onSuccess,
            onError,
            abort: () => {
              console.log('Upload aborted');
            },
          };
        }}
      />
    </div>
  );
};

export default TimelineEditor;
