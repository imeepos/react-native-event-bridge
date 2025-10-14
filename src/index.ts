import {NativeEventEmitter, NativeModules} from 'react-native';
import type {EmitterSubscription} from 'react-native';

type JsonPrimitive = string | number | boolean | null;
type JsonArray = JsonValue[];
export type JsonObject = {[key: string]: JsonValue};
export type JsonValue = JsonPrimitive | JsonArray | JsonObject;

export interface IncomingEvent<TPayload extends JsonObject = JsonObject> {
  id: string;
  type: string;
  payload: TPayload;
}

export type EventHandlerResult = JsonObject | Promise<JsonObject>;
export type EventHandler<TPayload extends JsonObject = JsonObject> = (
  event: IncomingEvent<TPayload>,
) => EventHandlerResult;

const LINKING_ERROR =
  "The package 'react-native-event-bridge' doesn't seem to be linked. Make sure:\n\n" +
  '- You have run `pod install`\n' +
  '- Rebuilt the app after installing the package\n' +
  '- You are not using Expo managed workflow\n';

const NativeEventBridge = NativeModules.EventBridge;

if (!NativeEventBridge) {
  throw new Error(LINKING_ERROR);
}

const emitter = new NativeEventEmitter(NativeEventBridge);
const EVENT_NAME = 'EventBridgeEvent';

const handlersByType = new Map<string, EventHandler>();
let defaultHandler: EventHandler | undefined;
let subscription: EmitterSubscription | undefined;

function ensureSubscription() {
  const shouldListen = handlersByType.size > 0 || defaultHandler != null;
  if (shouldListen && !subscription) {
    subscription = emitter.addListener(EVENT_NAME, handleIncoming);
    return;
  }
  if (!shouldListen && subscription) {
    subscription.remove();
    subscription = undefined;
  }
}

async function handleIncoming(raw: {
  id: string;
  type: string;
  payload?: JsonObject;
}) {
  const event: IncomingEvent = {
    id: raw.id,
    type: raw.type,
    payload: raw.payload ?? {},
  };

  const handler = handlersByType.get(event.type) ?? defaultHandler;

  if (!handler) {
    NativeEventBridge.reject(event.id, 'no_handler', 'No handler registered');
    return;
  }

  try {
    const result = await handler(event);
    NativeEventBridge.respond(event.id, ensureJsonObject(result));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : JSON.stringify(error);
    NativeEventBridge.reject(event.id, 'handler_error', message);
  }
}

function ensureJsonObject(value: unknown): JsonObject {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new Error('Handler must return a plain object');
  }
  return value as JsonObject;
}
/**
 * 为指定 type 注册一个事件处理器。注册后即开始监听原生事件。
 *
 * @returns 调用后移除当前处理器。
 */
export function setEventHandler(
  type: string,
  handler: EventHandler,
): () => void {
  handlersByType.set(type, handler);
  ensureSubscription();

  return () => {
    const current = handlersByType.get(type);
    if (current === handler) {
      handlersByType.delete(type);
      ensureSubscription();
    }
  };
}

/**
 * 注册一个兜底处理器，当不存在匹配 type 的专用处理器时触发。
 * 传入 undefined 可以显式清除默认处理器。
 */
export function setDefaultHandler(handler: EventHandler | undefined): () => void {
  defaultHandler = handler ?? undefined;
  ensureSubscription();

  return () => {
    if (defaultHandler === handler) {
      defaultHandler = undefined;
      ensureSubscription();
    }
  };
}

/**
 * Dispatches an event from JavaScript to native code and awaits the response.
 * This provides a symmetrical API if you need to send events in the opposite direction.
 */
export function dispatch<TPayload extends JsonObject, TResult extends JsonObject>(
  type: string,
  payload: TPayload,
): Promise<TResult> {
  return NativeEventBridge.dispatch(type, ensureJsonObject(payload));
}
