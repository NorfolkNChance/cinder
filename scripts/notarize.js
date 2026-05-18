/**
 * Post-sign notarization script for electron-builder.
 *
 * Requires environment variables:
 *   APPLE_ID            — your Apple ID email
 *   APPLE_APP_SPECIFIC_PASSWORD — an app-specific password for that Apple ID
 *   APPLE_TEAM_ID       — your 10-character Apple Developer Team ID
 *
 * Install @electron/notarize as a devDependency when you are ready to ship:
 *   npm install -D @electron/notarize
 */

const { notarize } = require('@electron/notarize');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') return;

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  console.log(`Notarizing ${appPath}…`);

  await notarize({
    tool: 'notarytool',
    appPath,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID,
  });
};
