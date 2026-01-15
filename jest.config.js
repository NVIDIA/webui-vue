module.exports = {
  preset: '@vue/cli-plugin-unit-jest',
  transformIgnorePatterns: ['/node_modules/(?!(axios|@carbon|@novnc))'],
  setupFilesAfterEnv: ['<rootDir>/tests/jest.setup.js'],
};
