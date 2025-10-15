import { NativeModules } from 'react-native';
type JsonPrimitive = string | number | boolean | null;
type JsonArray = JsonValue[];
export type JsonObject = {
    [key: string]: JsonValue;
};
export type JsonValue = JsonPrimitive | JsonArray | JsonObject;
export interface IncomingEvent<TPayload extends JsonObject = JsonObject> {
    id: string;
    type: string;
    payload: TPayload;
}
export type EventHandlerResult = JsonObject | Promise<JsonObject>;
export type EventHandler<TPayload extends JsonObject = JsonObject> = (event: IncomingEvent<TPayload>) => EventHandlerResult;
/**
 * 为指定 type 注册一个事件处理器。注册后即开始监听原生事件。
 * 如果该 type 已存在处理器，需要先移除旧处理器再注册新的，以免无意覆盖。
 *
 * @returns 调用后移除当前处理器。
 */
export declare function setEventHandler(type: string, handler: EventHandler): () => void;
/**
 * 注册一个兜底处理器，当不存在匹配 type 的专用处理器时触发。
 * 传入 undefined 可以显式清除默认处理器。
 */
export declare function setDefaultHandler(handler: EventHandler | undefined): () => void;
/**
 * Dispatches an event from JavaScript to native code and awaits the response.
 * This provides a symmetrical API if you need to send events in the opposite direction.
 */
export declare function dispatch<TResult extends JsonObject>(type: string, payload?: undefined): Promise<TResult>;
export declare function dispatch<TPayload extends JsonObject, TResult extends JsonObject>(type: string, payload: TPayload): Promise<TResult>;
export declare function setNativeBridgeForTesting(bridge: typeof NativeModules.EventBridge | null | undefined): void;
export {};
//# sourceMappingURL=index.d.ts.map