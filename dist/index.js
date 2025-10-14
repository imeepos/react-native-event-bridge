"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setEventHandler = setEventHandler;
exports.setDefaultHandler = setDefaultHandler;
exports.dispatch = dispatch;
exports.setNativeBridgeForTesting = setNativeBridgeForTesting;
const react_native_1 = require("react-native");
const LINKING_ERROR = "The package 'react-native-event-bridge' doesn't seem to be linked. Make sure:\n\n" +
    '- You have run `pod install`\n' +
    '- Rebuilt the app after installing the package\n' +
    '- You are not using Expo managed workflow\n';
let cachedNativeBridge;
let testingNativeBridge;
let emitter;
const EVENT_NAME = 'EventBridgeEvent';
const handlersByType = new Map();
let defaultHandler;
let subscription;
function requireNativeBridge() {
    var _a;
    const candidate = testingNativeBridge !== undefined
        ? testingNativeBridge
        : (_a = react_native_1.NativeModules.EventBridge) !== null && _a !== void 0 ? _a : null;
    if (candidate !== cachedNativeBridge) {
        resetNativeBindings();
        cachedNativeBridge = candidate;
    }
    if (!candidate) {
        throw new Error(LINKING_ERROR);
    }
    return candidate;
}
function getEmitter() {
    if (!emitter) {
        emitter = new react_native_1.NativeEventEmitter(requireNativeBridge());
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
async function handleIncoming(raw) {
    var _a, _b;
    const event = {
        id: raw.id,
        type: raw.type,
        payload: ensureJsonObject((_a = raw.payload) !== null && _a !== void 0 ? _a : {}, 'incoming_payload'),
    };
    const bridge = requireNativeBridge();
    const handler = (_b = handlersByType.get(event.type)) !== null && _b !== void 0 ? _b : defaultHandler;
    if (!handler) {
        bridge.reject(event.id, 'no_handler', `未找到类型为 ${event.type} 的事件处理器`);
        return;
    }
    try {
        const result = await handler(event);
        bridge.respond(event.id, ensureJsonObject(result, 'handler_result'));
    }
    catch (error) {
        const message = error instanceof Error ? error.message : JSON.stringify(error);
        bridge.reject(event.id, 'handler_error', message);
    }
}
function ensureJsonObject(value, context) {
    if (!isPlainRecord(value)) {
        throw new Error(describeJsonExpectation(context));
    }
    const record = value;
    assertJsonRecord(record, new Set(), context);
    return record;
}
function assertJsonRecord(record, seen, context) {
    if (seen.has(record)) {
        throw new Error('数据存在循环引用，无法通过事件桥传递');
    }
    seen.add(record);
    for (const [key, entry] of Object.entries(record)) {
        if (entry === undefined) {
            throw new Error(`${describeJsonExpectation(context)}，属性 ${key} 的值为 undefined`);
        }
        assertJsonValue(entry, seen, context);
    }
    seen.delete(record);
}
function assertJsonValue(value, seen, context) {
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
            throw new Error(`${describeJsonExpectation(context)}，数值必须是有限数字`);
        case 'object':
            break;
        default:
            throw new Error(`${describeJsonExpectation(context)}，不接受 ${typeof value} 类型`);
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
        assertJsonRecord(value, seen, context);
        return;
    }
    throw new Error(describeJsonExpectation(context));
}
function describeJsonExpectation(context) {
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
function isPlainRecord(value) {
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
function setEventHandler(type, handler) {
    const existing = handlersByType.get(type);
    if (existing && existing !== handler) {
        throw new Error(`类型 ${type} 的处理器已存在，请先移除旧处理器后再注册新的处理器`);
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
function setDefaultHandler(handler) {
    defaultHandler = handler !== null && handler !== void 0 ? handler : undefined;
    ensureSubscription();
    return () => {
        if (defaultHandler === handler) {
            defaultHandler = undefined;
            ensureSubscription();
        }
    };
}
function dispatch(type, payload) {
    return requireNativeBridge().dispatch(type, ensureJsonObject(payload !== null && payload !== void 0 ? payload : {}, 'dispatch_payload'));
}
function setNativeBridgeForTesting(bridge) {
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
