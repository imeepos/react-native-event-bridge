package com.example.eventbridge

import android.content.Context
import com.facebook.react.ReactInstanceManager
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class EventBridgePackage : ReactPackage {
    override fun createNativeModules(
        reactContext: ReactApplicationContext
    ): List<NativeModule> = listOf(EventBridgeModule(reactContext))

    override fun createViewManagers(
        reactContext: ReactApplicationContext
    ): List<ViewManager<*, *>> = emptyList()

    companion object {
        /**
         * Convenience helper to register the package with an existing instance manager.
         */
        fun register(manager: ReactInstanceManager) {
            manager.addPackage(EventBridgePackage())
        }

        /**
         * Helper for React Native New Architecture TurboModules/TurboPackages (placeholder).
         * This is a stub to show where you'd plug in codegen support.
         */
        fun loadIfNeeded(@Suppress("UNUSED_PARAMETER") context: Context) {
            // No-op placeholder for new architecture linking.
        }
    }
}
