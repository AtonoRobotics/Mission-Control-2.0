/**
 * Mission Control — useRosBridge Hook
 * Manages WebSocket connection to rosbridge running inside isaac-ros-main container.
 * ROS2 is never installed locally — this is the exclusive ROS2 interface in the UI.
 */

import { useEffect, useRef, useCallback } from 'react';
import ROSLIB from 'roslibjs';
import { useRosBridgeStore } from '../store/rosBridgeStore';

export function useRosBridge() {
  const rosRef = useRef<ROSLIB.Ros | null>(null);
  const { setConnected, setError } = useRosBridgeStore();

  useEffect(() => {
    const wsUrl = `ws://${window.location.hostname}:${import.meta.env.VITE_ROSBRIDGE_PORT}`;

    const ros = new ROSLIB.Ros({ url: wsUrl });
    rosRef.current = ros;

    ros.on('connection', () => {
      setConnected(true);
      setError(null);
    });

    ros.on('error', (error: Error) => {
      setConnected(false);
      setError(error.message);
    });

    ros.on('close', () => {
      setConnected(false);
    });

    return () => {
      ros.close();
    };
  }, [setConnected, setError]);

  return rosRef;
}

export function useTopic<T = Record<string, unknown>>(
  topicName: string,
  messageType: string,
  onMessage: (msg: T) => void,
  throttleRate = 0,
) {
  const rosRef = useRosBridge();
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    if (!rosRef.current) return;

    const topic = new ROSLIB.Topic({
      ros: rosRef.current,
      name: topicName,
      messageType,
      throttle_rate: throttleRate,
    });

    topic.subscribe((message) => {
      onMessageRef.current(message as T);
    });

    return () => {
      topic.unsubscribe();
    };
  }, [topicName, messageType, throttleRate]);
}

export function useServiceCall(serviceName: string, serviceType: string) {
  const rosRef = useRosBridge();

  return useCallback(
    (request: Record<string, unknown>): Promise<Record<string, unknown>> => {
      return new Promise((resolve, reject) => {
        if (!rosRef.current) {
          reject(new Error('RosBridge not connected'));
          return;
        }
        const service = new ROSLIB.Service({
          ros: rosRef.current,
          name: serviceName,
          serviceType,
        });
        service.callService(
          new ROSLIB.ServiceRequest(request),
          (result) => resolve(result as Record<string, unknown>),
          (error) => reject(new Error(error)),
        );
      });
    },
    [serviceName, serviceType],
  );
}
