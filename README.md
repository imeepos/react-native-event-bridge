# React Native Event Bridge

This module lets native iOS/Android code dispatch an event that is handled inside React Native and receive a structured response. Each invocation carries an envelope with the shape `{ id: string, type: string, payload: object }` and is resolved/rejected once the JavaScript side responds.

## Features

- Single API surface for Android, iOS, and JavaScript.
- Promise-based native ↔ JS handshake with automatic correlation IDs.
- Optional error reporting back to native if no handler resolves the event.

## JavaScript API

```ts
import {
  dispatch,
  setEventHandler,
  setDefaultHandler,
} from 'react-native-event-bridge';

// 为特定事件 type 注册处理器
const removeUserInputHandler = setEventHandler(
  'collectUserInput',
  async ({payload}) => {
    const answer = await showPrompt(payload.question);
    return {answer};
  },
);

// 或者配置一个兜底处理器
setDefaultHandler(async ({type}) => {
  return {message: `类型 ${type} 暂无专用处理器`};
});

// Optionally send an event to native and await a response.
const result = await dispatch('nativeCommand', {foo: 'bar'});
```

处理器需要返回一个普通对象以响应原生侧请求；如果抛出异常或返回 reject，将触发原生收到 `handler_error` 的拒绝信息。

## Android Integration

1. Register the package:

   ```kotlin
   override fun getPackages(): List<ReactPackage> = listOf(
       MainReactPackage(),
       EventBridgePackage(),
   )
   ```

2. From native Kotlin/Java, use the convenience helper to dispatch an event:

   ```kotlin
   val reactContext = reactNativeHost.reactInstanceManager.currentReactContext
       ?: return

   val payload = Arguments.createMap().apply {
       putString("question", "Ready?")
   }

   EventBridgeModule.dispatch(
       reactContext,
       type = "collectUserInput",
       payload = payload
   ) { result ->
       result
           .onSuccess { map ->
               val answer = map?.getString("answer")
               // handle success
           }
           .onFailure { error ->
               val bridgeError = error as? EventBridgeModule.EventBridgeException
               // bridgeError?.code contains the rejection code from JS
           }
   }
   ```

   The module emits an `EventBridgeEvent` for JavaScript and resolves once JS responds via `NativeModules.EventBridge.respond`.

## iOS Integration

1. Add the files under `ios/` to your Xcode project and make sure React headers are available (install pods if necessary).
2. From native Swift/Objective-C, call the static helper:

   ```swift
   EventBridge.dispatch(
     bridge: bridge,
     type: "collectUserInput",
     payload: ["question": "Ready?"]
   ) { result in
     switch result {
     case .success(let response):
       let answer = response?["answer"] as? String
     case .failure(let error):
       let code = (error as? EventBridge.EventBridgeError)?
         .userInfo["code"] as? String
     }
   }
   ```

The module emits the same `EventBridgeEvent`; JavaScript handlers reply via `NativeModules.EventBridge.respond(...)`, managed automatically by the helper above.

## Error Handling

- 若找不到匹配 type 的处理器（也未设置默认处理器），原生会收到 `no_handler`。
- JS 处理器抛出异常或返回非对象值时，原生会收到 `handler_error`，错误信息为异常 message。

## Next Steps

- Add unit tests for your domain logic on the JavaScript side.
- Wrap the native dispatch helpers in whichever abstraction fits your app (e.g. a singleton service).
- Consider adding timeouts on the native callers if you need stronger guarantees about response times.
