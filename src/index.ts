import {NativeEventEmitter, NativeModules} from 'react-native';

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
) => EventHandlerResult | undefined;

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

const handlers = new Set<EventHandler>();
let subscription = emitter.addListener(EVENT_NAME, handleIncoming);

function ensureSubscription() {
  if (subscription) {
    return;
  }
  subscription = emitter.addListener(EVENT_NAME, handleIncoming);
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

  if (handlers.size === 0) {
    NativeEventBridge.reject(event.id, 'no_handler', 'No handler registered');
    return;
  }

  for (const handler of Array.from(handlers)) {
    try {
      const result = await handler(event);
      if (result !== undefined) {
        NativeEventBridge.respond(event.id, ensureJsonObject(result));
        return;
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : JSON.stringify(error);
      NativeEventBridge.reject(event.id, 'handler_error', message);
      return;
    }
  }

  NativeEventBridge.reject(
    event.id,
    'unhandled_event',
    `No handler produced a response for type ${event.type}`,
  );
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
 * Registers a handler that will be invoked whenever native code dispatches an event.
 * The first handler that returns a non-undefined value resolves the native promise.
 *
 * @returns A function that removes the handler.
 */
export function addEventHandler(handler: EventHandler): () => void {
  handlers.add(handler);
  ensureSubscription();

  return () => {
    handlers.delete(handler);
    if (handlers.size === 0 && subscription) {
      subscription.remove();
      subscription = undefined;
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
