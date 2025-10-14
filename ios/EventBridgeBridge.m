#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(EventBridge, RCTEventEmitter)

RCT_EXTERN_METHOD(dispatch:(NSString *)type
                  payload:(NSDictionary * _Nullable)payload
                  resolver:(RCTPromiseResolveBlock)resolver
                  rejecter:(RCTPromiseRejectBlock)rejecter)

RCT_EXTERN_METHOD(respond:(NSString *)id
                  result:(NSDictionary * _Nullable)result)

RCT_EXTERN_METHOD(reject:(NSString *)id
                  code:(NSString *)code
                  message:(NSString * _Nullable)message)

@end
