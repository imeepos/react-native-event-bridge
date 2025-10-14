import Foundation
import React

@objc(EventBridge)
class EventBridge: RCTEventEmitter {
    private var pendingRequests = [String: PendingRequest]()

    override static func requiresMainQueueSetup() -> Bool {
        // This module does not require being initialized on the main thread.
        return false
    }

    override func supportedEvents() -> [String]! {
        return [Self.eventName]
    }

    @objc(dispatch:payload:resolver:rejecter:)
    func dispatch(
        type: String,
        payload: [String: Any]?,
        resolver: @escaping RCTPromiseResolveBlock,
        rejecter: @escaping RCTPromiseRejectBlock
    ) {
        let eventId = UUID().uuidString
        let pending = PendingRequest(
            resolve: { value in
                resolver(value ?? NSNull())
            },
            reject: { code, message in
                rejecter(code, message, nil)
            }
        )
        pendingRequests[eventId] = pending

        var body: [String: Any] = [
            "type": type,
            "id": eventId
        ]
        body["payload"] = payload ?? NSNull()

        sendEvent(withName: Self.eventName, body: body)
    }

    @objc(respond:result:)
    func respond(id: String, result: [String: Any]?) {
        guard let pending = pendingRequests.removeValue(forKey: id) else {
            return
        }
        pending.resolve(result)
    }

    @objc(reject:code:message:)
    func reject(id: String, code: String, message: String?) {
        guard let pending = pendingRequests.removeValue(forKey: id) else {
            return
        }
        pending.reject(code, message)
    }

    private static let eventName = "EventBridgeEvent"

    /// Dispatches an event to React Native from Swift/Objective-C.
    func dispatchFromNative(
        type: String,
        payload: [String: Any]?,
        completion: @escaping (Result<[String: Any]?, Error>) -> Void
    ) {
        let eventId = UUID().uuidString
        let pending = PendingRequest(
            resolve: { value in
                completion(.success(value))
            },
            reject: { code, message in
                completion(.failure(EventBridgeError(code: code, message: message)))
            }
        )
        pendingRequests[eventId] = pending

        var body: [String: Any] = [
            "type": type,
            "id": eventId
        ]
        body["payload"] = payload ?? NSNull()

        sendEvent(withName: Self.eventName, body: body)
    }

    @objc
    static func dispatch(
        bridge: RCTBridge,
        type: String,
        payload: [String: Any]?,
        completion: @escaping (Result<[String: Any]?, Error>) -> Void
    ) {
        guard let module = bridge.module(forName: "EventBridge") as? EventBridge else {
            completion(.failure(EventBridgeError(code: "module_not_found", message: nil)))
            return
        }

        module.dispatchFromNative(type: type, payload: payload, completion: completion)
    }

    private class PendingRequest {
        let resolve: ([String: Any]?) -> Void
        let reject: (String, String?) -> Void

        init(
            resolve: @escaping ([String: Any]?) -> Void,
            reject: @escaping (String, String?) -> Void
        ) {
            self.resolve = resolve
            self.reject = reject
        }
    }

    class EventBridgeError: NSError {
        init(code: String, message: String?) {
            super.init(
                domain: "EventBridge",
                code: 0,
                userInfo: [
                    NSLocalizedDescriptionKey: message ?? code,
                    "code": code
                ].compactMapValues { $0 }
            )
        }

        var code: String {
            return userInfo["code"] as? String ?? "unknown"
        }

        required init?(coder: NSCoder) {
            super.init(coder: coder)
        }
    }
}
