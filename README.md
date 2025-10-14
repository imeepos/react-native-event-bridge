# React Native Event Bridge

This module lets native iOS/Android code dispatch an event that is handled inside React Native and receive a structured response. Each invocation carries an envelope with the shape `{ id: string, type: string, payload: object }` and is resolved/rejected once the JavaScript side responds.

## Features

- Single API surface for Android, iOS, and JavaScript.
- Promise-based native ↔ JS handshake with automatic correlation IDs.
- Optional error reporting back to native if no handler resolves the event.

## JavaScript API

```ts
import {addEventHandler, dispatch} from 'react-native-event-bridge';

// Handle native events.
const remove = addEventHandler(async ({type, payload}) => {
  if (type === 'collectUserInput') {
    const answer = await showPrompt(payload.question);
    return {answer};
  }

  // Returning undefined lets other handlers take over.
  return undefined;
});

// Optionally send an event to native and await a response.
const result = await dispatch('nativeCommand', {foo: 'bar'});
```

Handlers must return a plain object that will be passed back to native as the response payload. Throwing or returning a rejected promise will surface an error to native.

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

- If no JavaScript handler is registered, native receives a rejection with code `no_handler`.
- If handlers run but none returns a value, native receives `unhandled_event`.
- Exceptions thrown in handlers result in `handler_error`.

## Next Steps

- Add unit tests for your domain logic on the JavaScript side.
- Wrap the native dispatch helpers in whichever abstraction fits your app (e.g. a singleton service).
- Consider adding timeouts on the native callers if you need stronger guarantees about response times.
