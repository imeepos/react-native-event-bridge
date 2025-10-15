"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withEventBridge = void 0;
const config_plugins_1 = require("@expo/config-plugins");
const generateCode_1 = require("@expo/config-plugins/build/utils/generateCode");
const pkg = require('../../package.json');
const ANDROID_IMPORT = 'com.example.eventbridge.EventBridgePackage';
const ANDROID_PACKAGE_INSTANCE_KOTLIN = 'add(EventBridgePackage())';
const ANDROID_PACKAGE_INSTANCE_JAVA = 'packages.add(new EventBridgePackage());';
const withAndroidMainApplication = config => (0, config_plugins_1.withMainApplication)(config, mod => {
    const { language } = mod.modResults;
    let contents = mod.modResults.contents;
    contents = ensureAndroidImport(contents, language);
    contents = ensureAndroidPackageRegistration(contents, language);
    mod.modResults.contents = contents;
    return mod;
});
function ensureAndroidImport(contents, language) {
    if (contents.includes(ANDROID_IMPORT)) {
        return contents;
    }
    const comment = language === 'java' ? '//' : '//';
    const results = (0, generateCode_1.mergeContents)({
        tag: 'react-native-event-bridge-import',
        src: contents,
        newSrc: `import ${ANDROID_IMPORT}`,
        anchor: /package [\w.]+;?/,
        offset: 1,
        comment,
    });
    if (!results.didMerge) {
        return [contents, `import ${ANDROID_IMPORT}`].join('\n');
    }
    return results.contents;
}
function ensureAndroidPackageRegistration(contents, language) {
    if (language === 'kt') {
        if (contents.includes(ANDROID_PACKAGE_INSTANCE_KOTLIN)) {
            return contents;
        }
        if (contents.includes('PackageList(this).packages.apply')) {
            const results = (0, generateCode_1.mergeContents)({
                tag: 'react-native-event-bridge-package',
                src: contents,
                newSrc: `      ${ANDROID_PACKAGE_INSTANCE_KOTLIN}`,
                anchor: /PackageList\(this\)\.packages\.apply\s*\{/,
                offset: 1,
                comment: '//',
            });
            if (results.didMerge) {
                return results.contents;
            }
        }
        return contents.replace(/PackageList\(this\)\.packages\b/, match => `${match}.apply {\n      ${ANDROID_PACKAGE_INSTANCE_KOTLIN}\n    }`);
    }
    if (contents.includes(ANDROID_PACKAGE_INSTANCE_JAVA)) {
        return contents;
    }
    return contents.replace(/(List<ReactPackage>\s+packages\s*=\s*new PackageList\(this\)\.getPackages\(\);\s*)/, (_, statement) => `${statement}    ${ANDROID_PACKAGE_INSTANCE_JAVA}\n`);
}
const withEventBridge = config => {
    config = withAndroidMainApplication(config);
    return config;
};
exports.withEventBridge = withEventBridge;
exports.default = (0, config_plugins_1.createRunOncePlugin)(withEventBridge, pkg.name, pkg.version);
