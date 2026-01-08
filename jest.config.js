export default {
  preset: '@vue/cli-plugin-unit-jest/presets/no-babel',
  transformIgnorePatterns: ['/node_modules/(?!(axios|@carbon|@novnc))'],
  setupFilesAfterEnv: ['<rootDir>/tests/jest.setup.js'],
};
