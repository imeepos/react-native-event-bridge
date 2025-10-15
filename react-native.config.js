module.exports = {
  dependency: {
    platforms: {
      ios: {
        podspecPath: './react-native-event-bridge.podspec',
      },
      android: {
        sourceDir: './android',
        packageImportPath: 'com.example.eventbridge.EventBridgePackage',
        packageInstance: 'new EventBridgePackage()',
      },
    },
  },
};
