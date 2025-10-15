import type {ConfigPlugin} from '@expo/config-plugins';
import {
  createRunOncePlugin,
  withMainApplication,
} from '@expo/config-plugins';
import {mergeContents} from '@expo/config-plugins/build/utils/generateCode';

const pkg = require('../../package.json');

const ANDROID_IMPORT = 'com.example.eventbridge.EventBridgePackage';
const ANDROID_PACKAGE_INSTANCE_KOTLIN = 'add(EventBridgePackage())';
const ANDROID_PACKAGE_INSTANCE_JAVA =
  'packages.add(new EventBridgePackage());';

const withAndroidMainApplication: ConfigPlugin = config =>
  withMainApplication(config, mod => {
    const {language} = mod.modResults;
    let contents = mod.modResults.contents;

    contents = ensureAndroidImport(contents, language);
    contents = ensureAndroidPackageRegistration(contents, language);

    mod.modResults.contents = contents;
    return mod;
  });

function ensureAndroidImport(
  contents: string,
  language: 'java' | 'kt',
): string {
  if (contents.includes(ANDROID_IMPORT)) {
    return contents;
  }

  const comment = language === 'java' ? '//' : '//';
  const results = mergeContents({
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

function ensureAndroidPackageRegistration(
  contents: string,
  language: 'java' | 'kt',
): string {
  if (language === 'kt') {
    if (contents.includes(ANDROID_PACKAGE_INSTANCE_KOTLIN)) {
      return contents;
    }

    if (contents.includes('PackageList(this).packages.apply')) {
      const results = mergeContents({
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

    return contents.replace(
      /PackageList\(this\)\.packages\b/,
      match =>
        `${match}.apply {\n      ${ANDROID_PACKAGE_INSTANCE_KOTLIN}\n    }`,
    );
  }

  if (contents.includes(ANDROID_PACKAGE_INSTANCE_JAVA)) {
    return contents;
  }

  return contents.replace(
    /(List<ReactPackage>\s+packages\s*=\s*new PackageList\(this\)\.getPackages\(\);\s*)/,
    (_, statement: string) =>
      `${statement}    ${ANDROID_PACKAGE_INSTANCE_JAVA}\n`,
  );
}

const withEventBridge: ConfigPlugin = config => {
  config = withAndroidMainApplication(config);
  return config;
};

export default createRunOncePlugin(
  withEventBridge,
  pkg.name,
  pkg.version,
);
export {withEventBridge};
