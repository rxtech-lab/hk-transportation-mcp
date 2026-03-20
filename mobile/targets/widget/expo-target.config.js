/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = config => ({
  type: "widget",
  entitlements: {
    "com.apple.security.application-groups": ["group.com.rxlab.hktransport"],
  },
});
