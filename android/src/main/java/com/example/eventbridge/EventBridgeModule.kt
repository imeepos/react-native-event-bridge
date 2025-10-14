package com.example.eventbridge

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

class EventBridgeModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val pendingRequests = ConcurrentHashMap<String, PendingResponse>()

    override fun getName(): String = "EventBridge"

    /**
     * Dispatches an event to JavaScript and resolves the promise with the response provided by JS.
     *
     * @param type Event type identifier.
     * @param payload Arbitrary payload to pass through to JS.
     */
    @ReactMethod
    fun dispatch(type: String, payload: ReadableMap?, promise: Promise) {
        scheduleDispatch(type, payload, PendingResponse.PromisePending(promise))
    }

    /**
     * Called from JavaScript to deliver a response for a previously dispatched event.
     */
    @ReactMethod
    fun respond(id: String, result: ReadableMap?) {
        val resolver = pendingRequests.remove(id) ?: return
        resolver.resolve(result)
    }

    /**
     * Called from JavaScript to reject a pending event with an error payload.
     */
    @ReactMethod
    fun reject(id: String, code: String, message: String?) {
        val resolver = pendingRequests.remove(id) ?: return
        resolver.reject(code, message)
    }

    private fun emitEvent(params: WritableMap) {
        val emitter = reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        emitter.emit(EVENT_NAME, params)
    }

    companion object {
        private const val EVENT_NAME = "EventBridgeEvent"

        fun from(context: ReactContext): EventBridgeModule? {
            return context.getNativeModule(EventBridgeModule::class.java)
        }

        @JvmStatic
        fun dispatch(
            context: ReactContext,
            type: String,
            payload: WritableMap?,
            callback: EventBridgeCallback
        ) {
            val module = from(context)
                ?: throw IllegalStateException("EventBridge module is not registered")
            module.dispatchFromNative(type, payload, callback)
        }
    }

    /**
     * Dispatches an event from native code to JavaScript.
     */
    fun dispatchFromNative(
        type: String,
        payload: WritableMap?,
        callback: EventBridgeCallback
    ) {
        scheduleDispatch(type, payload, PendingResponse.CallbackPending(callback))
    }

    private fun scheduleDispatch(
        type: String,
        payload: ReadableMap?,
        pending: PendingResponse
    ) {
        val eventId = UUID.randomUUID().toString()
        pendingRequests[eventId] = pending

        val params = Arguments.createMap().apply {
            putString("type", type)
            putString("id", eventId)
            if (payload != null) {
                putMap("payload", payload)
            } else {
                putNull("payload")
            }
        }

        emitEvent(params)
    }

    private sealed interface PendingResponse {
        fun resolve(value: ReadableMap?)
        fun reject(code: String, message: String?)

        class PromisePending(
            private val promise: Promise
        ) : PendingResponse {
            override fun resolve(value: ReadableMap?) {
                promise.resolve(value)
            }

            override fun reject(code: String, message: String?) {
                promise.reject(code, message, null)
            }
        }

        class CallbackPending(
            private val callback: EventBridgeCallback
        ) : PendingResponse {
            override fun resolve(value: ReadableMap?) {
                callback.onResult(Result.success(value))
            }

            override fun reject(code: String, message: String?) {
                callback.onResult(
                    Result.failure(EventBridgeException(code, message))
                )
            }
        }
    }

    class EventBridgeException(
        val code: String,
        message: String?
    ) : Exception(message ?: code)

    fun interface EventBridgeCallback {
        fun onResult(result: Result<ReadableMap?>)
    }
}
