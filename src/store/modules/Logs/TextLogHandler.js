import exportFromJSON from 'export-from-json';

export const TextLogHandler = () => {
  function exportDataFromJSON(data, newFileName, fileExportType) {
    if (!data) return;
    try {
      const fileName = newFileName || 'exported-data';
      const exportType = exportFromJSON.types[fileExportType || 'json'];
      exportFromJSON({ data, fileName, exportType });
    } catch (e) {
      throw new Error('Parsing failed!');
    }
  }

  return {
    exportDataFromJSON,
  };
};
