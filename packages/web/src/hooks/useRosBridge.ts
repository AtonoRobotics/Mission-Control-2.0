import { useEffect, useCallback } from 'react';
import { Topic, Service } from 'roslib';
import { getRos, getStatus, onStatusChange, connect } from '@/ros/connection';
import { useRosBridgeStore } from '@/stores/rosBridgeStore';

export function useRosBridge() {
  const setStatus = useRosBridgeStore((s) => s.setStatus);

  useEffect(() => {
    connect();
    setStatus(getStatus());
    return onStatusChange(setStatus);
  }, [setStatus]);

  return getRos();
}

export function useTopic<T = Record<string, unknown>>(
  topicName: string,
  messageType: string,
  onMessage: (msg: T) => void,
  throttleRate = 0,
) {
  const ros = useRosBridge();

  useEffect(() => {
    if (!topicName || !messageType) return;

    const topic = new Topic({
      ros,
      name: topicName,
      messageType,
      throttle_rate: throttleRate,
    });

    const handler = (msg: any) => onMessage(msg as T);
    topic.subscribe(handler);

    return () => { topic.unsubscribe(); };
  }, [ros, topicName, messageType, throttleRate]);
}

export function useServiceCall(serviceName: string, serviceType: string) {
  const ros = useRosBridge();

  return useCallback(
    (request: Record<string, unknown>): Promise<Record<string, unknown>> => {
      return new Promise((resolve, reject) => {
        const service = new Service({
          ros,
          name: serviceName,
          serviceType,
        });
        service.callService(
          request,
          (result: any) => resolve(result as Record<string, unknown>),
          (error: string) => reject(new Error(error)),
        );
      });
    },
    [ros, serviceName, serviceType],
  );
}
