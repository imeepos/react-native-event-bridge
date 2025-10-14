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

let cachedNativeBridge: typeof NativeModules.EventBridge | null | undefined;
let testingNativeBridge: typeof NativeModules.EventBridge | null | undefined;
let emitter: NativeEventEmitter | undefined;
const EVENT_NAME = 'EventBridgeEvent';

const handlersByType = new Map<string, EventHandler>();
let defaultHandler: EventHandler | undefined;
let subscription: EmitterSubscription | undefined;

function requireNativeBridge(): typeof NativeModules.EventBridge {
  const candidate =
    testingNativeBridge !== undefined
      ? testingNativeBridge
      : NativeModules.EventBridge ?? null;

  if (candidate !== cachedNativeBridge) {
    resetNativeBindings();
    cachedNativeBridge = candidate;
  }

  if (!candidate) {
    throw new Error(LINKING_ERROR);
  }
  return candidate;
}

function getEmitter(): NativeEventEmitter {
  if (!emitter) {
    emitter = new NativeEventEmitter(requireNativeBridge());
  }
  return emitter;
}

function ensureSubscription() {
  const shouldListen = handlersByType.size > 0 || defaultHandler != null;
  if (shouldListen && !subscription) {
    subscription = getEmitter().addListener(EVENT_NAME, handleIncoming);
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
  payload?: unknown;
}) {
  const event: IncomingEvent = {
    id: raw.id,
    type: raw.type,
    payload: ensureJsonObject(raw.payload ?? {}, 'incoming_payload'),
  };

  const bridge = requireNativeBridge();
  const handler = handlersByType.get(event.type) ?? defaultHandler;

  if (!handler) {
    bridge.reject(
      event.id,
      'no_handler',
      `未找到类型为 ${event.type} 的事件处理器`,
    );
    return;
  }

  try {
    const result = await handler(event);
    bridge.respond(event.id, ensureJsonObject(result, 'handler_result'));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : JSON.stringify(error);
    bridge.reject(event.id, 'handler_error', message);
  }
}

function ensureJsonObject(
  value: unknown,
  context: JsonContext,
): JsonObject {
  if (!isPlainRecord(value)) {
    throw new Error(describeJsonExpectation(context));
  }

  const record = value as Record<string, unknown>;
  assertJsonRecord(record, new Set<unknown>(), context);
  return record as JsonObject;
}

function assertJsonRecord(
  record: Record<string, unknown>,
  seen: Set<unknown>,
  context: JsonContext,
) {
  if (seen.has(record)) {
    throw new Error('数据存在循环引用，无法通过事件桥传递');
  }

  seen.add(record);
  for (const [key, entry] of Object.entries(record)) {
    if (entry === undefined) {
      throw new Error(
        `${describeJsonExpectation(context)}，属性 ${key} 的值为 undefined`,
      );
    }
    assertJsonValue(entry, seen, context);
  }
  seen.delete(record);
}

function assertJsonValue(
  value: unknown,
  seen: Set<unknown>,
  context: JsonContext,
): asserts value is JsonValue {
  if (value == null) {
    return;
  }

  switch (typeof value) {
    case 'string':
    case 'boolean':
      return;
    case 'number':
      if (Number.isFinite(value)) {
        return;
      }
      throw new Error(
        `${describeJsonExpectation(context)}，数值必须是有限数字`,
      );
    case 'object':
      break;
    default:
      throw new Error(
        `${describeJsonExpectation(context)}，不接受 ${typeof value} 类型`,
      );
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      throw new Error('数据存在循环引用，无法通过事件桥传递');
    }
    seen.add(value);
    for (const item of value) {
      assertJsonValue(item, seen, context);
    }
    seen.delete(value);
    return;
  }

  if (isPlainRecord(value)) {
    assertJsonRecord(value as Record<string, unknown>, seen, context);
    return;
  }

  throw new Error(describeJsonExpectation(context));
}

type JsonContext =
  | 'handler_result'
  | 'dispatch_payload'
  | 'incoming_payload';

function describeJsonExpectation(context: JsonContext): string {
  switch (context) {
    case 'handler_result':
      return '事件处理器必须返回可 JSON 序列化的普通对象';
    case 'dispatch_payload':
      return 'dispatch 的 payload 必须是可 JSON 序列化的普通对象';
    case 'incoming_payload':
      return '原生事件的 payload 必须是可 JSON 序列化的普通对象';
    default:
      return '数据必须是可 JSON 序列化的普通对象';
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  if (Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
/**
 * 为指定 type 注册一个事件处理器。注册后即开始监听原生事件。
 * 如果该 type 已存在处理器，需要先移除旧处理器再注册新的，以免无意覆盖。
 *
 * @returns 调用后移除当前处理器。
 */
export function setEventHandler(
  type: string,
  handler: EventHandler,
): () => void {
  const existing = handlersByType.get(type);
  if (existing && existing !== handler) {
    throw new Error(
      `类型 ${type} 的处理器已存在，请先移除旧处理器后再注册新的处理器`,
    );
  }
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
export function dispatch<TResult extends JsonObject>(
  type: string,
  payload?: undefined,
): Promise<TResult>;
export function dispatch<TPayload extends JsonObject, TResult extends JsonObject>(
  type: string,
  payload: TPayload,
): Promise<TResult>;
export function dispatch<TResult extends JsonObject>(
  type: string,
  payload?: JsonObject,
): Promise<TResult> {
  return requireNativeBridge().dispatch(
    type,
    ensureJsonObject(payload ?? {}, 'dispatch_payload'),
  );
}

export function setNativeBridgeForTesting(
  bridge: typeof NativeModules.EventBridge | null | undefined,
) {
  testingNativeBridge = bridge;
  cachedNativeBridge = bridge === undefined ? undefined : bridge;
  resetNativeBindings();
  if (handlersByType.size > 0 || defaultHandler != null) {
    ensureSubscription();
  }
}

function resetNativeBindings() {
  if (subscription) {
    subscription.remove();
    subscription = undefined;
  }
  emitter = undefined;
}
